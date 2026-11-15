import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { MADDOX_SKILLS } from "../check-modifier"
import {
    MADDOX_CHECK_EFFECTS_MAX,
    MADDOX_CHECK_EFFECT_NAME_MAX,
    checkEffectEntry,
    checkEffectKey,
    checkEffectLabel,
    checkEffectSchema,
    effectsForCheck,
    mentionsSkillChoice,
    normalizeEffectText,
    parseCheckEffectQuote,
    readCheckEffects,
    type MaddoxCheckEffect,
    type MaddoxCheckEffectEntry,
    type MaddoxCheckEffectSpec,
} from "../check-effects"
import { MADDOX_SHEET_AUDIT_ENTITY, MADDOX_SHEET_RIGORS } from "../constants"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign } from "../models"
import type { TacticalCombat } from "./tactical-combat"

/**
 * Efeitos de teste (DND-69) — SOMENTE servidor. `apply_check_effect` (narração, "Pergunte ao mestre" e lembrete) grava na
 * ficha de quem recebe o efeito (`checkEffects`) uma magia ou um recurso de classe que soma dados aos testes, depois de
 * conferir a ficha de quem usa (a magia na lista de magias, ligada ao catálogo; o recurso com carga) e o trecho do
 * catálogo (o dado e o tipo de teste saem dele). Magia de círculo 1+ gasta o espaço; recurso gasta a carga. A rolagem
 * (`rollCheck`) relê os efeitos e soma cada um como dado próprio. Tudo que muda vira linha `sheet-change` na mesa, e toda
 * recusa também (o jogador e o mestre veem o motivo). Os efeitos valem até o Maddox encerrar (`end_check_effect`), até
 * um descanso concluído, até outra concentração de quem conjurou ou, nos recursos de uso único, até o primeiro teste.
 */

const log = loggerFor({ module: "maddox", feature: "check-effects" })

export class CheckEffectError extends Error {}

type CampaignRow = Pick<IMaddoxCampaign, "_id" | "rigor" | "ownerId" | "turn">
interface CharacterRow {
    _id: Types.ObjectId
    name: string
    status: string
    sheetId: Types.ObjectId | null
}
type SheetRow = { _id: Types.ObjectId; checkEffects?: unknown; spellSlots?: unknown; resourceCharges?: unknown }

export interface CheckEffectContext {
    campaignId: Types.ObjectId | string
    turnNumber?: number | null
    origin: "narrator" | "question"
    requestedBy?: string | null
}

export interface ApplyCheckEffectRequest extends CheckEffectContext {
    /** Quem recebe o efeito. */
    characterName: string
    /** Quem conjura ou usa o recurso (padrão: quem recebe). */
    casterName?: string | null
    source: { kind: "spell" | "resource"; name: string }
    /** Perícia escolhida, quando o catálogo manda escolher (Orientação). */
    skill?: string | null
    /** Trecho literal do catálogo com o dado e o tipo de teste. */
    quote: string
    reason: string
}

export interface CheckEffectState {
    personagem: string
    efeitos: string[]
    linha: string
}

const plain = (value: unknown) =>
    String(value ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()

const sheetModel = async () => (await import("@/features/character-sheets/models/character-sheet")).CharacterSheet

async function loadCampaign(campaignId: Types.ObjectId): Promise<CampaignRow> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("rigor ownerId turn").lean<CampaignRow>()
    if (!campaign) throw new CheckEffectError("Campanha não encontrada.")
    if (!MADDOX_SHEET_RIGORS.includes(campaign.rigor)) throw new CheckEffectError("Esta campanha é narrativa: não há testes com ficha.")
    return campaign
}

async function campaignCharacters(campaignId: Types.ObjectId): Promise<CharacterRow[]> {
    return MaddoxCharacterModel.find({ campaignId, status: { $in: ["active", "dead"] } }).select("name status sheetId").lean<CharacterRow[]>()
}

function characterByName(characters: readonly CharacterRow[], name: string): CharacterRow & { sheetId: Types.ObjectId } {
    const character = characters.find((item) => checkEffectKey(item.name) === checkEffectKey(name))
    if (!character) throw new CheckEffectError(`Nenhum personagem jogador chamado "${name}". Personagens: ${characters.map((item) => item.name).join(", ") || "nenhum"}.`)
    if (character.status === "dead") throw new CheckEffectError(`${character.name} está morto.`)
    if (!character.sheetId) throw new CheckEffectError(`${character.name} não tem ficha.`)
    return character as CharacterRow & { sheetId: Types.ObjectId }
}

