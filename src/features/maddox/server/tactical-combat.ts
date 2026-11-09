import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import { MADDOX_COMBAT_OFFLINE_GRACE_MS, MADDOX_COMBAT_ROLL_CLAIM_STALE_MS, MADDOX_ENEMY_INITIATIVE_REVEAL_MS, MADDOX_NPC_BLOCK_PAUSE_MS, MADDOX_TACTICAL_COMBAT_RIGORS, type MaddoxRigorLevel } from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { canAct, freshEconomy, formatDiceExpression, parseDiceExpression, sortInitiative, type RollMode } from "../combat-rules"
import type { IMaddoxCombatRoll, InitiativeSlot, MonsterStats, TacticalCharacterState, TacticalCombatState, TacticalCombatantState } from "../combat-types"
import { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCombatModel, type IMaddoxCampaign, type IMaddoxCombat, type IMaddoxCombatant } from "../models"
import { rechargeHit } from "./combat-monsters"
import { isOpexUserId } from "./opex-members"

/**
 * Combate tático (Maddox 7) — SOMENTE servidor: estado gravado, início com iniciativa, fila dos adversários do turno do
 * mestre e a abertura da vez do próximo personagem. As ações do jogador ficam em `tactical-actions.ts`; as dos
 * adversários (ferramentas do Maddox) em `tactical-master.ts`; as reações em `combat-reactions.ts`.
 *
 * O motor de turnos do Maddox 3 continua: em combate, o turno dos jogadores é a vez de UM personagem (só o membro dele é
 * elegível, `turn.combatActor`) e o turno do mestre narra essa vez e conduz os adversários até o próximo personagem.
 */

const log = loggerFor({ module: "maddox", feature: "tactical-combat" })

/**
 * Tempos da sequência do combate tático (DND-25): o dado dos inimigos na tela e a pausa entre dois blocos. Objeto
 * mutável só para os testes encurtarem a espera; a aplicação usa os padrões das constantes.
 */
export const combatTiming = { enemyRevealMs: MADDOX_ENEMY_INITIATIVE_REVEAL_MS, npcBlockPauseMs: MADDOX_NPC_BLOCK_PAUSE_MS }

export const usesTacticalCombat = (rigor: MaddoxRigorLevel) => MADDOX_TACTICAL_COMBAT_RIGORS.includes(rigor)

export type TacticalCombat = IMaddoxCombat & { mode: "tactical"; tactical: TacticalCombatState }
export const isTactical = (combat: IMaddoxCombat | null | undefined): combat is TacticalCombat => Boolean(combat && combat.mode === "tactical" && combat.tactical)

export type CombatActor =
    | { kind: "character"; key: string; name: string; state: TacticalCharacterState }
    | { kind: "combatant"; key: string; name: string; combatant: IMaddoxCombatant; state: TacticalCombatantState }

export function findActor(combat: TacticalCombat, key: string | null | undefined): CombatActor | null {
    if (!key) return null
    const character = combat.tactical.characters.find((item) => item.actorKey === key)
    if (character) return { kind: "character", key, name: character.name, state: character }
    const combatant = combat.combatants.find((item) => item.tactical?.actorKey === key)
    if (combatant?.tactical) return { kind: "combatant", key, name: combatant.name, combatant, state: combatant.tactical }
    return null
}

/** Adversário ou personagem pelo nome (sem acento e sem caixa). */
export function findActorByName(combat: TacticalCombat, name: string): CombatActor | null {
    const wanted = normalizeCatalogName(name)
    const slot = combat.tactical.order.find((item) => normalizeCatalogName(item.name) === wanted)
    return slot ? findActor(combat, slot.actorKey) : null
}

export const enemiesOf = (combat: TacticalCombat) => combat.combatants.filter((item) => item.side === "inimigo" && item.tactical)
export const livingEnemies = (combat: TacticalCombat) => enemiesOf(combat).filter((item) => !item.tactical!.defeated)
/** Personagem que ainda tem vez: não morto, não estável, não saiu (morrendo tem vez para o teste contra a morte). */
export const takesTurn = (state: TacticalCharacterState) => !state.dead && !state.left && !(state.stable && state.hpZero)
const consciousOrDying = (combat: TacticalCombat) => combat.tactical.characters.some(takesTurn)
export const consciousCharacters = (combat: TacticalCombat) => combat.tactical.characters.filter((item) => !item.dead && !item.left && !item.hpZero)

/** Completa campos que o banco pode ter omitido (objetos vazios, gravações antigas). */
export function normalizeTactical(combat: TacticalCombat): TacticalCombat {
    const fix = (state: { conditions?: unknown; flags?: unknown; economy?: unknown }) => {
        state.conditions = Array.isArray(state.conditions) ? state.conditions : []
        state.flags = state.flags && typeof state.flags === "object" ? state.flags : {}
        state.economy = state.economy && typeof state.economy === "object" ? { ...freshEconomy(), ...(state.economy as object) } : freshEconomy()
    }
    combat.tactical.characters = combat.tactical.characters ?? []
    combat.tactical.order = combat.tactical.order ?? []
    combat.tactical.queue = combat.tactical.queue ?? []
    combat.tactical.acted = combat.tactical.acted ?? []
    combat.tactical.block = combat.tactical.block ?? null
    for (const state of combat.tactical.characters) fix(state)
    for (const combatant of combat.combatants) if (combatant.tactical) fix(combatant.tactical)
    return combat
}

