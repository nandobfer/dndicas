import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import type { CalcResult } from "@/features/character-sheets/utils/dnd-calculations"
import {
    ARMOR_CLASS_BONUSES_MAX,
    ARMOR_CLASS_EXPIRY_TEXT,
    armorClassBonusDurationText,
    armorClassBonusLabel,
    armorClassBonusSchema,
    expiredArmorClassBonuses,
    findArmorClassBonus,
    readArmorClassBonuses,
    signedValue,
    upsertArmorClassBonus,
    type ArmorClassBonus,
    type ArmorClassBonusDuration,
    type ArmorClassBonusOrigin,
    type ArmorClassExpiryContext,
} from "@/features/character-sheets/utils/armor-class-bonuses"
import { normalizeCatalogName } from "../catalog-markup"
import { MADDOX_SHEET_AUDIT_ENTITY, MADDOX_SHEET_RIGORS, type MaddoxAcDuration, type MaddoxAcOrigin } from "../constants"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign } from "../models"
import type { TacticalCombat } from "./tactical-combat"

/**
 * Bônus de CA nomeados no Maddox (DND-66) — SOMENTE servidor. Usado pelas ferramentas `add_armor_class_bonus` e
 * `remove_armor_class_bonus` (narração e "Pergunte ao mestre"), pela lista fechada da ficha (preparação do combate,
 * "Pedir ajuste", `update_character_sheet`) e pela expiração automática (rodadas, concentração, fim do combate e
 * descanso). Toda mudança grava NA FICHA com troca condicional, entra na auditoria `FichaPersonagem`, avisa a ficha
 * aberta e põe na mesa a linha "CA de X: 15 → 17 (…)". O retorno é sempre o estado gravado.
 */

const log = loggerFor({ module: "maddox", feature: "armor-class-bonuses" })

export class ArmorClassBonusError extends Error {}


const ORIGIN_KEYS: Record<MaddoxAcOrigin, ArmorClassBonusOrigin> = { magia: "spell", item: "item", talento: "feat", situacao: "situation", outro: "other" }
export const acOriginKey = (origin: MaddoxAcOrigin | ArmorClassBonusOrigin): ArmorClassBonusOrigin => (origin in ORIGIN_KEYS ? ORIGIN_KEYS[origin as MaddoxAcOrigin] : (origin as ArmorClassBonusOrigin))

export interface ArmorClassDurationRequest {
    kind: MaddoxAcDuration
    rounds?: number | null
    /** `concentracao`: quem mantém a concentração (nome como na ordem do combate). */
    caster?: string | null
    /** `momento`: até quando (texto livre). */
    moment?: string | null
}

export interface ArmorClassActionContext {
    campaignId: Types.ObjectId | string
    turnNumber?: number | null
    origin: "narrator" | "question" | "combat-prep" | "combat-adjust"
    requestedBy?: string | null
}

export interface ArmorClassBonusState {
    personagem: string
    ca: number
    caAntes: number
    bonusDeCA: string[]
    linha: string | null
}

type SheetRow = { _id: Types.ObjectId; armorClassBonuses?: unknown; [key: string]: unknown }

const sheetModels = async () => {
    const [{ CharacterSheet }, { CharacterItem }, armor] = await Promise.all([
        import("@/features/character-sheets/models/character-sheet"),
        import("@/features/character-sheets/models/character-item"),
        import("@/features/character-sheets/utils/armor-class"),
    ])
    return { CharacterSheet, CharacterItem, armor }
}

const ARMOR_SHEET_FIELDS = { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1, armorClassOverride: 1, armorClassBonuses: 1, unarmoredDefense: 1 } as const
const ARMOR_ITEM_FIELDS = { sheetId: 1, name: 1, equipped: 1, catalogItemType: 1, catalogAcType: 1, catalogAc: 1, catalogAcBonus: 1, catalogArmorType: 1 } as const

