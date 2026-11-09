import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import {
    MADDOX_CAMPAIGN_AUDIT_ENTITY,
    MADDOX_COIN_KEYS,
    MADDOX_COIN_SHEET_FIELDS,
    MADDOX_COMBAT_OUTCOME_LABELS,
    MADDOX_COMBAT_RIGORS,
    MADDOX_COMBAT_SHEET_REWARD_RIGORS,
    MADDOX_COMBATANT_OUTCOME_LABELS,
    MADDOX_TACTICAL_COMBAT_RIGORS,
    MADDOX_TOOL_NAME_MAX,
    type MaddoxCombatantOutcome,
    type MaddoxNpcStatus,
    type MaddoxRigorLevel,
} from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import {
    MaddoxCharacterModel,
    MaddoxCombatModel,
    MaddoxNpcModel,
    type IMaddoxCampaign,
    type IMaddoxCombat,
    type IMaddoxCombatReward,
    type IMaddoxCombatant,
} from "../models"
import type { MaddoxCombatRewardDto, MaddoxGameCombatDto, MaddoxGameCombatEventDto } from "../game-types"
import type { MaddoxDraftCombatEvent, MaddoxDraftCombatReward, MaddoxDraftCombatant } from "./game-live"
import { onCombatEnded } from "./combat-image"
import { tacticalSnapshot } from "./tactical-dto"
import type { TacticalCombat } from "./tactical-combat"

/**
 * Combate narrativo (Maddox 6) — SOMENTE servidor. O narrador abre, atualiza e encerra o combate pelas ferramentas
 * (`start_combat`, `update_combat`, `end_combat`); os pedidos ficam no job da fila (rascunho) e só são aplicados aqui,
 * depois que a narração foi gerada e antes de ela ser gravada. Se a geração falhar, o combate não muda. Se a gravação das
 * mensagens falhar depois de aplicar o combate, a retomada do turno grava o card que faltou e dispara os efeitos do fim
 * (`finishCombatTurn`): os efeitos do fim nunca rodam antes de os cards estarem gravados.
 *
 * O fim do combate grava o desfecho e aplica os efeitos: situação dos NPCs, condição dos personagens, o marco da
 * história (memória `evento`), as recompensas na ficha (só Equilibrado) e o gancho da imagem de fim de batalha.
 */

const log = loggerFor({ module: "maddox", feature: "combat" })