export async function findActiveTactical(campaignId: Types.ObjectId): Promise<TacticalCombat | null> {
    const combat = await MaddoxCombatModel.findOne({ campaignId, status: "active" }).lean<IMaddoxCombat>()
    return isTactical(combat) ? normalizeTactical(combat) : null
}

/** Grava o estado tático (troca condicional pela versão `rev`): outro clique ou outra gravação no meio = 409. */
export async function saveTactical(combat: TacticalCombat): Promise<TacticalCombat> {
    const saved = await MaddoxCombatModel.findOneAndUpdate(
        { _id: combat._id, rev: combat.rev ?? 0, status: "active" },
        { $set: { tactical: combat.tactical, combatants: combat.combatants }, $inc: { rev: 1 } },
        { returnDocument: "after" },
    ).lean<IMaddoxCombat>()
    if (!saved || !isTactical(saved)) throw new DomainError(409, "O combate mudou enquanto você agia. Tente de novo.", "COMBAT_CHANGED")
    return normalizeTactical(saved)
}

/** Carrega, muda e grava (até 3 tentativas em corrida). `mutate` só muda o objeto; efeitos fora do combate vêm depois. */
export async function mutateTactical<T>(campaignId: Types.ObjectId, mutate: (combat: TacticalCombat) => T | Promise<T>): Promise<{ combat: TacticalCombat; result: T }> {
    for (let attempt = 0; ; attempt += 1) {
        const combat = await findActiveTactical(campaignId)
        if (!combat) throw new DomainError(409, "Não há combate em andamento.", "NO_COMBAT")
        const result = await mutate(combat)
        try {
            return { combat: await saveTactical(combat), result }
        } catch (error) {
            if (attempt >= 2 || !(error instanceof DomainError) || error.code !== "COMBAT_CHANGED") throw error
        }
    }
}

// ── Dados ─────────────────────────────────────────────────────────────────────

/** Rola uma expressão: do jogador (motor com as regras de dado dele) ou do servidor (adversários, sem regras de dado). */
export async function rollExpression(expression: string, options: { mode?: RollMode; label: string; userId?: string | null }): Promise<DiceRollResponse> {
    const parsed = parseDiceExpression(expression) ?? { terms: [], modifier: Number.parseInt(expression, 10) || 0 }
    const input = { terms: parsed.terms, modifier: parsed.modifier, mode: options.mode ?? "normal", label: options.label, source: "sheet" as const }
    if (options.userId) {
        const [{ rollGeneralDice }, { resolveGeneralDiceTarget }] = await Promise.all([import("@/features/dice-roller/server/dice-roll-service"), import("@/features/dice-roller/server/dice-target")])
        return rollGeneralDice(input, resolveGeneralDiceTarget({ userId: options.userId })!)
    }
    const { rollDice } = await import("@/features/dice-roller/server/dice-engine")
    return rollDice(input)
}

export const keptD20Of = (roll: DiceRollResponse): number => roll.selectedD20?.kept ?? roll.terms.find((term) => term.dice === "d20")?.results[0] ?? 0
export const d20Expression = (modifier: number) => formatDiceExpression({ terms: [{ dice: "d20", quantity: 1 }], modifier })

// ── Início ────────────────────────────────────────────────────────────────────

/** Adversário pedido em `start_combat`/`update_combat` já resolvido (bloco do catálogo ou próprio). */
export interface TacticalDraftCombatant {
    name: string
    side: "inimigo" | "aliado"
    quantity: number
    description: string
    condition: string
    registerNpc: boolean
    stats: MonsterStats
}

const groupKeyOf = (name: string) => normalizeCatalogName(name).replace(/\s+/g, "-") || "adversario"

/** Indivíduos do grupo: "Goblin" ×3 → "Goblin 1", "Goblin 2", "Goblin 3", cada um com PV próprio. */
export function expandCombatants(drafts: readonly TacticalDraftCombatant[], existing: readonly string[] = []): (TacticalDraftCombatant & { individual: string; groupKey: string })[] {
    const used = new Set(existing.map((name) => normalizeCatalogName(name)))
    const result: (TacticalDraftCombatant & { individual: string; groupKey: string })[] = []
    for (const draft of drafts) {
        const count = Math.max(1, Math.min(20, draft.quantity))
        for (let index = 1; index <= count; index += 1) {
            let name = count > 1 ? `${draft.name} ${index}` : draft.name
            let suffix = index
            while (used.has(normalizeCatalogName(name))) name = `${draft.name} ${++suffix}`
            used.add(normalizeCatalogName(name))
            result.push({ ...draft, individual: name, groupKey: groupKeyOf(draft.name) })
        }
    }
    return result
}