/** CA calculada de várias fichas (com as parcelas), numa leitura em lote leve. */
export async function loadArmorClassSummaries(sheetIds: readonly string[]): Promise<Map<string, CalcResult>> {
    const ids = [...new Set(sheetIds.filter((id) => Types.ObjectId.isValid(id)))].map((id) => new Types.ObjectId(id))
    const out = new Map<string, CalcResult>()
    if (!ids.length) return out
    const { CharacterSheet, CharacterItem, armor } = await sheetModels()
    type Item = Parameters<typeof armor.computeSheetArmorClassCalc>[1][number] & { sheetId: Types.ObjectId }
    const [sheets, items] = await Promise.all([
        CharacterSheet.collection.find({ _id: { $in: ids } }, { projection: ARMOR_SHEET_FIELDS }).toArray(),
        CharacterItem.collection.find({ sheetId: { $in: ids }, equipped: true }, { projection: ARMOR_ITEM_FIELDS }).toArray() as unknown as Promise<Item[]>,
    ])
    for (const sheet of sheets) {
        const own = items.filter((item) => String(item.sheetId) === String(sheet._id))
        out.set(String(sheet._id), armor.computeSheetArmorClassCalc({ ...(sheet as unknown as Parameters<typeof armor.computeSheetArmorClassCalc>[0]), armorClassBonuses: readArmorClassBonuses(sheet.armorClassBonuses) }, own))
    }
    return out
}

/** CA de uma ficha agora (sem o Escudo da reação, que é do combate). `null` sem ficha. */
export async function loadArmorClass(sheetId: string | null | undefined): Promise<number | null> {
    if (!sheetId) return null
    return (await loadArmorClassSummaries([sheetId])).get(sheetId)?.value ?? null
}

interface CharacterRow {
    _id: Types.ObjectId
    name: string
    status: string
    sheetId: Types.ObjectId | null
}

async function characterOf(campaignId: Types.ObjectId, name: string): Promise<{ campaign: Pick<IMaddoxCampaign, "_id" | "rigor" | "ownerId" | "turn">; character: CharacterRow & { sheetId: Types.ObjectId } }> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("rigor ownerId turn").lean<Pick<IMaddoxCampaign, "_id" | "rigor" | "ownerId" | "turn">>()
    if (!campaign) throw new ArmorClassBonusError("Campanha não encontrada.")
    if (!MADDOX_SHEET_RIGORS.includes(campaign.rigor)) throw new ArmorClassBonusError("Esta campanha é narrativa: não há CA na ficha.")
    const characters = await MaddoxCharacterModel.find({ campaignId, status: { $in: ["active", "dead"] } }).select("name status sheetId").lean<CharacterRow[]>()
    const wanted = normalizeCatalogName(name)
    const character = characters.find((item) => normalizeCatalogName(item.name) === wanted)
    if (!character) throw new ArmorClassBonusError(`Nenhum personagem jogador chamado "${name}". Personagens: ${characters.map((item) => item.name).join(", ") || "nenhum"}.`)
    if (character.status === "dead") throw new ArmorClassBonusError(`${character.name} está morto.`)
    if (!character.sheetId) throw new ArmorClassBonusError(`${character.name} não tem ficha.`)
    return { campaign, character: character as CharacterRow & { sheetId: Types.ObjectId } }
}

