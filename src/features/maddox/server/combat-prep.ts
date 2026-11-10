import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_ABILITIES, MADDOX_ABILITY_LABELS } from "../check-modifier"
import { plainText, type CombatOption, type CombatOptions } from "../combat-options"
import { detectSneakAttack, riderLabel } from "../combat-prep"
import { combatAddSchema, combatModifySchema, combatPrepResponseSchema, combatRemoveSchema, combatSheetChangeSchema, parseList, sneakAttackSchema, type CombatSheetChange } from "../combat-prep-schemas"
import { abilityModifier } from "../combat-rules"
import { emptyOverlay, type CombatOptionPatch, type CombatPrepChange, type CombatPrepOverlay, type CombatPrepRider, type PreparedCombatOption, type TacticalCharacterState } from "../combat-types"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_COMBAT_PREP_CONFLICT_RETRIES, MADDOX_COMBAT_PREP_STALE_MS } from "../constants"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCombatPrepModel, type IMaddoxCampaign, type IMaddoxCombatPrep } from "../models"

/**
 * Preparação da mesa de combate (DND-41) — SOMENTE servidor. Ao abrir o combate tático, cada personagem (inclusive os
 * Opex) ganha um documento `maddox_combat_preps` e um job na fila serial da campanha: o Maddox revisa a lista de opções
 * contra a ficha inteira, grava as correções na ficha e o que muda nas opções, e o dono do personagem recebe o card
 * privado "Sua mesa está pronta". A ordem de iniciativa só fecha com todas as preparações prontas (`preparationPending`).
 * Falha = o combate para até o dono da campanha decidir ("Tentar de novo" ou "Seguir sem preparação").
 */

const log = loggerFor({ module: "maddox", feature: "combat-prep" })

type PrepDoc = IMaddoxCombatPrep

/** Preparações com execução viva neste processo (enfileiradas ou rodando): a retomada não as duplica. */
const liveJobs = ((globalThis as unknown as { __maddoxCombatPrepJobs?: Set<string> }).__maddoxCombatPrepJobs ??= new Set<string>())
/** Promessas das preparações em andamento (testes esperam por elas). */
const running = ((globalThis as unknown as { __maddoxCombatPrepRuns?: Set<Promise<void>> }).__maddoxCombatPrepRuns ??= new Set<Promise<void>>())

/** Testes: espera as preparações (e os pedidos de ajuste) enfileiradas terminarem. */
export async function waitForCombatPreps(): Promise<void> {
    while (running.size) await Promise.allSettled([...running])
}

const track = (promise: Promise<void>) => {
    running.add(promise)
    void promise.finally(() => running.delete(promise))
}

const BLOCKING: IMaddoxCombatPrep["status"][] = ["pending", "running", "failed"]

/** Há preparação do combate ainda não pronta (inclusive com falha esperando o dono): a ordem não fecha. */
export async function preparationPending(combatId: Types.ObjectId | string): Promise<boolean> {
    return Boolean(await MaddoxCombatPrepModel.exists({ combatId: new Types.ObjectId(String(combatId)), status: { $in: BLOCKING } }))
}

/** Cria a preparação de cada personagem do combate que começa e põe os jobs na fila. */
export async function createCombatPreps(campaignId: Types.ObjectId, combatId: Types.ObjectId, characters: readonly TacticalCharacterState[], turnNumber: number, waitRound: number): Promise<void> {
    const docs = characters
        .filter((state) => state.sheetId && !state.left)
        .map((state) => ({
            campaignId,
            combatId,
            actorKey: state.actorKey,
            characterId: new Types.ObjectId(state.characterId),
            memberId: new Types.ObjectId(state.memberId),
            userId: state.userId,
            sheetId: new Types.ObjectId(state.sheetId!),
            characterName: state.name,
            turnNumber,
            waitRound,
            status: "pending" as const,
        }))
    if (!docs.length) return
    try {
        await MaddoxCombatPrepModel.insertMany(docs, { ordered: false })
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error
    }
    log.info({ campaignId: String(campaignId), combatId: String(combatId), characters: docs.length }, "[maddox] preparação da mesa de combate agendada")
    await scheduleCombatPreps(campaignId)
}

/**
 * Põe na fila da campanha, em ordem, as preparações pendentes do combate ativo (e as "em andamento" sem execução viva há
 * mais que a folga, depois de um reinício). Idempotente: a mesma preparação não entra duas vezes.
 */