/** Estado de luta inicial de um adversário. */
export const combatantState = (actorKey: string, groupKey: string, stats: MonsterStats): TacticalCombatantState => ({
    actorKey,
    groupKey,
    stats: { ...stats, hp: stats.hpMax, actions: stats.actions.map((action) => ({ ...action, available: true })) },
    conditions: [],
    flags: {},
    economy: freshEconomy(),
    concentration: null,
    defeated: false,
})

/** Rola a iniciativa dos grupos de adversários (um d20 por grupo, como permite a regra) e devolve as posições. */
export async function rollMonsterInitiative(entries: readonly { actorKey: string; name: string; groupKey: string; stats: MonsterStats }[], mode: RollMode, joinStart: number, known: Map<string, { total: number; d20: number }> = new Map()): Promise<InitiativeSlot[]> {
    const slots: InitiativeSlot[] = []
    for (const [index, entry] of entries.entries()) {
        let rolled = known.get(entry.groupKey)
        if (!rolled) {
            const roll = await rollExpression(d20Expression(entry.stats.initiativeBonus), { mode, label: `Iniciativa · ${entry.name}` })
            rolled = { total: roll.total, d20: keptD20Of(roll) }
            known.set(entry.groupKey, rolled)
        }
        slots.push({ actorKey: entry.actorKey, kind: "combatant", name: entry.name, total: rolled.total, d20: rolled.d20, modifier: entry.stats.initiativeBonus, dexterity: entry.stats.dexterity, joinIndex: joinStart + index, groupKey: entry.groupKey })
    }
    return slots
}

/** Posições dos adversários ainda sem iniciativa (rolada depois dos personagens, DND-25). */
export function pendingMonsterSlots(entries: readonly { actorKey: string; name: string; groupKey: string; stats: MonsterStats }[], joinStart: number): InitiativeSlot[] {
    return entries.map((entry, index) => ({ actorKey: entry.actorKey, kind: "combatant", name: entry.name, total: null, d20: null, modifier: entry.stats.initiativeBonus, dexterity: entry.stats.dexterity, joinIndex: joinStart + index, groupKey: entry.groupKey }))
}

/** Personagens prontos com ficha que entram no combate. */
export async function combatCharacters(campaignId: Types.ObjectId): Promise<TacticalCharacterState[]> {
    const members = await MaddoxCampaignMemberModel.find({ campaignId, status: "joined" }).sort({ joinedAt: 1, createdAt: 1 }).lean<{ _id: Types.ObjectId; userId: string; characterId: Types.ObjectId | null }[]>()
    const ids = members.map((member) => member.characterId).filter((id): id is Types.ObjectId => Boolean(id))
    const characters = ids.length ? await MaddoxCharacterModel.find({ _id: { $in: ids }, status: "active" }).lean<{ _id: Types.ObjectId; name: string; sheetId: Types.ObjectId | null; interview?: { status: string } }[]>() : []
    const byId = new Map(characters.map((character) => [String(character._id), character]))
    return members
        .map((member) => ({ member, character: member.characterId ? byId.get(String(member.characterId)) : undefined }))
        .filter(({ character }) => character && character.interview?.status === "done" && character.sheetId)
        .map(({ member, character }) => ({
            actorKey: `pc:${String(character!._id)}`,
            characterId: String(character!._id),
            memberId: String(member._id),
            userId: member.userId,
            name: character!.name,
            sheetId: String(character!.sheetId),
            conditions: [],
            flags: {},
            economy: freshEconomy(),
            concentration: null,
            stable: false,
            dead: false,
            hpZero: false,
            left: false,
            ready: null,
        }))
}

export interface TacticalStartPlan {
    combatId: Types.ObjectId
    /** Cards de iniciativa dos personagens (rolagem pendente, ou rolada pelo servidor para quem está offline). */
    initiativeMessages: Record<string, unknown>[]
}

/**
 * Cria o combate tático (fase de iniciativa) a partir do rascunho de `start_combat`: indivíduos com o bloco de
 * estatísticas, um card de iniciativa por personagem (espera do turno do mestre) e um card por grupo de inimigos, que o
 * servidor só rola depois do último personagem (DND-25). Quem está offline faz os inimigos esperarem (o dono pode
 * rolar no lugar).
 */