async function readSheet(sheetId: Types.ObjectId): Promise<SheetRow | null> {
    const CharacterSheet = await sheetModel()
    return (await CharacterSheet.collection.findOne({ _id: sheetId }, { projection: { checkEffects: 1, spellSlots: 1, resourceCharges: 1 } })) as SheetRow | null
}

/** Grava a lista nova só se ela ainda for a lida (driver: o filtro compara o array inteiro). */
async function writeEffects(sheetId: Types.ObjectId, raw: unknown, next: MaddoxCheckEffect[]): Promise<boolean> {
    const CharacterSheet = await sheetModel()
    const filter: Record<string, unknown> = { _id: sheetId, checkEffects: raw === undefined ? { $exists: false } : raw }
    const updated = await CharacterSheet.collection.updateOne(filter, { $set: { checkEffects: next, updatedAt: new Date() } })
    return updated.modifiedCount > 0
}

/** Todos os textos de uma entidade do catálogo (descrição, tabelas, níveis), normalizados. */
function entityText(entity: unknown): string {
    const parts: string[] = []
    const walk = (value: unknown, depth: number) => {
        if (depth > 5 || value == null) return
        if (typeof value === "string") parts.push(value)
        else if (Array.isArray(value)) value.forEach((item) => walk(item, depth + 1))
        else if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => walk(item, depth + 1))
    }
    walk(entity, 0)
    return normalizeEffectText(parts.join(" \n "))
}

async function catalogEntity(type: "Magia" | "Habilidade" | "Talento" | "Item", id: string): Promise<Record<string, unknown> | null> {
    const { getCatalogEntity } = await import("@/features/mcp/server/catalog-entity-service")
    return ((await getCatalogEntity({ type, id })) as Record<string, unknown> | null) ?? null
}

const QUOTE_MIN_WORDS = 3

/** Confere o trecho no texto da entidade e lê o dado. */
function confirmQuote(entity: Record<string, unknown>, quote: string): ReturnType<typeof parseCheckEffectQuote> {
    const wanted = normalizeEffectText(quote)
    if (!wanted || wanted.split(" ").length < QUOTE_MIN_WORDS) return "o trecho citado é curto demais para confirmar a regra"
    const full = entityText(entity)
    if (!full.includes(wanted)) return "o trecho citado não está no texto do catálogo"
    const parsed = parseCheckEffectQuote(quote)
    // A restrição da perícia vem da entidade inteira: o trecho curto não a solta (DND-69, revisão F1).
    return typeof parsed === "string" ? parsed : { ...parsed, requiresSkill: parsed.requiresSkill || mentionsSkillChoice(full) }
}

interface SourceResolution {
    name: string
    ref: string
    concentration: boolean
    singleUse: boolean
    duration: string
    personal: boolean
    /** Gasto na ficha de quem usa (feito só depois de tudo conferido). */
    spend: (() => Promise<string | null>) | null
    spendText: string | null
}