export async function scheduleCombatPreps(campaignId: Types.ObjectId): Promise<number> {
    const { findActiveTactical } = await import("./tactical-combat")
    const combat = await findActiveTactical(campaignId)
    if (!combat) return 0
    const staleBefore = new Date(Date.now() - MADDOX_COMBAT_PREP_STALE_MS)
    const preps = await MaddoxCombatPrepModel.find({ combatId: combat._id, $or: [{ status: "pending" }, { status: "running", startedAt: { $lt: staleBefore } }] })
        .sort({ _id: 1 })
        .select("_id status")
        .lean<{ _id: Types.ObjectId; status: string }[]>()
    let queued = 0
    const { enqueueMaddoxJob } = await import("./game-live")
    for (const prep of preps) {
        const key = String(prep._id)
        if (liveJobs.has(key)) continue
        if (prep.status === "running") await MaddoxCombatPrepModel.updateOne({ _id: prep._id, status: "running" }, { $set: { status: "pending", jobId: null } })
        liveJobs.add(key)
        queued += 1
        track(enqueueMaddoxJob(String(campaignId), "combat-prep", async (job) => {
            try {
                await runCombatPrep(campaignId, prep._id, job.jobId)
            } finally {
                liveJobs.delete(key)
            }
        }))
    }
    return queued
}

// ── Contexto da ficha ─────────────────────────────────────────────────────────

export interface PrepSheetContext {
    /** Ficha inteira em texto, com os ids que o Maddox pode citar. */
    sheetText: string
    optionsText: string
    /** Lista base completa (ids válidos para alterar e remover). */
    options: CombatOptions
    sneakAttack: string | null
    stamp: string
    chargeIds: Set<string>
    itemIds: Set<string>
}

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value))
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)
const ECONOMY_TEXT = { action: "Ação", bonus: "Ação bônus", reaction: "Reação" } as const

export const optionLine = (option: Pick<CombatOption, "id" | "economy" | "label" | "detail">) => `- [${ECONOMY_TEXT[option.economy]}] id="${option.id}" — ${option.label}${option.detail ? ` (${option.detail})` : ""}`