export async function createTacticalCombat(
    campaign: Pick<IMaddoxCampaign, "_id">,
    turnNumber: number,
    waitRound: number,
    event: { title: string; location: string; surprise: "personagens" | "adversarios" | null; combatants: TacticalDraftCombatant[] },
    linkNpc: (combatant: TacticalDraftCombatant & { individual: string }) => Promise<Types.ObjectId | null>,
): Promise<TacticalStartPlan | null> {
    const individuals = expandCombatants(event.combatants)
    const combatants: IMaddoxCombatant[] = []
    for (const item of individuals) {
        const actorKey = `npc:${randomUUID().slice(0, 8)}`
        combatants.push({
            name: item.individual,
            nameKey: normalizeCatalogName(item.individual),
            side: item.side,
            quantity: 1,
            description: item.description,
            condition: item.condition,
            npcId: await linkNpc(item),
            outcome: null,
            tactical: combatantState(actorKey, item.groupKey, item.stats),
        })
    }
    const characters = await combatCharacters(campaign._id)
    // DND-25: a iniciativa dos inimigos só é rolada depois do último personagem (`rollEnemyInitiativeIfReady`).
    const monsterSlots = pendingMonsterSlots(
        combatants.map((item) => ({ actorKey: item.tactical!.actorKey, name: item.name, groupKey: item.tactical!.groupKey, stats: item.tactical!.stats })),
        characters.length,
    )
    const characterSlots: InitiativeSlot[] = characters.map((character, index) => ({ actorKey: character.actorKey, kind: "character", name: character.name, total: null, d20: null, modifier: 0, dexterity: 10, joinIndex: index, groupKey: character.actorKey }))
    const tactical: TacticalCombatState = {
        mode: "tactical",
        phase: "initiative",
        round: 0,
        activeIndex: -1,
        order: [...characterSlots, ...monsterSlots],
        characters,
        surprise: event.surprise,
        staleEndNarrations: 0,
        queue: [],
        nextKey: null,
        queueTurn: null,
        block: null,
        acted: [],
    }
    let created: IMaddoxCombat
    try {
        created = (await MaddoxCombatModel.create({ campaignId: campaign._id, status: "active", mode: "tactical", title: event.title, location: event.location, startedTurn: turnNumber, combatants, tactical, rev: 0 })).toObject() as IMaddoxCombat
    } catch (error) {
        if ((error as { code?: number }).code === 11000) {
            log.info({ campaignId: String(campaign._id), turnNumber }, "[maddox] combate já estava ativo; início ignorado")
            return null
        }
        throw error
    }
    const { loadCombatSheets } = await import("./combat-sheet")
    const sheets = await loadCombatSheets(characters.map((character) => character.sheetId!).filter(Boolean))
    const initiativeMessages = characters.map((character) => {
        const sheet = sheets.get(character.sheetId!)
        const modifier = sheet?.initiative.value ?? 0
        return {
            campaignId: campaign._id,
            turnNumber,
            phase: "master" as const,
            kind: "combat-roll" as const,
            memberId: new Types.ObjectId(character.memberId),
            userId: character.userId,
            characterId: new Types.ObjectId(character.characterId),
            characterName: character.name,
            content: "",
            segment: waitRound,
            combatRoll: {
                combatId: String(created._id),
                kind: "initiative",
                waitRound,
                status: "pending",
                ability: "dexterity",
                dc: null,
                mode: event.surprise === "personagens" ? "disadvantage" : "normal",
                dice: d20Expression(modifier),
                roll: null,
                total: null,
                success: null,
                reason: `Iniciativa · ${event.title}`,
                effect: null,
                targetKey: character.actorKey,
                outcome: null,
                rolledBy: null,
            },
        }
    })
    const groups = new Map<string, { name: string; modifier: number }>()
    for (const item of individuals) if (!groups.has(item.groupKey)) groups.set(item.groupKey, { name: item.name, modifier: item.stats.initiativeBonus })
    const enemyMessages = [...groups.entries()].map(([groupKey, group]) => ({
        campaignId: campaign._id,
        turnNumber,
        phase: "master" as const,
        kind: "combat-roll" as const,
        content: "",
        segment: waitRound,
        combatRoll: {
            combatId: String(created._id),
            kind: "enemy-initiative",
            waitRound,
            status: "pending",
            ability: "dexterity",
            dc: null,
            mode: event.surprise === "adversarios" ? "disadvantage" : "normal",
            dice: d20Expression(group.modifier),
            roll: null,
            total: null,
            success: null,
            reason: `Iniciativa · ${group.name}`,
            effect: null,
            targetKey: null,
            outcome: null,
            rolledBy: null,
            groupKey,
            groupName: group.name,
            revealUntil: null,
        },
    }))
    log.info({ campaignId: String(campaign._id), combatId: String(created._id), turnNumber, combatants: combatants.length, characters: characters.length }, "[maddox] combate tático começou (iniciativa)")
    return { combatId: created._id, initiativeMessages: [...initiativeMessages, ...enemyMessages] }
}

/** Grava a iniciativa rolada de um personagem na ordem. */
export function setCharacterInitiative(combat: TacticalCombat, actorKey: string, roll: DiceRollResponse, dexterity: number) {
    const slot = combat.tactical.order.find((item) => item.actorKey === actorKey)
    if (!slot) return
    slot.total = roll.total
    slot.d20 = keptD20Of(roll)
    slot.modifier = roll.modifier
    slot.dexterity = dexterity
}

/**
 * Todos os personagens rolaram: ordena a iniciativa (total → Destreza → personagens antes → entrada), começa a rodada 1
 * e grava o card "Ordem de iniciativa". Idempotente (só a primeira chamada com a fase `initiative` vence).
 */