async function resolveSpell(caster: CharacterRow & { sheetId: Types.ObjectId }, name: string): Promise<SourceResolution & { entity: Record<string, unknown> }> {
    const { CharacterSpell } = await import("@/features/character-sheets/models/character-spell")
    const spells = (await CharacterSpell.collection.find({ sheetId: caster.sheetId }).toArray()) as unknown as { _id: Types.ObjectId; name?: string; catalogSpellId?: Types.ObjectId | null; circle?: number | null; prepared?: boolean }[]
    const wanted = checkEffectKey(plain(name))
    const spell = spells.find((item) => checkEffectKey(plain(item.name)) === wanted)
    if (!spell) throw new CheckEffectError(`${plain(name)} não está na lista de magias da ficha de ${caster.name}.`)
    if (!spell.catalogSpellId) throw new CheckEffectError(`${plain(spell.name)} está na ficha de ${caster.name} sem ligação com o catálogo do DnDicas: não há regra para confirmar o efeito.`)
    const entity = await catalogEntity("Magia", String(spell.catalogSpellId))
    if (!entity) throw new CheckEffectError(`${plain(spell.name)} não está no catálogo do DnDicas (ou está inativa).`)
    const circle = Number(entity.circle ?? spell.circle ?? 0) || 0
    const components = Array.isArray(entity.component) ? entity.component.map((item) => String(item)) : []
    const duration = plain(entity.duration) || "conforme o catálogo"
    const concentration = components.some((item) => checkEffectKey(item) === "concentracao") || checkEffectKey(duration).startsWith("concentracao")
    const personal = checkEffectKey(plain(entity.range)) === "pessoal"
    if (circle > 0 && !spell.prepared) throw new CheckEffectError(`${plain(spell.name)} não está preparada na ficha de ${caster.name}.`)
    const spendSlot = async (): Promise<string | null> => {
        if (circle <= 0) return null
        const CharacterSheet = await sheetModel()
        const sheet = (await CharacterSheet.collection.findOne({ _id: caster.sheetId }, { projection: { spellSlots: 1 } })) as { spellSlots?: Record<string, { total?: number; used?: number }> } | null
        const slot = sheet?.spellSlots?.[String(circle)]
        const total = Number(slot?.total ?? 0)
        const used = Number(slot?.used ?? 0)
        if (total - used < 1) return `${caster.name} não tem espaço de magia de círculo ${circle} livre`
        const updated = await CharacterSheet.collection.updateOne({ _id: caster.sheetId, [`spellSlots.${circle}.used`]: used }, { $set: { [`spellSlots.${circle}.used`]: used + 1, updatedAt: new Date() } })
        return updated.modifiedCount ? null : "a ficha mudou agora há pouco; tente de novo"
    }
    return {
        entity,
        name: plain(entity.name) || plain(spell.name),
        ref: `Magia:${String(spell.catalogSpellId)}`,
        concentration,
        singleUse: false,
        duration,
        personal,
        spend: circle > 0 ? spendSlot : null,
        spendText: circle > 0 ? `espaço de círculo ${circle} gasto` : null,
    }
}

type Charge = { id: string; name?: string; total?: number; used?: number; source?: { entityType?: string; entityId?: string } | null }

async function resolveResource(caster: CharacterRow & { sheetId: Types.ObjectId }, sheet: SheetRow, name: string): Promise<SourceResolution & { entity: Record<string, unknown> }> {
    const charges = (Array.isArray(sheet.resourceCharges) ? sheet.resourceCharges : []) as Charge[]
    const wanted = checkEffectKey(plain(name))
    const charge = charges.find((item) => checkEffectKey(plain(item.name)) === wanted) ?? charges.find((item) => checkEffectKey(plain(item.name)).includes(wanted))
    if (!charge) throw new CheckEffectError(`${plain(name)} não é um recurso com usos na ficha de ${caster.name}. Recursos: ${charges.map((item) => plain(item.name)).join(", ") || "nenhum"}.`)
    const type = charge.source?.entityType
    if (!charge.source?.entityId || (type !== "Habilidade" && type !== "Talento" && type !== "Item")) throw new CheckEffectError(`${plain(charge.name)} está na ficha de ${caster.name} sem ligação com o catálogo do DnDicas: não há regra para confirmar o efeito.`)
    const entity = await catalogEntity(type, charge.source.entityId)
    if (!entity) throw new CheckEffectError(`${plain(charge.name)} não está no catálogo do DnDicas (ou está inativa).`)
    const used = Number(charge.used ?? 0)
    if (Number(charge.total ?? 0) - used < 1) throw new CheckEffectError(`${caster.name} não tem mais usos de ${plain(charge.name)} (${used}/${Number(charge.total ?? 0)}).`)
    const spend = async (): Promise<string | null> => {
        const CharacterSheet = await sheetModel()
        const updated = await CharacterSheet.collection.updateOne({ _id: caster.sheetId, resourceCharges: { $elemMatch: { id: charge.id, used } } }, { $set: { "resourceCharges.$.used": used + 1, updatedAt: new Date() } })
        return updated.modifiedCount ? null : "a ficha mudou agora há pouco; tente de novo"
    }
    return { entity, name: plain(charge.name), ref: `${type}:${charge.source.entityId}`, concentration: false, singleUse: true, duration: "até o primeiro teste em que entrar", personal: false, spend, spendText: `1 uso de ${plain(charge.name)} gasto` }
}