/** Monta a duração gravada. As do combate exigem combate tático em andamento (e o conjurador concentrado). */
export async function resolveArmorClassDuration(campaignId: Types.ObjectId, request: ArmorClassDurationRequest): Promise<ArmorClassBonusDuration> {
    switch (request.kind) {
        case "permanente":
            return { kind: "permanent" }
        case "descanso-curto":
            return { kind: "short-rest" }
        case "descanso-longo":
            return { kind: "long-rest" }
        case "momento": {
            const moment = request.moment?.trim()
            if (!moment) throw new ArmorClassBonusError('Com a duração "momento", diga em `momento` até quando o bônus vale (ex.: "o fim da cena").')
            return { kind: "moment", moment: moment.slice(0, 160) }
        }
        default:
            break
    }
    const { findActiveTactical, findActorByName } = await import("./tactical-combat")
    if (request.kind === "fim-do-combate") {
        // Vale também no combate narrativo (sem tática): o fim de qualquer combate tira o bônus.
        const { MaddoxCombatModel } = await import("../models")
        const active = await MaddoxCombatModel.findOne({ campaignId, status: "active" }).select("_id").lean<{ _id: Types.ObjectId }>()
        if (!active) throw new ArmorClassBonusError('Não há combate em andamento: use "permanente", "descanso-curto", "descanso-longo" ou "momento".')
        return { kind: "combat", combatId: String(active._id) }
    }
    const combat = await findActiveTactical(campaignId)
    if (!combat) throw new ArmorClassBonusError('Não há combate tático em andamento: "rodadas" e "concentracao" só valem nele. Use "fim-do-combate", "momento" ou outra duração.')
    const combatId = String(combat._id)
    if (request.kind === "rodadas") {
        const rounds = Math.trunc(Number(request.rounds))
        if (!Number.isFinite(rounds) || rounds < 1 || rounds > 100) throw new ArmorClassBonusError('Com a duração "rodadas", informe `rodadas` (1 a 100).')
        const round = Math.max(1, combat.tactical.round || 1)
        return { kind: "rounds", rounds, combatId, untilRound: round + rounds }
    }
    const casterName = request.caster?.trim()
    if (!casterName) throw new ArmorClassBonusError('Com a duração "concentracao", informe `conjurador` (quem mantém a concentração).')
    const caster = findActorByName(combat, casterName)
    if (!caster) throw new ArmorClassBonusError(`"${casterName}" não está neste combate. Participantes: ${combat.tactical.order.map((slot) => slot.name).join(", ")}.`)
    const spell = caster.state.concentration?.spell
    if (!spell) throw new ArmorClassBonusError(`${caster.name} não está concentrado em nenhuma magia agora: use outra duração.`)
    return { kind: "concentration", combatId, casterKey: caster.key, casterName: caster.name, spell }
}

/**
 * Grava a lista nova da ficha só se ela ainda for a que foi lida (o jogador ou outra gravação não mudou nada no meio).
 * Driver direto: o filtro compara o array inteiro, sem o cast do Mongoose.
 */
async function writeBonuses(sheetId: Types.ObjectId, raw: unknown, next: ArmorClassBonus[]): Promise<boolean> {
    const { CharacterSheet } = await sheetModels()
    const filter: Record<string, unknown> = { _id: sheetId, armorClassBonuses: raw === undefined ? { $exists: false } : raw }
    const updated = await CharacterSheet.collection.updateOne(filter, { $set: { armorClassBonuses: next, updatedAt: new Date() } })
    return updated.modifiedCount > 0
}

async function readSheet(sheetId: Types.ObjectId): Promise<SheetRow | null> {
    const { CharacterSheet } = await sheetModels()
    return (await CharacterSheet.collection.findOne({ _id: sheetId }, { projection: { armorClassBonuses: 1 } })) as SheetRow | null
}

const listText = (bonuses: readonly ArmorClassBonus[]) => (bonuses.length ? bonuses.map(armorClassBonusLabel) : ["nenhum"])

async function afterWrite(input: {
    campaign: Pick<IMaddoxCampaign, "_id" | "ownerId" | "turn">
    character: { _id: Types.ObjectId; name: string; sheetId: Types.ObjectId }
    before: ArmorClassBonus[]
    after: ArmorClassBonus[]
    caBefore: number
    caAfter: number
    line: string
    audit: Record<string, unknown>
    context: Pick<ArmorClassActionContext, "turnNumber" | "requestedBy" | "origin">
}): Promise<void> {
    const sheetId = String(input.character.sheetId)
    const { publishPatched } = await import("./combat-sheet")
    await publishPatched(sheetId)
    await recordAudit({
        userId: input.context.requestedBy ?? input.campaign.ownerId,
        entidade: MADDOX_SHEET_AUDIT_ENTITY,
        entidadeId: sheetId,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { armorClassBonuses: input.before, armorClass: input.caBefore },
        depois: { by: "maddox", origin: input.context.origin, requestedBy: input.context.requestedBy ?? null, campaign: String(input.campaign._id), character: input.character.name, armorClassBonuses: input.after, armorClass: input.caAfter, ...input.audit },
    }).catch((error: unknown) => log.warn({ err: error instanceof Error ? error.message : String(error), sheetId }, "[maddox] auditoria do bônus de CA falhou"))
    await MaddoxCampaignMessageModel.create({
        campaignId: input.campaign._id,
        turnNumber: input.context.turnNumber ?? input.campaign.turn?.number ?? 0,
        phase: input.campaign.turn?.phase ?? (input.context.origin === "question" ? "players" : "master"),
        kind: "sheet-change",
        characterId: input.character._id,
        characterName: input.character.name,
        content: input.line,
    })
}