export async function finishInitiativeIfReady(campaignId: Types.ObjectId, turnNumber: number, segment: number): Promise<boolean> {
    const combat = await findActiveTactical(campaignId)
    if (!combat || combat.tactical.phase !== "initiative") return false
    const pending = await MaddoxCampaignMessageModel.exists({
        campaignId,
        kind: "combat-roll",
        "combatRoll.combatId": String(combat._id),
        $or: [
            { "combatRoll.kind": { $in: ["initiative", "enemy-initiative"] }, "combatRoll.status": "pending" },
            // O dado dos inimigos ainda está rolando na tela: a ordem só fecha quando ele para.
            { "combatRoll.kind": "enemy-initiative", "combatRoll.revealUntil": { $gt: new Date() } },
        ],
    })
    if (pending) return false
    combat.tactical.order = sortInitiative(combat.tactical.order.map((slot) => ({ ...slot, total: slot.total ?? slot.modifier })))
    combat.tactical.phase = "running"
    combat.tactical.round = 1
    combat.tactical.activeIndex = -1
    try {
        await saveTactical(combat)
    } catch (error) {
        if (error instanceof DomainError && error.code === "COMBAT_CHANGED") return false
        throw error
    }
    await MaddoxCampaignMessageModel.create({ campaignId, turnNumber, phase: "master", kind: "combat", content: "", segment, combat: { event: "order", combatId: combat._id } })
    log.info({ campaignId: String(campaignId), combatId: String(combat._id), order: combat.tactical.order.map((slot) => `${slot.name}:${slot.total}`) }, "[maddox] ordem de iniciativa definida")
    return true
}

/**
 * DND-25: o último personagem rolou a iniciativa — o servidor rola a dos grupos de inimigos (um d20 por grupo, todos ao
 * mesmo tempo; desvantagem quando surpreendidos), grava o valor na ordem e avisa as mesas (todos veem o dado rolando).
 * A ordem só fecha depois de `MADDOX_ENEMY_INITIATIVE_REVEAL_MS` (`revealUntil`, que `hasRoundWaits` conta como espera).
 * Idempotente: cada card é reivindicado por troca condicional. Devolve quantos grupos rolou.
 */
export async function rollEnemyInitiativeIfReady(campaignId: Types.ObjectId, turnNumber: number, waitRound: number): Promise<number> {
    const base = { campaignId, turnNumber, kind: "combat-roll" as const, "combatRoll.waitRound": waitRound }
    const enemies = await MaddoxCampaignMessageModel.find({ ...base, "combatRoll.kind": "enemy-initiative", "combatRoll.status": "pending" }).lean<{ _id: Types.ObjectId; combatRoll: IMaddoxCombatRollDoc }[]>()
    if (!enemies.length) return 0
    if (await MaddoxCampaignMessageModel.exists({ ...base, "combatRoll.kind": "initiative", "combatRoll.status": "pending" })) return 0
    const combat = await findActiveTactical(campaignId)
    if (!combat || combat.tactical.phase !== "initiative") return 0
    const claimedAt = new Date()
    const staleCutoff = new Date(claimedAt.getTime() - MADDOX_COMBAT_ROLL_CLAIM_STALE_MS)
    const rolled: { id: Types.ObjectId; groupKey: string; roll: DiceRollResponse }[] = []
    try {
        for (const message of enemies) {
            // Reivindicação como a da rolagem avulsa: uma trava abandonada (falha ou processo que caiu) é retomada.
            const claimed = await MaddoxCampaignMessageModel.updateOne(
                { _id: message._id, "combatRoll.status": "pending", $or: [{ "combatRoll.rolling": { $ne: true } }, { "combatRoll.rollingAt": { $lt: staleCutoff } }] },
                { $set: { "combatRoll.rolling": true, "combatRoll.rollingAt": claimedAt } },
            )
            if (claimed.modifiedCount === 0) continue
            const request = message.combatRoll
            const roll = await rollExpression(request.dice, { mode: request.mode, label: request.reason })
            rolled.push({ id: message._id, groupKey: request.groupKey ?? "", roll })
        }
        if (!rolled.length) return 0
        await mutateTactical(campaignId, (live) => {
            for (const item of rolled) {
                for (const slot of live.tactical.order) {
                    if (slot.kind !== "combatant" || slot.groupKey !== item.groupKey) continue
                    slot.total = item.roll.total
                    slot.d20 = keptD20Of(item.roll)
                }
            }
        })
    } catch (error) {
        // Libera as travas desta chamada: a próxima (rolagem, saída ou `check`) rola os inimigos de novo.
        await MaddoxCampaignMessageModel.updateMany(
            { ...base, "combatRoll.kind": "enemy-initiative", "combatRoll.status": "pending", "combatRoll.rollingAt": claimedAt },
            { $set: { "combatRoll.rolling": false, "combatRoll.rollingAt": null } },
        ).catch(() => undefined)
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId) }, "[maddox] falha ao rolar a iniciativa dos inimigos; nova tentativa na próxima chamada")
        // Não derruba quem chamou (a rolagem do jogador já foi gravada): a retomada pelo `check` tenta de novo.
        return 0
    }
    const revealUntil = new Date(Date.now() + combatTiming.enemyRevealMs)
    const { emitCombatRolled } = await import("./game-live")
    for (const item of rolled) {
        const d20 = keptD20Of(item.roll)
        const modifier = item.roll.modifier
        await MaddoxCampaignMessageModel.updateOne(
            { _id: item.id },
            {
                $set: {
                    "combatRoll.rolling": false,
                    "combatRoll.rollingAt": null,
                    "combatRoll.status": "rolled",
                    "combatRoll.roll": item.roll,
                    "combatRoll.total": item.roll.total,
                    "combatRoll.outcome": `d20 ${d20} ${modifier >= 0 ? "+" : "−"} ${Math.abs(modifier)} = ${item.roll.total}`,
                    "combatRoll.rolledBy": "server",
                    "combatRoll.revealUntil": revealUntil,
                },
            },
        )
        emitCombatRolled(String(campaignId), String(item.id), item.roll)
    }
    log.info({ campaignId: String(campaignId), combatId: String(combat._id), groups: rolled.map((item) => `${item.groupKey}:${item.roll.total}`) }, "[maddox] iniciativa dos inimigos rolada")
    // Quando os dados param: a ordem fecha e o Maddox narra o começo (a retomada pelo `check` cobre um reinício).
    scheduleTimer(`enemy-init:${String(campaignId)}`, combatTiming.enemyRevealMs + 50, async () => {
        await finishInitiativeIfReady(campaignId, turnNumber, waitRound + 1)
        const { advanceAfterChecks } = await import("./game-checks")
        await advanceAfterChecks(campaignId, turnNumber, waitRound)
    })
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaignId)
    return rolled.length
}