/** Lê a ficha inteira para a preparação (e para os pedidos de ajuste). */
export async function loadPrepSheet(state: TacticalCharacterState, campaignId?: Types.ObjectId): Promise<PrepSheetContext | null> {
    if (!state.sheetId) return null
    const sheetId = new Types.ObjectId(state.sheetId)
    const [{ CharacterSheet }, { CharacterAttack }, { CharacterTrait }, { CharacterFeat }, { CharacterSpell }, { CharacterItem }, { ItemModel }, { loadCharacterOptions }, { readSheetStamp, attackDamageText }] = await Promise.all([
        import("@/features/character-sheets/models/character-sheet"),
        import("@/features/character-sheets/models/character-attack"),
        import("@/features/character-sheets/models/character-trait"),
        import("@/features/character-sheets/models/character-feat"),
        import("@/features/character-sheets/models/character-spell"),
        import("@/features/character-sheets/models/character-item"),
        import("@/features/items/database/item"),
        import("./tactical-options"),
        import("./combat-sheet-writes"),
    ])
    const stamp = await readSheetStamp(state.sheetId)
    type Sheet = Record<string, unknown> & { level?: number; resourceCharges?: { id: string; name: string; total: number; used: number }[]; spellSlots?: Record<string, { total: number; used: number }>; skills?: Record<string, { proficient?: boolean; expertise?: boolean }>; savingThrows?: Record<string, boolean>; armorTraining?: Record<string, boolean> }
    const [sheet, attacks, traits, feats, spells, items] = await Promise.all([
        CharacterSheet.findById(sheetId).lean<Sheet>(),
        CharacterAttack.find({ sheetId }).sort({ _id: 1 }).lean<{ _id: Types.ObjectId; name: string; attackBonus: string; damageType: string }[]>(),
        CharacterTrait.find({ sheetId }).sort({ _id: 1 }).lean<{ _id: Types.ObjectId; name: string; description: string }[]>(),
        CharacterFeat.find({ sheetId }).sort({ _id: 1 }).lean<{ _id: Types.ObjectId; name: string; description: string }[]>(),
        CharacterSpell.find({ sheetId }).sort({ _id: 1 }).lean<{ _id: Types.ObjectId; name: string; circle: number | null; prepared: boolean; castingTime: string; concentration: boolean }[]>(),
        CharacterItem.find({ sheetId }).sort({ _id: 1 }).lean<{ _id: Types.ObjectId; name: string; quantity: number; equipped: boolean; catalogItemId: Types.ObjectId | null; catalogItemType: string | null }[]>(),
    ])
    if (!sheet) return null
    const catalogIds = items.map((item) => item.catalogItemId).filter((id): id is Types.ObjectId => Boolean(id))
    const catalog = catalogIds.length ? await ItemModel.find({ _id: { $in: catalogIds } }).select("type damageDice damageType properties mastery").lean<{ _id: Types.ObjectId; type?: string; damageDice?: { quantidade: number; tipo: string }; damageType?: string; properties?: { name?: string; description?: string }[]; mastery?: string }[]>() : []
    const catalogById = new Map(catalog.map((item) => [String(item._id), item]))
    const views = await loadCharacterOptions([state], campaignId, null, { base: true, ignoreResources: true })
    const view = views.get(state.actorKey)
    const options: CombatOptions = view?.options ?? { action: [], bonus: [], reactions: [], attacksPerAction: 1 }
    const level = Math.max(1, Number(sheet.level) || 1)
    const html = (key: string) => plainText(String(sheet[key] ?? ""))
    const prof = view?.sheet.option.proficiencyBonus ?? 2
    const abilities = MADDOX_ABILITIES.map((ability) => {
        const score = Number(sheet[ability]) || 10
        return `${MADDOX_ABILITY_LABELS[ability]} ${score} (${signed(abilityModifier(score))})`
    }).join(", ")
    const saves = MADDOX_ABILITIES.filter((ability) => sheet.savingThrows?.[ability]).map((ability) => MADDOX_ABILITY_LABELS[ability])
    const skills = Object.entries(sheet.skills ?? {})
        .filter(([, value]) => value?.proficient || value?.expertise)
        .map(([name, value]) => `${name}${value.expertise ? " (especialista)" : ""}`)
    const charges = sheet.resourceCharges ?? []
    const slots = Object.entries(sheet.spellSlots ?? {}).filter(([, slot]) => (slot?.total ?? 0) > 0)
    const sneakAttack = detectSneakAttack({
        level,
        classText: `${String(sheet.class ?? "")} ${String(sheet.subclass ?? "")}`,
        features: [String(sheet.classFeatures ?? ""), String(sheet.speciesTraits ?? ""), String(sheet.featuresNotes ?? ""), ...traits.map((trait) => trait.name), ...feats.map((feat) => feat.name)],
    })
    const sections = [
        "## Ficha",
        `- Classe: ${html("class") || "(sem classe)"}${html("subclass") ? ` (${html("subclass")})` : ""} · Nível ${level} · Espécie: ${html("race") || "—"} · Origem: ${html("origin") || "—"}`,
        `- Atributos: ${abilities}`,
        `- Bônus de proficiência: ${signed(prof)}`,
        `- Salvaguardas proficientes: ${saves.join(", ") || "nenhuma"}`,
        `- Perícias: ${skills.join(", ") || "nenhuma"}`,
        `- Proficiências com armas: ${html("weaponProficiencies") || "—"}`,
        `- Treino com armaduras: ${Object.entries(sheet.armorTraining ?? {}).filter(([, value]) => value).map(([key]) => key).join(", ") || "nenhum"}`,
        `- Conjuração: ${sheet.spellcastingAttribute ? MADDOX_ABILITY_LABELS[sheet.spellcastingAttribute as keyof typeof MADDOX_ABILITY_LABELS] ?? String(sheet.spellcastingAttribute) : "nenhum atributo"}${view ? ` · CD ${view.sheet.option.spellSaveDc} · ataque ${signed(view.sheet.option.spellAttackBonus)}` : ""}`,
        `- Espaços de magia: ${slots.map(([circle, slot]) => `${circle}º ${slot.total - slot.used}/${slot.total}`).join(", ") || "nenhum"}`,
        `- Recursos com cargas: ${charges.map((charge) => `[id="${charge.id}"] ${plainText(charge.name)} ${charge.total - charge.used}/${charge.total}`).join("; ") || "nenhum"}`,
        `## Características de classe\n${clip(html("classFeatures"), 3000) || "(nenhuma)"}`,
        `## Características da espécie\n${clip(html("speciesTraits"), 2000) || "(nenhuma)"}`,
        `## Talentos e notas de características\n${clip(html("featuresNotes"), 2000) || "(nenhum)"}`,
        `## Ataques da ficha\n${attacks.map((attack) => `- [attackId="${attack._id}"] ${plainText(attack.name)} · ${attack.attackBonus || "—"} · ${attackDamageText(attack.damageType) || "—"}`).join("\n") || "(nenhum)"}`,
        `## Itens\n${
            items
                .map((item) => {
                    const entry = item.catalogItemId ? catalogById.get(String(item.catalogItemId)) : undefined
                    const props = (entry?.properties ?? []).map((property) => plainText(property.name?.trim() ? property.name : (property.description ?? ""))).filter(Boolean)
                    const damage = entry?.damageDice ? ` · dano ${entry.damageDice.quantidade}${entry.damageDice.tipo.startsWith("d") ? entry.damageDice.tipo : `d${entry.damageDice.tipo}`} ${entry.damageType ?? ""}`.trimEnd() : ""
                    return `- [itemId="${item._id}"] ${plainText(item.name)} · ${item.equipped ? "equipado" : "não equipado"} · qtd ${item.quantity ?? 1} · ${entry?.type ?? item.catalogItemType ?? (item.catalogItemId ? "catálogo" : "fora do catálogo")}${damage}${props.length ? ` · propriedades: ${props.join(", ")}` : ""}${entry?.mastery ? ` · ${plainText(entry.mastery)}` : ""}`
                })
                .join("\n") || "(nenhum)"
        }`,
        `## Características registradas\n${traits.map((trait) => `- [id="${trait._id}"] ${plainText(trait.name)} — ${clip(plainText(trait.description ?? ""), 400)}`).join("\n") || "(nenhuma)"}`,
        `## Talentos registrados\n${feats.map((feat) => `- [id="${feat._id}"] ${plainText(feat.name)} — ${clip(plainText(feat.description ?? ""), 400)}`).join("\n") || "(nenhum)"}`,
        `## Magias\n${spells.map((spell) => `- [spellId="${spell._id}"] ${plainText(spell.name)} · ${spell.circle === 0 ? "truque" : spell.circle ? `${spell.circle}º círculo` : "círculo ?"} · ${spell.prepared ? "preparada" : "não preparada"} · ${spell.castingTime || "—"}${spell.concentration ? " · concentração" : ""}`).join("\n") || "(nenhuma)"}`,
    ]
    return {
        sheetText: sections.join("\n"),
        optionsText: [...options.action, ...options.bonus, ...options.reactions].map(optionLine).join("\n") || "(nenhuma)",
        options,
        sneakAttack,
        stamp,
        chargeIds: new Set(charges.map((charge) => charge.id)),
        itemIds: new Set(items.map((item) => String(item._id))),
    }
}