async function addLine(campaign: CampaignRow, character: CharacterRow, line: string, context: Pick<CheckEffectContext, "turnNumber" | "origin">): Promise<void> {
    await MaddoxCampaignMessageModel.create({
        campaignId: campaign._id,
        turnNumber: context.turnNumber ?? campaign.turn?.number ?? 0,
        phase: campaign.turn?.phase ?? (context.origin === "question" ? "players" : "master"),
        kind: "sheet-change",
        characterId: character._id,
        characterName: character.name,
        content: line,
    })
}

async function audit(campaign: CampaignRow, sheetId: Types.ObjectId, context: CheckEffectContext, before: unknown, after: unknown, extra: Record<string, unknown>): Promise<void> {
    await recordAudit({
        userId: context.requestedBy ?? campaign.ownerId,
        entidade: MADDOX_SHEET_AUDIT_ENTITY,
        entidadeId: String(sheetId),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { checkEffects: before },
        depois: { by: "maddox", origin: context.origin, requestedBy: context.requestedBy ?? null, campaign: String(campaign._id), checkEffects: after, ...extra },
    }).catch((error: unknown) => log.warn({ err: error instanceof Error ? error.message : String(error), sheetId: String(sheetId) }, "[maddox] auditoria do efeito de teste falhou"))
}

async function publish(campaignId: Types.ObjectId, sheetIds: readonly Types.ObjectId[]): Promise<void> {
    try {
        const { publishPatched } = await import("./combat-sheet")
        for (const id of sheetIds) await publishPatched(String(id))
        const { publishGameChanged } = await import("./game")
        await publishGameChanged(campaignId)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] aviso da mesa falhou depois do efeito de teste")
    }
}

/**
 * Aplica um efeito de teste. Recusa = `CheckEffectError` com o motivo; quando o personagem existe, a recusa também vira
 * linha na mesa ("Orientação não entrou para Lizwan: …").
 */