const keyOf = (value: string) => normalizeCatalogName(value)
const clip = (value: string | undefined | null, max: number) => {
    const text = (value ?? "").trim()
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** O grau registra o combate narrativo (Narrativo, Flexível e Equilibrado). */
export const usesCombat = (rigor: MaddoxRigorLevel) => MADDOX_COMBAT_RIGORS.includes(rigor)
/** O grau registra o combate: narrativo (Maddox 6) ou tático (Maddox 7, Rigoroso e Fiel ao D&D). */
export const registersCombat = (rigor: MaddoxRigorLevel) => usesCombat(rigor) || MADDOX_TACTICAL_COMBAT_RIGORS.includes(rigor)
/** O grau aplica as recompensas do combate na ficha D&D. */
export const appliesCombatRewards = (rigor: MaddoxRigorLevel) => MADDOX_COMBAT_SHEET_REWARD_RIGORS.includes(rigor)

/** Desfecho do adversário → situação do NPC ligado (`null` = mantém a atual). */
export function npcStatusAfter(outcome: MaddoxCombatantOutcome | null): MaddoxNpcStatus | null {
    if (outcome === "morto") return "dead"
    if (outcome === "fugiu") return "unknown"
    return null
}

export async function findActiveCombat(campaignId: Types.ObjectId): Promise<IMaddoxCombat | null> {
    return MaddoxCombatModel.findOne({ campaignId, status: "active" }).lean<IMaddoxCombat>()
}

/** Combate como o narrador o vê no meio da geração: o gravado mais os eventos do rascunho. */
export interface EffectiveCombat {
    active: boolean
    title: string
    combatants: { name: string; side: "inimigo" | "aliado"; condition: string }[]
}

export function replayCombat(base: Pick<IMaddoxCombat, "title" | "combatants"> | null, events: readonly MaddoxDraftCombatEvent[]): EffectiveCombat {
    let state: EffectiveCombat = base ? { active: true, title: base.title, combatants: base.combatants.map((item) => ({ name: item.name, side: item.side, condition: item.condition })) } : { active: false, title: "", combatants: [] }
    for (const event of events) {
        if (event.type === "start") state = { active: true, title: event.title, combatants: event.combatants.map((item) => ({ name: item.name, side: item.side, condition: item.condition })) }
        else if (event.type === "update" && state.active) {
            for (const change of event.combatants) {
                const existing = state.combatants.find((item) => keyOf(item.name) === keyOf(change.name))
                if (existing) {
                    if (change.condition !== undefined) existing.condition = change.condition
                } else state.combatants.push({ name: change.name, side: change.side ?? "inimigo", condition: change.condition ?? "" })
            }
        } else if (event.type === "end") state = { active: false, title: "", combatants: [] }
    }
    return state
}

// ── Aplicação do rascunho ──────────────────────────────────────────────────────

type CampaignRef = Pick<IMaddoxCampaign, "_id" | "rigor" | "ownerId">

/** Card a inserir com a narração: o início antes dela, o fim depois. */
export interface CombatMessagePlan {
    event: "start" | "end"
    combatId: Types.ObjectId
}

export interface AppliedCombat {
    messages: CombatMessagePlan[]
    /** Combates tocados por esta narração (contam mais um turno do mestre). */
    touched: Types.ObjectId[]
    /** Combate tático: cards de iniciativa dos personagens, gravados logo depois da narração. */
    extraMessages: Record<string, unknown>[]
}

/** NPC ligado ao adversário: o já registrado pelo nome ou, com `registerNpc`, um novo (visível aos jogadores). */
async function linkCombatant(campaignId: Types.ObjectId, combatant: MaddoxDraftCombatant): Promise<IMaddoxCombatant> {
    const name = clip(combatant.name, MADDOX_TOOL_NAME_MAX)
    const nameKey = keyOf(name)
    let npcId: Types.ObjectId | null = null
    const npc = await MaddoxNpcModel.findOne({ campaignId, nameKey }).select("_id").lean<{ _id: Types.ObjectId }>()
    if (npc) npcId = npc._id
    else if (combatant.registerNpc) {
        const created = await MaddoxNpcModel.create({ campaignId, name, nameKey, publicDescription: combatant.description, visibility: "players" })
        npcId = created._id
    }
    return { name, nameKey, side: combatant.side, quantity: combatant.quantity, description: combatant.description, condition: combatant.condition, npcId, outcome: null }
}

async function applyStart(campaign: CampaignRef, turnNumber: number, event: Extract<MaddoxDraftCombatEvent, { type: "start" }>, round: number, extra: Record<string, unknown>[]): Promise<CombatMessagePlan | null> {
    if (event.tactical) {
        const { createTacticalCombat } = await import("./tactical-combat")
        const plan = await createTacticalCombat(campaign, turnNumber, round, { title: event.title, location: event.location, surprise: event.tactical.surprise, combatants: event.tactical.combatants }, async (item) =>
            (await linkCombatant(campaign._id, { ...item, name: item.individual, quantity: 1, registerNpc: item.registerNpc && item.quantity <= 1 })).npcId,
        )
        if (!plan) return null
        extra.push(...plan.initiativeMessages)
        return { event: "start", combatId: plan.combatId }
    }
    const combatants: IMaddoxCombatant[] = []
    for (const item of event.combatants) combatants.push(await linkCombatant(campaign._id, item))
    try {
        const created = await MaddoxCombatModel.create({ campaignId: campaign._id, status: "active", title: event.title, location: event.location, startedTurn: turnNumber, combatants })
        log.info({ campaignId: String(campaign._id), combatId: String(created._id), turnNumber, combatants: combatants.length }, "[maddox] combate começou")
        return { event: "start", combatId: created._id }
    } catch (error) {
        // Índice único parcial: outro início venceu a corrida — o combate ativo é o dele (o card já existe).
        if ((error as { code?: number }).code === 11000) {
            log.info({ campaignId: String(campaign._id), turnNumber }, "[maddox] combate já estava ativo; início ignorado")
            return null
        }
        throw error
    }
}

async function applyUpdate(campaign: CampaignRef, event: Extract<MaddoxDraftCombatEvent, { type: "update" }>): Promise<Types.ObjectId | null> {
    const active = await findActiveCombat(campaign._id)
    if (!active) return null
    if (active.mode === "tactical") return applyTacticalUpdate(campaign, active, event)
    const combatants = active.combatants.map((item) => ({ ...item }))
    for (const change of event.combatants) {
        const existing = combatants.find((item) => item.nameKey === keyOf(change.name))
        if (existing) {
            if (change.condition !== undefined) existing.condition = change.condition
            if (change.quantity !== undefined) existing.quantity = change.quantity
            if (change.description !== undefined && change.description) existing.description = change.description
        } else {
            combatants.push(
                await linkCombatant(campaign._id, { name: change.name, side: change.side ?? "inimigo", quantity: change.quantity ?? 1, description: change.description ?? "", condition: change.condition ?? "", registerNpc: Boolean(change.registerNpc) }),
            )
        }
    }
    await MaddoxCombatModel.updateOne({ _id: active._id, status: "active" }, { $set: { combatants } })
    return active._id
}

/** Combate tático: condição narrativa dos que já lutam e os reforços (com iniciativa rolada ao entrar). */
async function applyTacticalUpdate(campaign: CampaignRef, active: IMaddoxCombat, event: Extract<MaddoxDraftCombatEvent, { type: "update" }>): Promise<Types.ObjectId | null> {
    const tactical = await import("./tactical-combat")
    const fresh = event.tactical ?? []
    const individuals = tactical.expandCombatants(fresh, active.combatants.map((item) => item.name))
    const added: IMaddoxCombatant[] = []
    for (const item of individuals) {
        const linked = await linkCombatant(campaign._id, { ...item, name: item.individual, quantity: 1, registerNpc: item.registerNpc && item.quantity <= 1 })
        added.push({ ...linked, tactical: tactical.combatantState(`npc:${randomUUID().slice(0, 8)}`, item.groupKey, item.stats) })
    }
    await tactical.mutateTactical(campaign._id, async (combat) => {
        for (const change of event.combatants) {
            const existing = combat.combatants.find((item) => item.nameKey === keyOf(change.name))
            if (existing && change.condition !== undefined) existing.condition = change.condition
        }
        if (!added.length) return
        const activeKey = combat.tactical.order[combat.tactical.activeIndex]?.actorKey ?? null
        const slots = await tactical.rollMonsterInitiative(added.map((item) => ({ actorKey: item.tactical!.actorKey, name: item.name, groupKey: item.tactical!.groupKey, stats: item.tactical!.stats })), "normal", combat.tactical.order.length)
        combat.combatants.push(...added)
        const { sortInitiative } = await import("../combat-rules")
        combat.tactical.order = sortInitiative([...combat.tactical.order, ...slots].map((slot) => ({ ...slot, total: slot.total ?? 0 })))
        if (activeKey) combat.tactical.activeIndex = combat.tactical.order.findIndex((slot) => slot.actorKey === activeKey)
    })
    log.info({ campaignId: String(campaign._id), combatId: String(active._id), reinforcements: added.length }, "[maddox] combate tático atualizado")
    return active._id
}

/** Item da recompensa no catálogo (só para quem tem ficha, no Equilibrado); fora dele vira item próprio com aviso. */
async function resolveReward(campaign: CampaignRef, reward: MaddoxDraftCombatReward): Promise<IMaddoxCombatReward> {
    const coins = reward.coins ? Object.fromEntries(MADDOX_COIN_KEYS.filter((key) => (reward.coins?.[key] ?? 0) > 0).map((key) => [key, reward.coins![key]!])) : null
    const base: IMaddoxCombatReward = {
        kind: reward.kind,
        description: reward.description,
        characterId: reward.characterId ? new Types.ObjectId(reward.characterId) : null,
        characterName: reward.characterName,
        coins: coins && Object.keys(coins).length ? coins : null,
        item: null,
        applied: false,
        sheetId: null,
        warning: null,
    }
    if (reward.kind !== "item" || !reward.item) return base
    const name = clip(reward.item.ref, MADDOX_TOOL_NAME_MAX)
    if (!appliesCombatRewards(campaign.rigor)) return { ...base, item: { catalogItemId: null, name, quantity: reward.item.quantity } }
    const { findCatalogEntity } = await import("./character-build")
    const found = await findCatalogEntity<{ _id: Types.ObjectId; name: string }>("item", reward.item.ref).catch(() => null)
    if (found) return { ...base, item: { catalogItemId: found._id, name: found.name, quantity: reward.item.quantity } }
    return { ...base, item: { catalogItemId: null, name, quantity: reward.item.quantity }, warning: `"${name}" não está no catálogo: entrou como item próprio.` }
}

async function applyEnd(campaign: CampaignRef, turnNumber: number, event: Extract<MaddoxDraftCombatEvent, { type: "end" }>): Promise<CombatMessagePlan | null> {
    const active = await findActiveCombat(campaign._id)
    if (!active) return null
    // NPC registrado depois do início (ex.: `save_npc` numa narração seguinte): liga agora, pelo nome, para receber o desfecho.
    const unlinked = active.combatants.filter((item) => !item.npcId).map((item) => item.nameKey)
    const npcs = unlinked.length ? await MaddoxNpcModel.find({ campaignId: campaign._id, nameKey: { $in: unlinked } }).select("_id nameKey").lean<{ _id: Types.ObjectId; nameKey: string }[]>() : []
    const npcByKey = new Map(npcs.map((npc) => [npc.nameKey, npc._id]))
    const combatants = active.combatants.map((item) => {
        const outcome = event.combatants.find((change) => keyOf(change.name) === item.nameKey)?.outcome
        const npcId = item.npcId ?? npcByKey.get(item.nameKey) ?? null
        return outcome ? { ...item, npcId, outcome } : { ...item, npcId }
    })
    const rewards: IMaddoxCombatReward[] = []
    for (const reward of event.rewards) rewards.push(await resolveReward(campaign, reward))
    const characterOutcomes = event.characterStates.map((state) => ({ characterId: new Types.ObjectId(state.characterId), characterName: state.characterName, condition: state.condition }))
    // Troca condicional: só uma aplicação encerra o combate (e aplica os efeitos).
    const ended = await MaddoxCombatModel.findOneAndUpdate(
        { _id: active._id, status: "active" },
        {
            $set: {
                status: "ended",
                outcome: event.outcome,
                summary: event.summary,
                masterNotes: event.masterNotes,
                combatants,
                rewards,
                characterOutcomes,
                finalScene: event.finalScene,
                endedTurn: turnNumber,
                endedAt: new Date(),
            },
        },
        { returnDocument: "after" },
    ).lean<IMaddoxCombat>()
    if (!ended) return null
    log.info({ campaignId: String(campaign._id), combatId: String(ended._id), turnNumber, outcome: event.outcome, rewards: rewards.length }, "[maddox] combate terminou")
    // Os efeitos do fim só rodam depois que os cards e a narração forem gravados (`finishCombatTurn`).
    return { event: "end", combatId: ended._id }
}

/**
 * Fecha o combate do turno depois de gravar a narração (e na retomada): grava o card que faltar — de um combate aberto ou
 * encerrado neste turno cujo card não chegou a ser gravado (falha entre aplicar o combate e gravar as mensagens) — e dispara
 * os efeitos do fim ainda não aplicados (troca condicional `effectsApplied`: uma vez só).
 */
export async function finishCombatTurn(campaign: CampaignRef, turnNumber: number, segment: number): Promise<void> {
    const { MaddoxCampaignMessageModel } = await import("../models")
    const combats = await MaddoxCombatModel.find({ campaignId: campaign._id, $or: [{ startedTurn: turnNumber }, { endedTurn: turnNumber }] }).lean<IMaddoxCombat[]>()
    for (const combat of combats) {
        const wanted: ("start" | "end")[] = [...(combat.startedTurn === turnNumber ? ["start" as const] : []), ...(combat.status === "ended" && combat.endedTurn === turnNumber ? ["end" as const] : [])]
        for (const event of wanted) {
            const exists = await MaddoxCampaignMessageModel.exists({ campaignId: campaign._id, kind: "combat", "combat.combatId": combat._id, "combat.event": event })
            if (exists) continue
            await MaddoxCampaignMessageModel.create({ campaignId: campaign._id, turnNumber, phase: "master", kind: "combat", content: "", segment, combat: { event, combatId: combat._id } })
            log.warn({ campaignId: String(campaign._id), combatId: String(combat._id), turnNumber, event }, "[maddox] card do combate faltava (gravação interrompida); gravado na retomada")
        }
        if (combat.status !== "ended" || combat.effectsApplied) continue
        const claimed = await MaddoxCombatModel.findOneAndUpdate({ _id: combat._id, status: "ended", effectsApplied: { $ne: true } }, { $set: { effectsApplied: true } }, { returnDocument: "after" }).lean<IMaddoxCombat>()
        if (claimed) await afterCombatEnded(campaign, claimed, combat.endedTurn ?? turnNumber)
    }
}

/** Efeitos do fim do combate. Cada um falha sozinho (aviso no log) sem desfazer o fim. */
async function afterCombatEnded(campaign: CampaignRef, combat: IMaddoxCombat, turnNumber: number): Promise<void> {
    const step = async (name: string, run: () => Promise<unknown>) => {
        try {
            await run()
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id), combatId: String(combat._id), step: name }, "[maddox] efeito do fim do combate falhou")
        }
    }
    await step("npcs", async () => {
        for (const item of combat.combatants) {
            const status = npcStatusAfter(item.outcome)
            if (item.npcId && status) await MaddoxNpcModel.updateOne({ _id: item.npcId, campaignId: campaign._id }, { $set: { status } })
            // NPC Opex que morre no combate deixa de ser Opex sozinho (DND-27).
            if (item.npcId && status === "dead") await (await import("./opex-npcs")).retireOpexNpcIfDead(campaign._id, item.npcId)
        }
    })
    await step("characters", async () => {
        for (const state of combat.characterOutcomes) await MaddoxCharacterModel.updateOne({ _id: state.characterId, campaignId: campaign._id }, { $set: { currentState: state.condition, currentStatePublic: true } })
    })
    await step("memory", () => saveCombatMemory(campaign._id, combat, turnNumber))
    await step("rewards", () => applyCombatRewards(campaign, combat._id))
    await step("image", () => onCombatEnded(combat))
}