export interface ApplyArmorClassBonusRequest extends ArmorClassActionContext {
    characterName: string
    name: string
    value: number
    bonusOrigin: MaddoxAcOrigin | ArmorClassBonusOrigin
    duration: ArmorClassDurationRequest
    reason: string
    source?: { ref: string; quote: string } | null
}

/** Aplica (ou substitui, pelo nome) um bônus de CA. Devolve a CA e a lista gravadas. */
export async function applyArmorClassBonus(request: ApplyArmorClassBonusRequest): Promise<ArmorClassBonusState> {
    const campaignId = new Types.ObjectId(String(request.campaignId))
    const reason = request.reason.trim()
    if (!reason) throw new ArmorClassBonusError("Informe o motivo do bônus de CA.")
    const { campaign, character } = await characterOf(campaignId, request.characterName)
    const duration = await resolveArmorClassDuration(campaignId, request.duration)
    const candidate = armorClassBonusSchema.safeParse({
        id: randomUUID(),
        name: request.name.trim(),
        value: Math.trunc(request.value),
        origin: acOriginKey(request.bonusOrigin),
        duration,
        source: request.source ?? null,
        campaignId: String(campaignId),
        addedBy: "maddox",
        createdAt: new Date().toISOString(),
    })
    if (!candidate.success) throw new ArmorClassBonusError(`Bônus de CA inválido: ${candidate.error.issues.map((issue) => issue.message).join("; ")} (nome até 80 letras; valor de -10 a +10, diferente de 0).`)
    const bonus = candidate.data
    const row = await readSheet(character.sheetId)
    if (!row) throw new ArmorClassBonusError(`A ficha de ${character.name} não foi encontrada.`)
    const before = readArmorClassBonuses(row.armorClassBonuses)
    const { list, replaced } = upsertArmorClassBonus(before, bonus)
    if (!replaced && list.length > ARMOR_CLASS_BONUSES_MAX) throw new ArmorClassBonusError(`${character.name} já tem ${ARMOR_CLASS_BONUSES_MAX} bônus de CA: remova um antes. Atuais: ${listText(before).join("; ")}.`)
    const sheetId = String(character.sheetId)
    const caBefore = (await loadArmorClass(sheetId)) ?? 10
    if (!(await writeBonuses(character.sheetId, row.armorClassBonuses, list))) throw new ArmorClassBonusError("A ficha mudou agora há pouco: leia de novo e tente outra vez.")
    const caAfter = (await loadArmorClass(sheetId)) ?? caBefore
    const line = `CA de ${character.name}: ${caBefore} → ${caAfter} (${bonus.name} ${signedValue(bonus.value)}, ${armorClassBonusDurationText(bonus.duration)}${replaced ? `; substitui ${signedValue(replaced.value)}` : ""} — ${reason})`
    await afterWrite({ campaign, character, before, after: list, caBefore, caAfter, line, audit: { reason, bonus: bonus.name }, context: request })
    log.info({ campaignId: String(campaignId), character: character.name, bonus: bonus.name, value: bonus.value, duration: bonus.duration.kind, caBefore, caAfter, origin: request.origin }, "[maddox] bônus de CA aplicado")
    await publishTable(campaignId)
    return { personagem: character.name, ca: caAfter, caAntes: caBefore, bonusDeCA: listText(list), linha: line }
}

export interface RemoveArmorClassBonusRequest extends ArmorClassActionContext {
    characterName: string
    name: string
    reason: string
}