// ── Interpretação da resposta ─────────────────────────────────────────────────

export interface PrepInterpretation {
    sheetChanges: CombatSheetChange[]
    overlay: CombatPrepOverlay
    /** Pedidos de criação na ficha ligados a uma opção acrescentada (`ref` → id da opção). */
    links: Map<string, string>
    optionChanges: CombatPrepChange[]
    rider: { dice: string | null; reason: string } | undefined
    dropped: number
}

const attackDetail = (attack: NonNullable<CombatOptionPatch["attack"]>) => `${signed(attack.bonus)} para acertar · ${attack.damage}${attack.damageType ? ` ${attack.damageType}` : ""}${attack.ranged ? " · à distância" : ""}`

function patchDetail(option: CombatOption, patch: CombatOptionPatch): string {
    if (patch.detail?.trim()) return patch.detail.trim()
    if (patch.attack) return attackDetail(patch.attack)
    if (patch.save) return `salvaguarda de ${MADDOX_ABILITY_LABELS[patch.save.ability]} CD ${patch.save.dc}${patch.save.damage ? ` · ${patch.save.damage}` : ""}`
    if (patch.heal) return `cura ${patch.heal.dice}`
    if (patch.economy) return `${ECONOMY_TEXT[patch.economy]}`
    return option.detail
}