/** Linha de cada adversário com desfecho ("Varn — Morto"). */
export function combatantOutcomeLines(combat: Pick<IMaddoxCombat, "combatants">): string[] {
    return combat.combatants
        .filter((item) => item.outcome)
        .map((item) => `${item.name}${item.quantity > 1 ? ` (${item.quantity})` : ""}${item.side === "aliado" ? " [aliado]" : ""} — ${MADDOX_COMBATANT_OUTCOME_LABELS[item.outcome!]}`)
}

/**
 * Marco da história (memória `evento`, visível aos jogadores): o desfecho do combate, no Engramind (única
 * fonte), uma memória POR COMBATE (chave `mx:combate:<id>`). Sem a rede, entra na fila temporária; nunca
 * derruba o fim do combate.
 */
async function saveCombatMemory(campaignId: Types.ObjectId, combat: IMaddoxCombat, turnNumber: number): Promise<void> {
    const title = clip(`Combate: ${combat.title} (turno ${combat.startedTurn})`, MADDOX_TOOL_NAME_MAX)
    const lines = [
        `${MADDOX_COMBAT_OUTCOME_LABELS[combat.outcome ?? "interrompido"]}${combat.location ? ` em ${combat.location}` : ""} (turnos ${combat.startedTurn}–${turnNumber}).`,
        combat.summary,
        ...(combatantOutcomeLines(combat).length ? [`Adversários: ${combatantOutcomeLines(combat).join("; ")}.`] : []),
        ...(combat.rewards.length ? [`Recompensas: ${combat.rewards.map((reward) => rewardText(reward)).join("; ")}.`] : []),
    ].filter(Boolean)
    try {
        const { saveCampaignMemory } = await import("@/features/engramind/server/campaign-memories")
        const { combatMemoryKey } = await import("@/features/engramind/campaign-memory-format")
        await saveCampaignMemory(String(campaignId), { kind: "evento", title, text: lines.join("\n"), visibility: "players", turnNumber, tags: ["combate"], key: combatMemoryKey(String(combat._id)) })
    } catch (error) {
        log.warn({ campaignId: String(campaignId), combatId: String(combat._id), err: error instanceof Error ? error.message : String(error) }, "[maddox] marco do combate não gravado na rede de memórias")
    }
}