type IMaddoxCombatRollDoc = IMaddoxCombatRoll

// ── Ordem, rodadas e começo de turno ──────────────────────────────────────────

/** Começo do turno de um combatente: economia nova, flags "até o seu próximo turno" limpas, condições vencidas, recarga. */
export async function startActorTurn(combat: TacticalCombat, key: string): Promise<string[]> {
    const notes: string[] = []
    const actor = findActor(combat, key)
    if (!actor) return notes
    const round = combat.tactical.round
    actor.state.economy = freshEconomy()
    const { helped } = actor.state.flags
    actor.state.flags = helped ? { helped } : {}
    actor.state.conditions = actor.state.conditions.filter((condition) => {
        const expired = condition.untilRound !== null && condition.untilRound <= round
        if (expired) notes.push(`${actor.name} não está mais ${condition.key}`)
        return !expired
    })
    // "Ajudar" vale até o começo do próximo turno de quem ajudou.
    for (const other of [...combat.tactical.characters, ...combat.combatants.map((item) => item.tactical).filter((item): item is TacticalCombatantState => Boolean(item))]) {
        if (other.flags.helped?.byKey === key) other.flags.helped = null
    }
    if (actor.kind === "combatant") {
        for (const action of actor.state.stats.actions) {
            if (!action.recharge || action.available) continue
            const roll = await rollExpression("1d6", { label: `Recarga · ${action.name}` })
            if (rechargeHit(action.recharge, roll.total)) {
                action.available = true
                notes.push(`${actor.name}: ${action.name} recarregou (d6 = ${roll.total})`)
            }
        }
    }
    return notes
}

export interface QueuePlan {
    /** Adversários que agem antes do próximo personagem, em ordem. */
    monsters: string[]
    /** Próximo personagem (que tem vez). `null` = nenhum personagem tem vez. */
    next: string | null
}

/** Quem age depois de `activeIndex`: os adversários (não derrotados) até o próximo personagem com vez. */
export function planQueue(combat: TacticalCombat): QueuePlan & { wraps: number[] } {
    const order = combat.tactical.order
    const monsters: string[] = []
    const wraps: number[] = []
    if (!order.length) return { monsters, next: null, wraps }
    for (let step = 1; step <= order.length; step += 1) {
        const index = (combat.tactical.activeIndex + step) % order.length
        if (combat.tactical.activeIndex + step >= order.length && wraps.length === 0) wraps.push(monsters.length)
        const slot = order[index]!
        const actor = findActor(combat, slot.actorKey)
        if (!actor) continue
        if (actor.kind === "character") {
            if (takesTurn(actor.state)) return { monsters, next: slot.actorKey, wraps }
            continue
        }
        if (!actor.state.defeated && !actor.combatant.outcome) monsters.push(slot.actorKey)
    }
    return { monsters, next: null, wraps }
}

/**
 * Prepara a fila do turno do mestre `turnNumber` (uma vez por turno): os adversários que agem antes do próximo
 * personagem, com o começo de turno de cada um e a rodada nova quando a ordem volta ao topo.
 */