/** Confere a resposta da IA contra a lista base e a ficha: ids desconhecidos e valores fora da faixa são descartados. */
export function interpretPrep(raw: unknown, context: Pick<PrepSheetContext, "options" | "chargeIds" | "itemIds">): PrepInterpretation {
    const response = combatPrepResponseSchema.parse(raw ?? {})
    const all = [...context.options.action, ...context.options.bonus, ...context.options.reactions]
    const byId = new Map(all.map((option) => [option.id, option]))
    const sheet = parseList(combatSheetChangeSchema, response.sheetChanges)
    const modify = parseList(combatModifySchema, response.modify)
    const remove = parseList(combatRemoveSchema, response.remove)
    const add = parseList(combatAddSchema, response.add)
    let dropped = sheet.dropped + modify.dropped + remove.dropped + add.dropped
    const overlay = emptyOverlay()
    const optionChanges: CombatPrepChange[] = []
    for (const item of modify.valid) {
        const option = byId.get(item.optionId)
        if (!option || item.optionId === "free") {
            dropped += 1
            continue
        }
        const patch: CombatOptionPatch = {
            ...(item.label ? { label: item.label } : {}),
            ...(item.detail ? { detail: item.detail } : {}),
            ...(item.economy ? { economy: item.economy } : {}),
            ...(item.attack ? { attack: { ...item.attack, finesse: item.attack.finesse ?? option.attack?.finesse } } : {}),
            ...(item.save ? { save: item.save as CombatOptionPatch["save"] } : {}),
            ...(item.heal ? { heal: item.heal } : {}),
        }
        if (patch.attack && !patch.detail) patch.detail = attackDetail(patch.attack)
        overlay.modify.push({ optionId: item.optionId, patch, reason: item.reason })
        optionChanges.push({ area: "opcao", label: option.label, before: option.detail, after: `${patch.label && patch.label !== option.label ? `${patch.label} · ` : ""}${patchDetail(option, patch)}`, reason: item.reason, applied: true })
    }
    for (const item of remove.valid) {
        const option = byId.get(item.optionId)
        if (!option || item.optionId === "free") {
            dropped += 1
            continue
        }
        overlay.remove.push({ optionId: item.optionId, reason: item.reason })
        optionChanges.push({ area: "opcao", label: option.label, before: option.detail, after: "removida", reason: item.reason, applied: true })
    }
    const links = new Map<string, string>()
    for (const item of add.valid) {
        if (item.chargeId && !context.chargeIds.has(item.chargeId)) {
            dropped += 1
            continue
        }
        if (item.itemId && !context.itemIds.has(item.itemId)) {
            dropped += 1
            continue
        }
        const unresolvable = item.resolution === "attack" ? !item.attack : item.resolution === "save" ? !item.save : item.resolution === "heal" ? !item.heal : item.resolution === "auto" ? !item.attack : false
        const id = `prep:${item.id || randomUUID().slice(0, 8)}`
        const option: PreparedCombatOption = {
            id,
            category: item.category,
            economy: item.economy,
            label: item.label,
            detail: item.detail || (item.attack ? attackDetail(item.attack) : ""),
            target: item.target,
            multiTarget: item.multiTarget,
            resolution: unresolvable ? "utility" : item.resolution,
            ...(item.attack && !unresolvable ? { attack: item.attack } : {}),
            ...(item.save && !unresolvable ? { save: item.save as CombatOptionPatch["save"] } : {}),
            ...(item.heal && !unresolvable ? { heal: item.heal } : {}),
            ...(item.trigger ? { trigger: item.trigger } : {}),
            requires: { chargeId: item.chargeId ?? null, itemId: item.itemId ?? null, spellCircle: item.spellCircle ?? null, concentration: item.concentration ?? false },
        }
        overlay.add.push({ option, reason: item.reason })
        if (item.fromChange) links.set(item.fromChange, id)
        optionChanges.push({ area: "opcao", label: item.label, before: "não existia", after: `${ECONOMY_TEXT[item.economy]}${option.detail ? ` · ${option.detail}` : ""}`, reason: item.reason, applied: true })
    }
    const sneak = response.sneakAttack === undefined || response.sneakAttack === null ? null : sneakAttackSchema.safeParse(response.sneakAttack)
    if (sneak && !sneak.success) dropped += 1
    return { sheetChanges: sheet.valid, overlay, links, optionChanges, rider: sneak?.success ? sneak.data : undefined, dropped }
}