const COIN_LABELS: Record<(typeof MADDOX_COIN_KEYS)[number], string> = { po: "po", pp: "pp", pe: "pe", pc: "pc", pl: "pl" }

/** "30 po, 5 pp para Lyra" / "Espada Longa (1) para Lyra" / descrição livre. */
export function rewardText(reward: Pick<IMaddoxCombatReward, "kind" | "description" | "coins" | "item" | "characterName">): string {
    const to = reward.characterName ? ` para ${reward.characterName}` : ""
    if (reward.kind === "moedas" && reward.coins) {
        const coins = MADDOX_COIN_KEYS.filter((key) => (reward.coins?.[key] ?? 0) > 0).map((key) => `${reward.coins![key]} ${COIN_LABELS[key]}`)
        if (coins.length) return `${coins.join(", ")}${to}`
    }
    if (reward.kind === "item" && reward.item) return `${reward.item.name}${reward.item.quantity > 1 ? ` (${reward.item.quantity})` : ""}${to}`
    return `${reward.description}${to}`
}

// ── Recompensas na ficha (Equilibrado) ────────────────────────────────────────

type CharacterItemRecord = import("@/features/character-sheets/types/character-sheet.types").CharacterItem

const plain = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T

async function publishSheet(publish: () => Promise<void>) {
    try {
        await publish()
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] falha ao avisar a ficha em tempo real")
    }
}