export async function applyCheckEffect(request: ApplyCheckEffectRequest): Promise<CheckEffectState> {
    const campaignId = new Types.ObjectId(String(request.campaignId))
    const reason = request.reason.trim()
    if (!reason) throw new CheckEffectError("Informe o motivo do efeito de teste.")
    const campaign = await loadCampaign(campaignId)
    const characters = await campaignCharacters(campaignId)
    const target = characterByName(characters, request.characterName)
    const label = plain(request.source.name) || "O efeito"
    const refuse = async (why: string): Promise<never> => {
        const line = `${label} não entrou para ${target.name}: ${why}.`
        await addLine(campaign, target, line, request)
        log.info({ campaignId: String(campaignId), character: target.name, source: label, why, origin: request.origin }, "[maddox] efeito de teste recusado")
        await publish(campaignId, [])
        throw new CheckEffectError(`${line} Narre que não funcionou (ou peça o teste sem o efeito).`)
    }
    try {
        const caster = request.casterName?.trim() ? characterByName(characters, request.casterName) : target
        const casterSheet = await readSheet(caster.sheetId)
        if (!casterSheet) return await refuse(`a ficha de ${caster.name} não foi encontrada`)
        const source = request.source.kind === "spell" ? await resolveSpell(caster, request.source.name) : await resolveResource(caster, casterSheet, request.source.name)
        if (source.personal && String(caster._id) !== String(target._id)) return await refuse(`${source.name} tem alcance Pessoal no catálogo: só vale em quem conjura (${caster.name})`)
        const parsed = confirmQuote(source.entity, request.quote)
        if (typeof parsed === "string") return await refuse(`${parsed} (${source.name})`)
        let skill: string | null = null
        if (parsed.requiresSkill) {
            const wanted = checkEffectKey(request.skill ?? "")
            skill = MADDOX_SKILLS.find((item) => checkEffectKey(item) === wanted) ?? null
            if (!skill) return await refuse(`${source.name} vale numa perícia escolhida: informe a perícia (${MADDOX_SKILLS.join(", ")})`)
        }
        const effect = checkEffectSchema.parse({
            id: randomUUID(),
            name: source.name.slice(0, MADDOX_CHECK_EFFECT_NAME_MAX),
            dice: parsed.dice,
            kinds: parsed.kinds,
            skill,
            singleUse: source.singleUse,
            concentration: source.concentration,
            casterCharacterId: String(caster._id),
            casterName: caster.name,
            duration: source.duration.slice(0, 200),
            source: { kind: request.source.kind, ref: source.ref, quote: request.quote.trim().slice(0, 2_000) },
            campaignId: String(campaignId),
            turnNumber: request.turnNumber ?? campaign.turn?.number ?? 0,
            createdAt: new Date().toISOString(),
        })
        const sheetRow = String(target.sheetId) === String(caster.sheetId) ? casterSheet : await readSheet(target.sheetId)
        if (!sheetRow) return await refuse(`a ficha de ${target.name} não foi encontrada`)
        const before = readCheckEffects(sheetRow.checkEffects)
        // Mesmo nome = o mesmo efeito, não acumula (a nova conjuração substitui).
        const kept = before.filter((item) => checkEffectKey(item.name) !== checkEffectKey(effect.name))
        if (kept.length >= MADDOX_CHECK_EFFECTS_MAX) return await refuse(`${target.name} já tem ${MADDOX_CHECK_EFFECTS_MAX} efeitos de teste ativos`)
        // Grava o efeito ANTES de gastar o espaço ou o uso: falha na gravação não gasta nada; falha no gasto desfaz o efeito.
        const list = [...kept, effect]
        if (!(await writeEffects(target.sheetId, sheetRow.checkEffects, list))) throw new CheckEffectError("A ficha mudou agora há pouco: tente outra vez.")
        if (source.spend) {
            const spent = await source.spend().catch((error: unknown) => (error instanceof Error ? error.message : String(error)))
            if (spent) {
                await revertEffects(target.sheetId, list, sheetRow.checkEffects, effect.id)
                return await refuse(spent)
            }
        }
        // Uma concentração por conjurador: a anterior (em qualquer personagem) termina.
        const ended = effect.concentration ? await endOtherConcentration(campaign, characters, effect) : []
        const line = `Efeito de teste em ${target.name}: ${checkEffectLabel(effect)}${caster._id.equals(target._id) ? "" : `, de ${caster.name}`}${source.spendText ? `; ${source.spendText}` : ""} — ${reason}`
        await addLine(campaign, target, line, request)
        await audit(campaign, target.sheetId, request, before, list, { reason, effect: effect.name, caster: caster.name, character: target.name, ref: source.ref })
        log.info({ campaignId: String(campaignId), character: target.name, caster: caster.name, effect: effect.name, dice: effect.dice, kinds: effect.kinds, skill, ref: source.ref, origin: request.origin }, "[maddox] efeito de teste aplicado")
        await publish(campaignId, [target.sheetId, ...(caster.sheetId.equals(target.sheetId) ? [] : [caster.sheetId])])
        return { personagem: target.name, efeitos: list.map(checkEffectLabel), linha: [line, ...ended].join("\n") }
    } catch (error) {
        if (error instanceof CheckEffectError && !String(error.message).includes(" não entrou para ")) return refuse(error.message.replace(/\.$/, ""))
        throw error
    }
}

/** Desfaz uma gravação de efeito (o gasto falhou): volta a lista anterior; se a ficha mudou no meio, só tira o efeito novo. */
async function revertEffects(sheetId: Types.ObjectId, written: MaddoxCheckEffect[], previous: unknown, effectId: string): Promise<void> {
    try {
        const CharacterSheet = await sheetModel()
        const back = await CharacterSheet.collection.updateOne({ _id: sheetId, checkEffects: written }, previous === undefined ? { $unset: { checkEffects: "" } } : { $set: { checkEffects: previous } })
        if (!back.modifiedCount) await CharacterSheet.collection.updateOne({ _id: sheetId }, { $pull: { checkEffects: { id: effectId } } } as never)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), sheetId: String(sheetId), effectId }, "[maddox] falha ao desfazer o efeito de teste")
    }
}