export async function prepareMonsterQueue(campaignId: Types.ObjectId, turnNumber: number, options: { lead?: boolean; round?: number } = {}): Promise<TacticalCombat | null> {
    const combat = await findActiveTactical(campaignId)
    if (!combat || combat.tactical.phase !== "running" || combat.tactical.queueTurn === turnNumber) return combat
    const plan = planQueue(combat)
    const notes: string[] = []
    for (const [index, key] of plan.monsters.entries()) {
        if (plan.wraps[0] === index) combat.tactical.round += 1
        notes.push(...(await startActorTurn(combat, key)))
    }
    if (plan.wraps[0] !== undefined && plan.wraps[0] >= plan.monsters.length) combat.tactical.round += 1
    combat.tactical.queue = plan.monsters
    combat.tactical.nextKey = plan.next
    combat.tactical.queueTurn = turnNumber
    // DND-25: primeiro a narração do que já aconteceu (a vez do personagem, o começo da luta); depois um bloco por
    // adversário. Sem nada a narrar antes (a vez caiu direto nos adversários), começa pelo primeiro deles.
    combat.tactical.acted = []
    const first = options.lead === false ? nextNpcKey(combat) : null
    const startRound = options.round ?? 0
    combat.tactical.block = first ? { kind: "npc", actorKey: first, waits: 0, startRound } : { kind: "character", actorKey: null, waits: 0, startRound }
    try {
        const saved = await saveTactical(combat)
        if (notes.length) log.info({ campaignId: String(campaignId), notes }, "[maddox] começo do turno dos adversários")
        return saved
    } catch (error) {
        if (error instanceof DomainError && error.code === "COMBAT_CHANGED") return findActiveTactical(campaignId)
        throw error
    }
}

// ── Blocos do turno do mestre (DND-25) ────────────────────────────────────────

/** O adversário da fila ainda pode ganhar um bloco: não agiu, não caiu, não saiu da luta e não está incapacitado. */
const blockEligible = (combat: TacticalCombat, key: string) => {
    if ((combat.tactical.acted ?? []).includes(key) || combat.tactical.block?.actorKey === key) return false
    const actor = findActor(combat, key)
    return Boolean(actor && actor.kind === "combatant" && !actor.state.defeated && !actor.combatant.outcome && canAct(actor.state))
}

/** Adversários que ainda vão agir neste turno do mestre, na ordem (sem o bloco atual). */
export const remainingBlocks = (combat: TacticalCombat): string[] => combat.tactical.queue.filter((key) => blockEligible(combat, key))

const nextNpcKey = (combat: TacticalCombat): string | null => remainingBlocks(combat)[0] ?? null

export type BlockStep = { kind: "npc"; actorKey: string } | { kind: "character" } | { kind: "end" } | { kind: "legacy" }

/**
 * O que vem depois do bloco que acabou (PURA; muda `combat`): o adversário seguinte da fila (`npc`), a vez do próximo
 * personagem (`character`) ou o fim do combate porque nenhum personagem está consciente (`end`: os adversários
 * restantes não agem). `legacy` = combate sem blocos (gravação antiga: todos na mesma narração).
 */
export function nextBlockStep(combat: TacticalCombat, round: number): BlockStep {
    const block = combat.tactical.block
    if (!block) return { kind: "legacy" }
    // Retomada da mesma rodada depois de o bloco já ter avançado: nada muda.
    if (block.startRound > round) return block.kind === "npc" && block.actorKey ? { kind: "npc", actorKey: block.actorKey } : { kind: "character" }
    if (block.kind === "npc" && block.actorKey && !(combat.tactical.acted ?? []).includes(block.actorKey)) combat.tactical.acted = [...(combat.tactical.acted ?? []), block.actorKey]
    combat.tactical.block = null
    if (consciousCharacters(combat).length === 0) return { kind: "end" }
    const next = nextNpcKey(combat)
    if (!next) return { kind: "character" }
    combat.tactical.block = { kind: "npc", actorKey: next, waits: 0, startRound: round + 1 }
    return { kind: "npc", actorKey: next }
}

/** Fecha o bloco atual e grava o seguinte (ver `nextBlockStep`). */
export async function advanceBlock(campaignId: Types.ObjectId, round: number): Promise<BlockStep> {
    const combat = await findActiveTactical(campaignId)
    if (!combat || combat.tactical.phase !== "running" || !combat.tactical.block) return { kind: "legacy" }
    const { result } = await mutateTactical(campaignId, (live) => nextBlockStep(live, round))
    return result
}

/** O bloco atual abriu uma espera (reação, salvaguarda) na rodada `round`: conta para o teto de esperas do bloco. */
export async function countBlockWait(campaignId: Types.ObjectId, round: number): Promise<void> {
    const combat = await findActiveTactical(campaignId)
    const block = combat?.tactical.block
    if (!block || (block.waitRounds ?? []).includes(round)) return
    await mutateTactical(campaignId, (live) => {
        const current = live.tactical.block
        if (!current || (current.waitRounds ?? []).includes(round)) return
        current.waits += 1
        current.waitRounds = [...(current.waitRounds ?? []), round]
    })
}

export type OpenResult = { kind: "player"; memberId: Types.ObjectId; actorKey: string; offline: boolean } | { kind: "monsters" } | { kind: "none" }