/**
 * Aplica as recompensas ainda não aplicadas do combate encerrado na ficha de quem recebeu (moedas somadas, itens criados
 * sem equipar). Cada recompensa troca `applied: false → true` antes de tocar a ficha: uma retomada nunca aplica duas vezes.
 */
export async function applyCombatRewards(campaign: CampaignRef, combatId: Types.ObjectId): Promise<number> {
    if (!appliesCombatRewards(campaign.rigor)) return 0
    const combat = await MaddoxCombatModel.findById(combatId).lean<IMaddoxCombat>()
    if (!combat || combat.status !== "ended") return 0
    let applied = 0
    for (const [index, reward] of combat.rewards.entries()) {
        if (reward.applied || !reward.characterId || reward.kind === "outro") continue
        if (reward.kind === "moedas" && !reward.coins) continue
        if (reward.kind === "item" && !reward.item) continue
        const character = await MaddoxCharacterModel.findOne({ _id: reward.characterId, campaignId: campaign._id }).select("sheetId").lean<{ sheetId: Types.ObjectId | null }>()
        if (!character?.sheetId) continue
        const claimed = await MaddoxCombatModel.updateOne({ _id: combat._id, [`rewards.${index}.applied`]: false }, { $set: { [`rewards.${index}.applied`]: true, [`rewards.${index}.sheetId`]: character.sheetId } })
        if (claimed.modifiedCount === 0) continue
        const sheetId = character.sheetId
        let publish: (() => Promise<void>) | null = null
        try {
            // Dentro do try: falha de carga dos módulos depois do claim também desfaz a marca.
            const [{ CharacterSheet }, { CharacterItem }, { CharacterSheetPusherService }] = await Promise.all([
                import("@/features/character-sheets/models/character-sheet"),
                import("@/features/character-sheets/models/character-item"),
                import("@/features/character-sheets/realtime/character-sheet-pusher-service"),
            ])
            if (reward.kind === "moedas" && reward.coins) {
                const inc = Object.fromEntries(MADDOX_COIN_KEYS.filter((key) => (reward.coins?.[key] ?? 0) > 0).map((key) => [`coins.${MADDOX_COIN_SHEET_FIELDS[key]}`, reward.coins![key]!]))
                const sheet = await CharacterSheet.findByIdAndUpdate(sheetId, { $inc: inc }, { returnDocument: "after" }).lean()
                if (!sheet) throw new Error("ficha não encontrada")
                publish = () => CharacterSheetPusherService.getInstance().publishSheetPatched({ sheet: plain({ ...sheet, _id: String(sheet._id) }) })
            } else if (reward.kind === "item" && reward.item) {
                const doc = await buildItemDoc(sheetId, reward.item)
                const [created] = await CharacterItem.insertMany([doc])
                const record = plain<CharacterItemRecord>(created!.toObject())
                publish = () => CharacterSheetPusherService.getInstance().publishCollectionChanged({ sheetId: String(sheetId), collection: "items", action: "created", recordId: String(created!._id), record })
            }
        } catch (error) {
            // A ficha não recebeu: desfaz a marca (o card não mostra "Na ficha") e segue para as próximas recompensas.
            await MaddoxCombatModel.updateOne({ _id: combat._id, [`rewards.${index}.applied`]: true }, { $set: { [`rewards.${index}.applied`]: false, [`rewards.${index}.sheetId`]: null } }).catch(() => undefined)
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id), combatId: String(combat._id), sheetId: String(sheetId), kind: reward.kind }, "[maddox] recompensa do combate não entrou na ficha")
            continue
        }
        if (publish) await publishSheet(publish)
        applied += 1
        await recordAudit({
            userId: campaign.ownerId,
            entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
            entidadeId: String(campaign._id),
            acao: AcaoAuditoria.ATUALIZAR,
            depois: { by: "maddox", combat: String(combat._id), reward: rewardText(reward), sheet: String(sheetId) },
        })
        log.info({ campaignId: String(campaign._id), combatId: String(combat._id), sheetId: String(sheetId), kind: reward.kind }, "[maddox] recompensa do combate aplicada na ficha")
    }
    return applied
}