/** Junta a preparação existente com as mudanças de um pedido de ajuste aceito (a mais nova vence, pelo id da opção). */
export function mergeOverlay(base: CombatPrepOverlay, next: CombatPrepOverlay): CombatPrepOverlay {
    const touched = new Set([...next.modify.map((item) => item.optionId), ...next.remove.map((item) => item.optionId), ...next.add.map((item) => item.option.id)])
    return {
        modify: [...base.modify.filter((item) => !touched.has(item.optionId)), ...next.modify],
        remove: [...base.remove.filter((item) => !touched.has(item.optionId)), ...next.remove],
        add: [...base.add.filter((item) => !touched.has(item.option.id)), ...next.add],
        suppress: [...new Set([...base.suppress, ...next.suppress])],
    }
}

/** Grava as correções na ficha e liga cada criação à opção acrescentada (a lista base não a mostra duas vezes). */
export async function applyInterpretation(interpretation: PrepInterpretation, context: { sheetId: string; campaign: Pick<IMaddoxCampaign, "_id" | "ownerId">; characterName: string; origin: "combat-prep" | "combat-adjust" }): Promise<{ changes: CombatPrepChange[]; suppress: string[] }> {
    const { applySheetChanges } = await import("./combat-sheet-writes")
    const written = await applySheetChanges(interpretation.sheetChanges, { sheetId: context.sheetId, campaignId: String(context.campaign._id), auditUserId: context.campaign.ownerId, characterName: context.characterName, origin: context.origin })
    const suppress: string[] = []
    for (const [ref] of interpretation.links) {
        const created = written.created.get(ref)
        if (created) suppress.push(created)
    }
    return { changes: written.changes, suppress }
}

function riderOf(serverDice: string | null, rider: PrepInterpretation["rider"]): { riders: CombatPrepRider[]; change: CombatPrepChange | null } {
    const server: CombatPrepRider[] = serverDice ? [{ key: "sneak-attack", dice: serverDice, source: "server", reason: null }] : []
    if (!rider) return { riders: server, change: null }
    if (rider.dice === serverDice) return { riders: server, change: null }
    const before = serverDice ? riderLabel({ dice: serverDice }) : "sem ataque furtivo"
    const after = rider.dice ? riderLabel({ dice: rider.dice }) : "sem ataque furtivo"
    const reason = rider.reason || "Ajustado pela ficha."
    return { riders: rider.dice ? [{ key: "sneak-attack", dice: rider.dice, source: "maddox", reason }] : [], change: { area: "dano-adicional", label: "Ataque furtivo", before, after, reason, applied: true } }
}

// ── Execução ──────────────────────────────────────────────────────────────────

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function activeStateOf(campaignId: Types.ObjectId, prep: Pick<PrepDoc, "combatId" | "actorKey">) {
    const { findActiveTactical } = await import("./tactical-combat")
    const combat = await findActiveTactical(campaignId)
    if (!combat || String(combat._id) !== String(prep.combatId)) return null
    const state = combat.tactical.characters.find((item) => item.actorKey === prep.actorKey)
    return state && !state.left && state.sheetId ? { combat, state } : null
}

async function discard(prepId: Types.ObjectId, reason: string) {
    await MaddoxCombatPrepModel.updateOne({ _id: prepId, status: { $in: BLOCKING } }, { $set: { status: "discarded", finishedAt: new Date(), jobId: null } })
    log.info({ prepId: String(prepId), reason }, "[maddox] preparação descartada")
}