/**
 * Depois da narração (sem esperas): a vez passa ao próximo personagem — começo do turno dele, teste contra a morte se
 * estiver com 0 PV — e o turno dos jogadores abre só para o membro dele. Se a fila ficou vazia de personagens
 * (todos mortos ou estáveis), o combate segue com os adversários (`monsters`) ou volta ao motor normal (`none`).
 */
export async function advanceToNextCharacter(campaignId: Types.ObjectId, turnNumber: number): Promise<OpenResult> {
    const combat = await findActiveTactical(campaignId)
    if (!combat || combat.tactical.phase !== "running") return { kind: "none" }
    const nextKey = combat.tactical.nextKey
    if (!nextKey) return { kind: "none" }
    const index = combat.tactical.order.findIndex((slot) => slot.actorKey === nextKey)
    const nextActor = findActor(combat, nextKey)
    combat.tactical.activeIndex = index
    combat.tactical.queue = []
    combat.tactical.nextKey = null
    combat.tactical.block = null
    combat.tactical.acted = []
    if (!nextActor || nextActor.kind !== "character" || !takesTurn(nextActor.state)) {
        // O personagem da vez caiu de vez (morto, estável ou saiu) durante a vez dos adversários: os que vêm depois dele
        // agem num novo turno do mestre.
        combat.tactical.queueTurn = null
        await saveTactical(combat)
        return consciousOrDying(combat) ? { kind: "monsters" } : { kind: "none" }
    }
    await startActorTurn(combat, nextKey)
    const saved = await saveTactical(combat)
    const actor = findActor(saved, nextKey)
    if (!actor || actor.kind !== "character") return { kind: "none" }
    if (actor.state.hpZero && !actor.state.stable && !actor.state.dead) {
        await MaddoxCampaignMessageModel.create({
            campaignId,
            turnNumber,
            phase: "players",
            kind: "combat-roll",
            memberId: new Types.ObjectId(actor.state.memberId),
            userId: actor.state.userId,
            characterId: new Types.ObjectId(actor.state.characterId),
            characterName: actor.state.name,
            content: "",
            combatRoll: { combatId: String(saved._id), kind: "death-save", waitRound: null, status: "pending", ability: null, dc: 10, mode: "normal", dice: "1d20", roll: null, total: null, success: null, reason: "Teste contra a morte", effect: null, targetKey: actor.key, outcome: null, rolledBy: null },
        })
    }
    const { onlineUserIds } = await import("./game-presence")
    const online = await onlineUserIds(String(campaignId))
    return { kind: "player", memberId: new Types.ObjectId(actor.state.memberId), actorKey: nextKey, offline: online ? !online.has(actor.state.userId) && !isOpexUserId(actor.state.userId) : false }
}

// ── Ausência na própria vez ───────────────────────────────────────────────────

const timers = ((globalThis as unknown as { __maddoxCombatTimers?: Map<string, ReturnType<typeof setTimeout>> }).__maddoxCombatTimers ??= new Map())

/** Agenda a reavaliação da vez de quem está offline depois da carência (instância única: timer no processo). */
export function scheduleAbsenceCheck(campaignId: string, delayMs = MADDOX_COMBAT_OFFLINE_GRACE_MS) {
    const key = `absence:${campaignId}`
    const existing = timers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
        timers.delete(key)
        void import("./tactical-actions").then(({ evaluateCombatAbsence }) => evaluateCombatAbsence(new Types.ObjectId(campaignId))).catch((error) => log.warn({ err: error instanceof Error ? error.message : String(error), campaignId }, "[maddox] falha ao reavaliar a ausência na vez"))
    }, delayMs)
    timer.unref?.()
    timers.set(key, timer)
}

/** Há um prazo da sequência do combate (dado dos inimigos ou pausa entre blocos) agendado para a campanha. */
export const hasSequenceTimer = (campaignId: string) => timers.has(`enemy-init:${campaignId}`) || timers.has(`npc-block:${campaignId}`)

export function scheduleTimer(key: string, delayMs: number, run: () => Promise<unknown>) {
    const existing = timers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
        void run()
            .catch((error) => log.warn({ err: error instanceof Error ? error.message : String(error), key }, "[maddox] falha num prazo do combate"))
            .finally(() => {
                if (timers.get(key) === timer) timers.delete(key)
            })
    }, Math.max(0, delayMs))
    timer.unref?.()
    timers.set(key, timer)
}

/** Marca na campanha a vez aberta para o personagem (só o membro dele é elegível). */
export const combatActorSet = (combatId: Types.ObjectId, actorKey: string, memberId: Types.ObjectId, offline: boolean) => ({
    "turn.combatActor": { combatId, actorKey, memberId, offlineSince: offline ? new Date() : null },
})

export const reloadCampaignTurn = (campaignId: Types.ObjectId) => MaddoxCampaignModel.findById(campaignId).select("turn status rigor ownerId").lean<Pick<IMaddoxCampaign, "_id" | "turn" | "status" | "rigor" | "ownerId">>()