/** Outra concentração do mesmo conjurador encerra a anterior (em qualquer personagem da campanha). */
async function endOtherConcentration(campaign: CampaignRow, characters: readonly CharacterRow[], effect: MaddoxCheckEffect): Promise<string[]> {
    return removeWhere(campaign, characters, (item) => item.id !== effect.id && item.concentration && item.casterCharacterId === effect.casterCharacterId, `${effect.casterName} se concentra agora em ${effect.name}`, "concentration")
}

/** Tira das fichas os efeitos escolhidos; linha "X terminou: motivo" por personagem. Nunca lança. */
async function removeWhere(campaign: CampaignRow, characters: readonly CharacterRow[], match: (effect: MaddoxCheckEffect) => boolean, why: string, origin: string): Promise<string[]> {
    const lines: string[] = []
    try {
        const sheetIds = characters.map((item) => item.sheetId).filter((id): id is Types.ObjectId => Boolean(id))
        if (!sheetIds.length) return lines
        const CharacterSheet = await sheetModel()
        const sheets = (await CharacterSheet.collection.find({ _id: { $in: sheetIds }, "checkEffects.0": { $exists: true } }, { projection: { checkEffects: 1 } }).toArray()) as unknown as SheetRow[]
        for (const sheet of sheets) {
            const character = characters.find((item) => String(item.sheetId) === String(sheet._id))
            if (!character) continue
            const before = readCheckEffects(sheet.checkEffects)
            const gone = before.filter(match)
            if (!gone.length) continue
            const list = before.filter((item) => !gone.includes(item))
            if (!(await writeEffects(sheet._id, sheet.checkEffects, list))) continue
            const line = `Efeito de teste de ${character.name}: ${gone.map((item) => item.name).join(", ")} terminou — ${why}`
            await addLine(campaign, character, line, { origin: "narrator", turnNumber: campaign.turn?.number ?? null })
            await audit(campaign, sheet._id, { campaignId: campaign._id, origin: "narrator" }, before, list, { ended: gone.map((item) => item.name), why, origin })
            lines.push(line)
        }
        if (lines.length) {
            log.info({ campaignId: String(campaign._id), lines, origin }, "[maddox] efeitos de teste encerrados")
            await publish(campaign._id, [])
        }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id), origin }, "[maddox] falha ao encerrar efeitos de teste")
    }
    return lines
}

export interface EndCheckEffectRequest extends CheckEffectContext {
    characterName: string
    name: string
    reason: string
}

/** Encerra um efeito pelo nome. Nome inexistente: erro com os efeitos atuais, sem mudar a ficha. */
export async function endCheckEffect(request: EndCheckEffectRequest): Promise<CheckEffectState> {
    const campaignId = new Types.ObjectId(String(request.campaignId))
    const reason = request.reason.trim()
    if (!reason) throw new CheckEffectError("Informe por que o efeito termina.")
    const campaign = await loadCampaign(campaignId)
    const characters = await campaignCharacters(campaignId)
    const target = characterByName(characters, request.characterName)
    const sheet = await readSheet(target.sheetId)
    const before = readCheckEffects(sheet?.checkEffects)
    const found = before.find((item) => checkEffectKey(item.name) === checkEffectKey(request.name))
    if (!found) throw new CheckEffectError(`${target.name} não tem o efeito de teste "${request.name}". Efeitos ativos: ${before.map(checkEffectLabel).join("; ") || "nenhum"}.`)
    const list = before.filter((item) => item !== found)
    if (!(await writeEffects(target.sheetId, sheet?.checkEffects, list))) throw new CheckEffectError("A ficha mudou agora há pouco: tente outra vez.")
    const line = `Efeito de teste de ${target.name}: ${found.name} terminou — ${reason}`
    await addLine(campaign, target, line, request)
    await audit(campaign, target.sheetId, request, before, list, { ended: [found.name], reason })
    log.info({ campaignId: String(campaignId), character: target.name, effect: found.name, origin: request.origin }, "[maddox] efeito de teste encerrado")
    await publish(campaignId, [target.sheetId])
    return { personagem: target.name, efeitos: list.map(checkEffectLabel), linha: line }
}

/** Efeitos ativos de uma ficha. */
export async function loadCheckEffects(sheetId: Types.ObjectId | string | null | undefined): Promise<MaddoxCheckEffect[]> {
    if (!sheetId || !Types.ObjectId.isValid(String(sheetId))) return []
    return readCheckEffects((await readSheet(new Types.ObjectId(String(sheetId))))?.checkEffects)
}