/** Item da ficha a partir do catálogo (menção e campos de CA, como a ficha da entrevista) ou próprio (texto). */
async function buildItemDoc(sheetId: Types.ObjectId, item: NonNullable<IMaddoxCombatReward["item"]>) {
    const { escapeHtmlText, mentionParagraphHtml, resolveCatalogItemType } = await import("@/features/character-sheets/utils/sheet-rules")
    if (item.catalogItemId) {
        const { ItemModel } = await import("@/features/items/database/item")
        type CatalogItemDoc = { _id: Types.ObjectId; name: string; type?: string; image?: string; ac?: number; acType?: "base" | "bonus"; armorType?: string; acBonus?: number }
        const catalog = await ItemModel.findById(item.catalogItemId).lean<CatalogItemDoc>()
        if (catalog) {
            const armor: "leve" | "média" | "pesada" | null = catalog.armorType === "leve" || catalog.armorType === "média" || catalog.armorType === "pesada" ? catalog.armorType : null
            return {
                sheetId,
                catalogItemId: catalog._id,
                name: mentionParagraphHtml({ id: String(catalog._id), entityType: "Item", label: catalog.name }),
                image: catalog.image || null,
                quantity: item.quantity,
                notes: "",
                equipped: false,
                catalogItemType: resolveCatalogItemType({ type: catalog.type ?? null }),
                catalogAc: catalog.ac ?? null,
                catalogAcType: catalog.acType ?? null,
                catalogArmorType: armor,
                catalogAcBonus: catalog.acBonus ?? null,
            }
        }
    }
    return { sheetId, catalogItemId: null, name: `<p>${escapeHtmlText(item.name)}</p>`, image: null, quantity: item.quantity, notes: "", equipped: false }
}