/** Remove um bônus pelo nome. Nome inexistente: erro com os bônus atuais, sem mudar a ficha. */
export async function removeArmorClassBonus(request: RemoveArmorClassBonusRequest): Promise<ArmorClassBonusState> {
    const campaignId = new Types.ObjectId(String(request.campaignId))
    const reason = request.reason.trim()
    if (!reason) throw new ArmorClassBonusError("Informe o motivo da remoção do bônus de CA.")
    const { campaign, character } = await characterOf(campaignId, request.characterName)
    const row = await readSheet(character.sheetId)
    if (!row) throw new ArmorClassBonusError(`A ficha de ${character.name} não foi encontrada.`)
    const before = readArmorClassBonuses(row.armorClassBonuses)
    const target = findArmorClassBonus(before, request.name)
    if (!target) throw new ArmorClassBonusError(`${character.name} não tem o bônus de CA "${request.name}". Bônus atuais: ${listText(before).join("; ")}.`)
    const list = before.filter((bonus) => bonus !== target)
    const sheetId = String(character.sheetId)
    const caBefore = (await loadArmorClass(sheetId)) ?? 10
    if (!(await writeBonuses(character.sheetId, row.armorClassBonuses, list))) throw new ArmorClassBonusError("A ficha mudou agora há pouco: leia de novo e tente outra vez.")
    const caAfter = (await loadArmorClass(sheetId)) ?? caBefore
    const line = `CA de ${character.name}: ${caBefore} → ${caAfter} (${target.name} ${signedValue(target.value)} removido — ${reason})`
    await afterWrite({ campaign, character, before, after: list, caBefore, caAfter, line, audit: { reason, removed: target.name }, context: request })
    log.info({ campaignId: String(campaignId), character: character.name, bonus: target.name, caBefore, caAfter, origin: request.origin }, "[maddox] bônus de CA removido")
    await publishTable(campaignId)
    return { personagem: character.name, ca: caAfter, caAntes: caBefore, bonusDeCA: listText(list), linha: line }
}

async function publishTable(campaignId: Types.ObjectId) {
    try {
        const { publishGameChanged } = await import("./game")
        await publishGameChanged(campaignId)
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] aviso da mesa falhou depois do bônus de CA")
    }
}

// ── Expiração ──────────────────────────────────────────────────────────────────

/**
 * Tira das fichas dos personagens da campanha os bônus vencidos no contexto. Cada personagem afetado ganha a linha
 * "CA de X: 17 → 15 (Escudo da Fé terminou: fim do combate)" e a auditoria. Nunca lança.
 */
async function expireFor(campaignId: Types.ObjectId, characterIds: readonly Types.ObjectId[] | null, context: ArmorClassExpiryContext, origin: string): Promise<string[]> {
    const lines: string[] = []
    try {
        const campaign = await MaddoxCampaignModel.findById(campaignId).select("rigor ownerId turn").lean<Pick<IMaddoxCampaign, "_id" | "rigor" | "ownerId" | "turn">>()
        if (!campaign || !MADDOX_SHEET_RIGORS.includes(campaign.rigor)) return lines
        const characters = await MaddoxCharacterModel.find({ campaignId, ...(characterIds ? { _id: { $in: characterIds } } : {}), sheetId: { $ne: null } }).select("name status sheetId").lean<CharacterRow[]>()
        if (!characters.length) return lines
        const { CharacterSheet } = await sheetModels()
        const sheets = await CharacterSheet.collection.find({ _id: { $in: characters.map((item) => item.sheetId!) }, "armorClassBonuses.0": { $exists: true } }, { projection: { armorClassBonuses: 1 } }).toArray()
        for (const sheet of sheets) {
            const character = characters.find((item) => String(item.sheetId) === String(sheet._id))
            if (!character) continue
            const before = readArmorClassBonuses(sheet.armorClassBonuses)
            const expired = expiredArmorClassBonuses(before, context)
            if (!expired.length) continue
            const gone = new Set(expired.map((item) => item.bonus.id))
            const list = before.filter((bonus) => !gone.has(bonus.id))
            const sheetId = String(sheet._id)
            const caBefore = (await loadArmorClass(sheetId)) ?? 10
            if (!(await writeBonuses(sheet._id, sheet.armorClassBonuses, list))) continue
            const caAfter = (await loadArmorClass(sheetId)) ?? caBefore
            const what = expired.map((item) => `${item.bonus.name} ${signedValue(item.bonus.value)} terminou: ${ARMOR_CLASS_EXPIRY_TEXT[item.reason]}`).join("; ")
            const line = `CA de ${character.name}: ${caBefore} → ${caAfter} (${what})`
            await afterWrite({ campaign, character: { _id: character._id, name: character.name, sheetId: sheet._id }, before, after: list, caBefore, caAfter, line, audit: { expired: expired.map((item) => ({ name: item.bonus.name, reason: item.reason })), by: "maddox", origin }, context: { origin: "narrator", turnNumber: campaign.turn?.number ?? null } })
            lines.push(line)
        }
        if (lines.length) {
            log.info({ campaignId: String(campaignId), lines, origin }, "[maddox] bônus de CA vencidos removidos")
            await publishTable(campaignId)
        }
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId), origin }, "[maddox] falha ao vencer bônus de CA")
    }
    return lines
}