/**
 * Prévia dos testes pedidos na geração, recalculada ao gravar os rascunhos: o efeito registrado depois do `request_check`
 * (seguindo o aviso) já aparece no card. Falha na leitura mantém a prévia do pedido.
 */
export async function refreshDraftCheckEffects<T extends { sheetId: string | null; kind: MaddoxCheckEffectSpec["kind"]; skill: MaddoxCheckEffectSpec["skill"]; effects?: MaddoxCheckEffectEntry[] }>(drafts: readonly T[]): Promise<T[]> {
    return Promise.all(
        drafts.map(async (draft) => {
            try {
                return { ...draft, effects: await previewCheckEffects(draft.sheetId, { kind: draft.kind, skill: draft.skill }) }
            } catch (error) {
                log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] falha ao recalcular a prévia dos efeitos de teste")
                return draft
            }
        }),
    )
}

/** Prévia no pedido do teste: o que entra e o que não entra (com o motivo). */
export async function previewCheckEffects(sheetId: string | null | undefined, spec: MaddoxCheckEffectSpec): Promise<MaddoxCheckEffectEntry[]> {
    const { applied, skipped } = effectsForCheck(await loadCheckEffects(sheetId), spec)
    return [...applied.map((effect) => checkEffectEntry(effect, "expected")), ...skipped.map((item) => checkEffectEntry(item.effect, "skipped", { reason: item.reason }))]
}

/**
 * Na rolagem: os efeitos que entram agora (os de uso único saem da ficha com troca condicional; quem perder a corrida não
 * entra) e os que não entram, com o motivo — inclusive os da prévia que terminaram antes da rolagem.
 */
export async function takeCheckEffectsForRoll(sheetId: Types.ObjectId | null, spec: MaddoxCheckEffectSpec, expected: readonly MaddoxCheckEffectEntry[]): Promise<{ applied: MaddoxCheckEffect[]; skipped: MaddoxCheckEffectEntry[]; consumed: MaddoxCheckEffect[] }> {
    const skippedGone = (ids: Set<string>) => expected.filter((entry) => entry.status === "expected" && !ids.has(entry.id)).map((entry) => ({ ...entry, status: "skipped" as const, reason: "o efeito terminou antes da rolagem", results: null }))
    if (!sheetId) return { applied: [], skipped: skippedGone(new Set()), consumed: [] }
    const row = await readSheet(sheetId)
    const effects = readCheckEffects(row?.checkEffects)
    const { applied, skipped } = effectsForCheck(effects, spec)
    const singles = applied.filter((effect) => effect.singleUse)
    let usable = applied
    let consumed: MaddoxCheckEffect[] = []
    if (singles.length) {
        const list = effects.filter((effect) => !singles.includes(effect))
        if (await writeEffects(sheetId, row?.checkEffects, list)) consumed = singles
        else usable = applied.filter((effect) => !effect.singleUse)
    }
    const present = new Set(effects.map((effect) => effect.id))
    return {
        applied: usable,
        skipped: [...skipped.map((item) => checkEffectEntry(item.effect, "skipped", { reason: item.reason })), ...applied.filter((effect) => !usable.includes(effect)).map((effect) => checkEffectEntry(effect, "skipped", { reason: "o efeito já foi usado em outro teste" })), ...skippedGone(present)],
        consumed,
    }
}

/** A rolagem não foi gravada (outra venceu): os efeitos de uso único tirados para ela voltam à ficha. Nunca lança. */
export async function restoreConsumedCheckEffects(sheetId: Types.ObjectId, consumed: readonly MaddoxCheckEffect[]): Promise<void> {
    if (!consumed.length) return
    try {
        const CharacterSheet = await sheetModel()
        await CharacterSheet.collection.updateOne({ _id: sheetId }, { $push: { checkEffects: { $each: consumed as unknown as never[] } } } as never)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), sheetId: String(sheetId) }, "[maddox] falha ao devolver efeitos de uso único")
    }
}