/**
 * Aplica os eventos de combate pedidos na narração, na ordem. Devolve os cards a gravar com a narração e os combates
 * tocados (para contar o turno do mestre).
 */
export async function applyCombatDrafts(campaign: CampaignRef, turnNumber: number, events: readonly MaddoxDraftCombatEvent[], round = 0): Promise<AppliedCombat> {
    const messages: CombatMessagePlan[] = []
    const touched: Types.ObjectId[] = []
    const extraMessages: Record<string, unknown>[] = []
    for (const event of events) {
        if (event.type === "start") {
            const plan = await applyStart(campaign, turnNumber, event, round, extraMessages)
            if (plan) {
                messages.push(plan)
                touched.push(plan.combatId)
            }
        } else if (event.type === "update") {
            const id = await applyUpdate(campaign, event)
            if (id) touched.push(id)
        } else {
            const plan = await applyEnd(campaign, turnNumber, event)
            if (plan) {
                messages.push(plan)
                touched.push(plan.combatId)
            }
        }
    }
    return { messages, touched, extraMessages }
}

/** Mais uma narração do turno do mestre com o combate (ativo antes dela ou tocado por ela). */
export async function countCombatNarration(campaignId: Types.ObjectId, ids: readonly Types.ObjectId[]): Promise<void> {
    const unique = [...new Map(ids.map((id) => [String(id), id])).values()]
    if (!unique.length) return
    await MaddoxCombatModel.updateMany({ _id: { $in: unique }, campaignId }, { $inc: { masterTurns: 1 } })
}