/** Contexto do combate ativo: rodada e a concentração de cada ator (morto, fora ou derrotado = sem concentração). */
export function combatExpiryContext(combat: TacticalCombat): ArmorClassExpiryContext {
    const concentrationByKey = new Map<string, string | null>()
    for (const state of combat.tactical.characters) concentrationByKey.set(state.actorKey, state.dead || state.left ? null : (state.concentration?.spell ?? null))
    for (const item of combat.combatants) if (item.tactical) concentrationByKey.set(item.tactical.actorKey, item.tactical.defeated || item.outcome ? null : (item.tactical.concentration?.spell ?? null))
    return { combatId: String(combat._id), round: combat.tactical.round, concentrationByKey }
}

/** Depois de cada gravação do combate tático (`saveTactical`): rodadas vencidas e concentração perdida. Nunca lança. */
export async function expireCombatArmorClassBonuses(combat: TacticalCombat): Promise<string[]> {
    const ids = combat.tactical.characters.map((state) => state.characterId).filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id))
    const sheetIds = combat.tactical.characters.map((state) => state.sheetId).filter((id): id is string => Boolean(id && Types.ObjectId.isValid(id))).map((id) => new Types.ObjectId(id))
    if (!ids.length || !sheetIds.length) return []
    // Saída cedo (roda a cada gravação do combate): só segue se alguma ficha tem bônus ligado a um combate.
    try {
        const { CharacterSheet } = await sheetModels()
        const any = await CharacterSheet.collection.findOne({ _id: { $in: sheetIds }, "armorClassBonuses.duration.combatId": { $exists: true } }, { projection: { _id: 1 } })
        if (!any) return []
    } catch {
        return []
    }
    return expireFor(combat.campaignId, ids, combatExpiryContext(combat), "combat")
}

/** Fim do combate (pela narração ou pelo servidor): saem os bônus ligados a ele. */
export async function endCombatArmorClassBonuses(campaignId: Types.ObjectId, combatId: Types.ObjectId | string): Promise<string[]> {
    return expireFor(campaignId, null, { combatId: null, round: 0, concentrationByKey: new Map(), endedCombatId: String(combatId) }, "combat-end")
}

/** Começo de um combate: bônus de combates anteriores que ficaram para trás (falha no meio do fim) saem. */
export async function staleCombatArmorClassBonuses(campaignId: Types.ObjectId, activeCombatId: Types.ObjectId | string): Promise<string[]> {
    return expireFor(campaignId, null, { combatId: String(activeCombatId), round: 0, concentrationByKey: new Map(), staleOnly: true }, "combat-start")
}

/** Descanso concluído por estes personagens: saem os bônus "até o descanso". */
export async function restArmorClassBonuses(campaignId: Types.ObjectId, characterIds: readonly Types.ObjectId[], kind: "short" | "long"): Promise<string[]> {
    if (!characterIds.length) return []
    return expireFor(campaignId, characterIds, { combatId: null, round: 0, concentrationByKey: new Map(), rest: kind }, "rest")
}