async function runCombatPrep(campaignId: Types.ObjectId, prepId: Types.ObjectId, jobId: string): Promise<void> {
    const claimed = await MaddoxCombatPrepModel.findOneAndUpdate({ _id: prepId, status: "pending" }, { $set: { status: "running", startedAt: new Date(), jobId, error: null }, $inc: { attempts: 1 } }, { returnDocument: "after" }).lean<PrepDoc>()
    if (!claimed) return
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaignId)
    try {
        const campaign = await MaddoxCampaignModel.findById(campaignId).lean<IMaddoxCampaign>()
        let active = campaign ? await activeStateOf(campaignId, claimed) : null
        if (!campaign || !active) {
            await discard(prepId, "o combate terminou ou o personagem saiu")
            return
        }
        const [{ loadMaddoxSettings, maddoxAvailability }, ai, { readSheetStamp }] = await Promise.all([import("./settings"), import("./combat-prep-ai"), import("./combat-sheet-writes")])
        const { settings } = await loadMaddoxSettings()
        const status = await maddoxAvailability(settings, campaign.rigor)
        if (!status.available) throw new Error(status.reason ?? 'O "Agente Maddox" não está configurado.')
        for (let attempt = 0; ; attempt += 1) {
            const context = await loadPrepSheet(active.state, campaignId)
            if (!context) throw new Error("A ficha do personagem não foi encontrada.")
            const raw = await ai.reviewCombatSheet({ campaign, characterName: claimed.characterName, sheetText: context.sheetText, optionsText: context.optionsText, sneakAttack: context.sneakAttack })
            const interpretation = interpretPrep(raw, context)
            active = await activeStateOf(campaignId, claimed)
            if (!active) {
                await discard(prepId, "o combate terminou durante a preparação")
                return
            }
            // O jogador alterou a ficha durante a preparação: vale o dado mais recente, e o Maddox revisa sobre ele.
            if ((await readSheetStamp(active.state.sheetId!)) !== context.stamp && attempt < MADDOX_COMBAT_PREP_CONFLICT_RETRIES) {
                log.info({ campaignId: String(campaignId), prepId: String(prepId), attempt }, "[maddox] a ficha mudou durante a preparação; o Maddox revisa de novo")
                continue
            }
            const written = await applyInterpretation(interpretation, { sheetId: active.state.sheetId!, campaign, characterName: claimed.characterName, origin: "combat-prep" })
            const rider = riderOf(context.sneakAttack, interpretation.rider)
            const changes = [...written.changes, ...interpretation.optionChanges, ...(rider.change ? [rider.change] : [])]
            const overlay = { ...interpretation.overlay, suppress: written.suppress }
            const saved = await MaddoxCombatPrepModel.findOneAndUpdate({ _id: prepId, status: "running", jobId }, { $set: { status: "ready", overlay, riders: rider.riders, changes, finishedAt: new Date(), jobId: null, error: null } }, { returnDocument: "after" }).lean<PrepDoc>()
            if (saved) await postPrepCard(saved)
            if (interpretation.dropped) log.warn({ campaignId: String(campaignId), prepId: String(prepId), dropped: interpretation.dropped }, "[maddox] itens da preparação descartados na validação")
            log.info({ campaignId: String(campaignId), prepId: String(prepId), character: claimed.characterName, changes: changes.length }, "[maddox] mesa do personagem preparada")
            break
        }
    } catch (error) {
        log.warn({ err: errorText(error), campaignId: String(campaignId), prepId: String(prepId), character: claimed.characterName }, "[maddox] falha na preparação da mesa de combate")
        await MaddoxCombatPrepModel.updateOne({ _id: prepId, status: "running" }, { $set: { status: "failed", error: errorText(error), finishedAt: new Date(), jobId: null } })
    }
    await afterPrepSettled(campaignId, claimed)
}

/** Card privado "Sua mesa está pronta" para o dono do personagem. */
async function postPrepCard(prep: PrepDoc) {
    if (prep.messageId) return
    const message = await MaddoxCampaignMessageModel.create({
        campaignId: prep.campaignId,
        turnNumber: prep.turnNumber,
        phase: "master",
        kind: "combat-prep",
        memberId: prep.memberId,
        userId: prep.userId,
        characterId: prep.characterId,
        characterName: prep.characterName,
        content: "",
        segment: prep.waitRound,
        combatPrep: { combatId: prep.combatId, actorKey: prep.actorKey, characterName: prep.characterName, changes: prep.changes },
    })
    await MaddoxCombatPrepModel.updateOne({ _id: prep._id }, { $set: { messageId: message._id } })
}

/** Depois de cada preparação: com todas prontas, a ordem de iniciativa fecha e a continuação do mestre entra. */
async function afterPrepSettled(campaignId: Types.ObjectId, prep: Pick<PrepDoc, "combatId" | "turnNumber" | "waitRound">) {
    const { publishGameChanged } = await import("./game")
    try {
        if (!(await preparationPending(prep.combatId))) {
            const [{ finishInitiativeIfReady }, { advanceAfterChecks }] = await Promise.all([import("./tactical-combat"), import("./game-checks")])
            await finishInitiativeIfReady(campaignId, prep.turnNumber, prep.waitRound + 1)
            await advanceAfterChecks(campaignId, prep.turnNumber, prep.waitRound)
        }
    } catch (error) {
        log.warn({ err: errorText(error), campaignId: String(campaignId) }, "[maddox] falha ao seguir o combate depois da preparação")
    }
    await publishGameChanged(campaignId)
}