// ── DTOs ───────────────────────────────────────────────────────────────────────

export function combatDto(combat: IMaddoxCombat, opexNpcIds: ReadonlySet<string> = new Set()): MaddoxGameCombatDto {
    return {
        id: String(combat._id),
        title: combat.title,
        location: combat.location ?? "",
        startedTurn: combat.startedTurn,
        masterTurns: combat.masterTurns ?? 0,
        combatants: (combat.combatants ?? []).map((item) => ({ name: item.name, side: item.side, quantity: item.quantity ?? 1, condition: item.condition ?? "", outcome: item.outcome ?? null, ...(item.npcId && opexNpcIds.has(String(item.npcId)) ? { opex: true } : {}) })),
        mode: combat.mode === "tactical" ? "tactical" : "narrative",
        tactical: null,
    }
}

const rewardDto = (reward: IMaddoxCombatReward): MaddoxCombatRewardDto => ({ kind: reward.kind, description: rewardText(reward), characterName: reward.characterName ?? null, applied: Boolean(reward.applied), warning: reward.warning ?? null })

/** Card do combate: o início mostra o encontro; o fim, o desfecho (sem notas do mestre nem a cena final). */
export function combatEventDto(combat: IMaddoxCombat, event: "start" | "end" | "order", opexNpcIds: ReadonlySet<string> = new Set()): MaddoxGameCombatEventDto {
    const base = combatDto(combat, opexNpcIds)
    if (event === "order") {
        // Ordem de iniciativa: o retrato da ordem como está (sem PV, que a tela lê do combate ativo).
        const tactical = combat.mode === "tactical" && combat.tactical ? tacticalSnapshot(combat as TacticalCombat, new Map(), new Map(), opexNpcIds) : null
        return { ...base, tactical, event, outcome: null, summary: "", rewards: [], endedTurn: null }
    }
    if (event === "start") return { ...base, event, outcome: null, summary: "", rewards: [], endedTurn: null, combatants: base.combatants.map((item) => ({ ...item, outcome: null })) }
    return { ...base, event, outcome: combat.outcome ?? null, summary: combat.summary ?? "", rewards: (combat.rewards ?? []).map(rewardDto), endedTurn: combat.endedTurn ?? null }
}

/** Combates citados pelos cards de uma página da mesa. */
export async function loadCombats(ids: readonly Types.ObjectId[]): Promise<Map<string, IMaddoxCombat>> {
    if (!ids.length) return new Map()
    const combats = await MaddoxCombatModel.find({ _id: { $in: ids } }).lean<IMaddoxCombat[]>()
    return new Map(combats.map((combat) => [String(combat._id), combat]))
}