/** Descanso concluído por estes personagens: os efeitos de teste deles terminam. */
export async function restCheckEffects(campaignId: Types.ObjectId, characterIds: readonly Types.ObjectId[]): Promise<string[]> {
    if (!characterIds.length) return []
    try {
        const campaign = await loadCampaign(campaignId)
        const ids = new Set(characterIds.map(String))
        const characters = (await campaignCharacters(campaignId)).filter((item) => ids.has(String(item._id)))
        return removeWhere(campaign, characters, () => true, "descanso concluído", "rest")
    } catch {
        return []
    }
}

/**
 * Depois de cada gravação do combate tático: a concentração de quem conjurou caiu (morto, fora do combate) ou mudou para
 * outra magia ⇒ o efeito termina. Nunca lança.
 */
export async function expireCombatCheckEffects(combat: TacticalCombat): Promise<string[]> {
    const sheetIds = combat.tactical.characters.map((state) => state.sheetId).filter((id): id is string => Boolean(id && Types.ObjectId.isValid(id))).map((id) => new Types.ObjectId(id))
    if (!sheetIds.length) return []
    try {
        const CharacterSheet = await sheetModel()
        const any = await CharacterSheet.collection.findOne({ _id: { $in: sheetIds }, "checkEffects.concentration": true }, { projection: { _id: 1 } })
        if (!any) return []
        const campaign = await loadCampaign(combat.campaignId)
        const characters = await campaignCharacters(combat.campaignId)
        const broken = new Map<string, string>()
        for (const state of combat.tactical.characters) {
            if (state.dead || state.left) broken.set(String(state.characterId), `${state.dead ? "quem conjurou caiu" : "quem conjurou saiu do combate"}`)
        }
        const spellOf = new Map(combat.tactical.characters.map((state) => [String(state.characterId), state.concentration?.spell ?? null]))
        return removeWhere(
            campaign,
            characters,
            (effect) => {
                if (!effect.concentration) return false
                if (broken.has(effect.casterCharacterId)) return true
                const spell = spellOf.get(effect.casterCharacterId)
                return Boolean(spell && checkEffectKey(plain(spell)) !== checkEffectKey(effect.name))
            },
            "a concentração de quem conjurou terminou",
            "combat",
        )
    } catch {
        return []
    }
}

/**
 * Aviso do `request_check` (sem trava, decisão do dono): magia ou recurso da ficha citado pelo nome na declaração ou no
 * lembrete recente do personagem (ou no motivo do teste) sem efeito de teste ativo com esse nome. Nunca lança.
 */
export async function unregisteredEffectMentions(input: { campaignId: Types.ObjectId; turnNumber: number; characterId: string; sheetId: string | null; reason: string; active: readonly MaddoxCheckEffectEntry[] }): Promise<string[]> {
    if (!input.sheetId || !Types.ObjectId.isValid(input.sheetId)) return []
    try {
        const sheetId = new Types.ObjectId(input.sheetId)
        const [{ CharacterSpell }, sheet, recent] = await Promise.all([
            import("@/features/character-sheets/models/character-spell"),
            readSheet(sheetId),
            MaddoxCampaignMessageModel.find({ campaignId: input.campaignId, characterId: new Types.ObjectId(input.characterId), kind: { $in: ["declaration", "reminder", "question"] }, turnNumber: { $gte: input.turnNumber - 1, $lte: input.turnNumber } })
                .select("content")
                .lean<{ content: string }[]>(),
        ])
        const spells = (await CharacterSpell.collection.find({ sheetId }, { projection: { name: 1 } }).toArray()) as unknown as { name?: string }[]
        const charges = (Array.isArray(sheet?.resourceCharges) ? sheet.resourceCharges : []) as Charge[]
        const names = [...new Set([...spells.map((item) => plain(item.name)), ...charges.map((item) => plain(item.name))].filter((name) => name.length >= 4))]
        const text = ` ${normalizeEffectText([input.reason, ...recent.map((item) => item.content)].join(" \n "))} `
        // Todo efeito registrado conta, inclusive o que não vale neste teste (ele já aparece em `efeitosQueNaoEntram`).
        const active = new Set(input.active.map((entry) => checkEffectKey(entry.name)))
        return names.filter((name) => text.includes(` ${normalizeEffectText(name)} `) && !active.has(checkEffectKey(name)))
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] falha ao procurar efeitos citados")
        return []
    }
}