// ── Decisões do dono da campanha ──────────────────────────────────────────────

async function loadOwnerPrep(campaignId: string, prepId: string, userId: string): Promise<{ campaign: IMaddoxCampaign; prep: PrepDoc }> {
    const { loadAsMember, assertActive } = await import("./game")
    const { campaign } = await loadAsMember(campaignId, userId)
    assertActive(campaign)
    if (campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha decide sobre a preparação do combate.", "OWNER_ONLY")
    if (!Types.ObjectId.isValid(prepId)) throw new DomainError(404, "Preparação não encontrada.", "NOT_FOUND")
    const prep = await MaddoxCombatPrepModel.findOne({ _id: new Types.ObjectId(prepId), campaignId: campaign._id }).lean<PrepDoc>()
    if (!prep) throw new DomainError(404, "Preparação não encontrada.", "NOT_FOUND")
    if (prep.status !== "failed") throw new DomainError(409, "Esta preparação não está com falha.", "PREP_NOT_FAILED")
    return { campaign, prep }
}

/** "Tentar de novo": a preparação volta para a fila. */
export async function retryCombatPrep(campaignId: string, prepId: string, userId: string) {
    const { campaign, prep } = await loadOwnerPrep(campaignId, prepId, userId)
    const updated = await MaddoxCombatPrepModel.updateOne({ _id: prep._id, status: "failed" }, { $set: { status: "pending", error: null, jobId: null } })
    if (updated.modifiedCount === 0) throw new DomainError(409, "A preparação mudou. Atualize a mesa.", "PREP_CHANGED")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { combatPrep: String(prep._id), character: prep.characterName, decision: "retry" } })
    await scheduleCombatPreps(campaign._id)
    const { publishGameChanged, getGameState } = await import("./game")
    await publishGameChanged(campaign._id)
    return getGameState(campaignId, userId)
}

/** "Seguir sem preparação": a ficha usa a lista base do servidor (cálculo corrigido e ataque furtivo detectado). */
export async function skipCombatPrep(campaignId: string, prepId: string, userId: string) {
    const { campaign, prep } = await loadOwnerPrep(campaignId, prepId, userId)
    const active = await activeStateOf(campaign._id, prep)
    const context = active ? await loadPrepSheet(active.state, campaign._id).catch(() => null) : null
    const riders: CombatPrepRider[] = context?.sneakAttack ? [{ key: "sneak-attack", dice: context.sneakAttack, source: "server", reason: null }] : []
    const updated = await MaddoxCombatPrepModel.updateOne({ _id: prep._id, status: "failed" }, { $set: { status: "skipped", overlay: emptyOverlay(), riders, changes: [], finishedAt: new Date(), jobId: null } })
    if (updated.modifiedCount === 0) throw new DomainError(409, "A preparação mudou. Atualize a mesa.", "PREP_CHANGED")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { combatPrep: String(prep._id), character: prep.characterName, decision: "skip" } })
    log.info({ campaignId, prepId, character: prep.characterName }, "[maddox] dono seguiu sem a preparação da ficha")
    await afterPrepSettled(campaign._id, prep)
    const { getGameState } = await import("./game")
    return getGameState(campaignId, userId)
}

/** Fim do combate: as preparações que ainda não terminaram são descartadas (nada é gravado na ficha). */
export async function discardCombatPreps(combatId: Types.ObjectId): Promise<void> {
    await MaddoxCombatPrepModel.updateMany({ combatId, status: { $in: BLOCKING } }, { $set: { status: "discarded", finishedAt: new Date(), jobId: null } })
}

/** O membro saiu do combate: a preparação dele deixa de bloquear a ordem. */
export async function discardMemberPrep(combatId: Types.ObjectId, memberId: Types.ObjectId): Promise<void> {
    await MaddoxCombatPrepModel.updateMany({ combatId, memberId, status: { $in: BLOCKING } }, { $set: { status: "discarded", finishedAt: new Date(), jobId: null } })
}

/** Preparações do combate (para o DTO), na ordem de criação. */
export async function loadCombatPreps(combatId: Types.ObjectId | string): Promise<PrepDoc[]> {
    return MaddoxCombatPrepModel.find({ combatId: new Types.ObjectId(String(combatId)) }).sort({ _id: 1 }).lean<PrepDoc[]>()
}

export { track as trackCombatPrepWork }
