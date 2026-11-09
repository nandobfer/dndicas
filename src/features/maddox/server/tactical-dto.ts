import { Types } from "mongoose"
import { MADDOX_CONDITION_LABELS } from "../constants"
import { hpBand } from "../combat-rules"
import type { IMaddoxCombatAction, IMaddoxCombatReaction, IMaddoxCombatRoll } from "../combat-types"
import type { MaddoxCombatActionDto, MaddoxCombatReactionDto, MaddoxCombatRollDto, MaddoxMyCombatDto, MaddoxTacticalCombatDto } from "../game-types"
import { MaddoxCharacterModel } from "../models"
import { findActor, type TacticalCombat } from "./tactical-combat"
import { isOpexUserId } from "./opex-members"

/** DTOs do combate tático (Maddox 7): o que todos veem (ordem, faixa de PV dos adversários) e o que só eu vejo (opções). */

type HpMap = Map<string, { hp: number; hpMax: number; tempHp: number }>

export function tacticalSnapshot(combat: TacticalCombat, hp: HpMap = new Map(), portraits: Map<string, string | null> = new Map(), opexNpcIds: ReadonlySet<string> = new Set()): MaddoxTacticalCombatDto {
    const activeKey = combat.tactical.phase === "running" ? (combat.tactical.order[combat.tactical.activeIndex]?.actorKey ?? null) : null
    return {
        phase: combat.tactical.phase,
        round: combat.tactical.round,
        activeKey,
        order: combat.tactical.order
            .map((slot) => {
                const actor = findActor(combat, slot.actorKey)
                if (!actor) return null
                const conditions = actor.state.conditions.map((condition) => ({ key: condition.key, label: MADDOX_CONDITION_LABELS[condition.key] }))
                if (actor.kind === "character") {
                    const points = hp.get(actor.key)
                    return {
                        actorKey: slot.actorKey,
                        kind: "character" as const,
                        side: "personagem" as const,
                        name: actor.name,
                        portraitUrl: portraits.get(actor.state.characterId) ?? null,
                        memberId: actor.state.memberId,
                        ...(isOpexUserId(actor.state.userId) ? { opex: true } : {}),
                        initiative: slot.total,
                        active: slot.actorKey === activeKey,
                        hp: points ? { current: points.hp, max: points.hpMax, temp: points.tempHp } : null,
                        band: null,
                        conditions,
                        concentration: actor.state.concentration?.spell ?? null,
                        defeated: false,
                        dead: actor.state.dead,
                        stable: actor.state.stable && actor.state.hpZero,
                        dying: actor.state.hpZero && !actor.state.stable && !actor.state.dead,
                    }
                }
                return {
                    actorKey: slot.actorKey,
                    kind: "combatant" as const,
                    side: actor.combatant.side === "aliado" ? ("aliado" as const) : ("inimigo" as const),
                    name: actor.name,
                    portraitUrl: null,
                    memberId: null,
                    ...(actor.combatant.npcId && opexNpcIds.has(String(actor.combatant.npcId)) ? { opex: true } : {}),
                    initiative: slot.total,
                    active: slot.actorKey === activeKey,
                    hp: null,
                    band: hpBand(actor.state.stats.hp, actor.state.stats.hpMax),
                    conditions,
                    concentration: actor.state.concentration?.spell ?? null,
                    defeated: actor.state.defeated,
                    dead: false,
                    stable: false,
                    dying: false,
                }
            })
            .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot)),
    }
}

/** Ordem com os PV dos personagens (da ficha) e os retratos. */
export async function loadTacticalDto(combat: TacticalCombat): Promise<MaddoxTacticalCombatDto> {
    const states = combat.tactical.characters
    const [{ loadCombatSheets }, characters] = await Promise.all([
        import("./combat-sheet"),
        MaddoxCharacterModel.find({ _id: { $in: states.map((state) => new Types.ObjectId(state.characterId)) } }).select("portraitUrl").lean<{ _id: Types.ObjectId; portraitUrl?: string | null }[]>(),
    ])
    const sheets = await loadCombatSheets(states.map((state) => state.sheetId).filter((id): id is string => Boolean(id)))
    const hp: HpMap = new Map()
    for (const state of states) {
        const sheet = state.sheetId ? sheets.get(state.sheetId) : undefined
        if (sheet) hp.set(state.actorKey, sheet.hp)
    }
    const { knownOpexNpcIds } = await import("./opex-npcs")
    const opexNpcIds = await knownOpexNpcIds(combat.combatants.map((item) => item.npcId))
    return tacticalSnapshot(combat, hp, new Map(characters.map((character) => [String(character._id), character.portraitUrl ?? null])), opexNpcIds)
}

/** A minha vez: economia e as opções (só a Ação e a Ação bônus; as reações chegam na janela). */
export async function myCombatDto(combat: TacticalCombat, memberId: string, myTurn: boolean, campaignId: Types.ObjectId): Promise<MaddoxMyCombatDto | null> {
    const state = combat.tactical.characters.find((item) => item.memberId === memberId && !item.left)
    if (!state) return null
    const base: MaddoxMyCombatDto = { myTurn, actorKey: state.actorKey, economy: state.economy, attacksPerAction: 1, options: null, dying: state.hpZero && !state.stable && !state.dead }
    if (!myTurn || combat.tactical.phase !== "running") return base
    const { loadCharacterOptions } = await import("./tactical-options")
    const view = (await loadCharacterOptions([state], campaignId)).get(state.actorKey)
    if (!view) return base
    return { ...base, attacksPerAction: view.options.attacksPerAction, options: { action: view.options.action, bonus: view.options.bonus } }
}

export function combatActionDto(action: IMaddoxCombatAction & { cancellable?: boolean }, opex = false): MaddoxCombatActionDto {
    return {
        ...(opex ? { opex: true } : {}),
        actorKey: action.actorKey,
        actorName: action.actorName,
        actorKind: action.actorKind,
        economy: action.economy,
        category: action.category,
        label: action.label,
        targets: action.targets ?? [],
        spellLevel: action.spellLevel ?? null,
        freeText: action.freeText ?? null,
        status: action.status,
        steps: action.steps ?? [],
        summary: action.summary ?? "",
        cancellable: Boolean(action.cancellable) && action.status === "pending",
        round: action.round ?? 0,
    }
}

export function combatRollDto(roll: IMaddoxCombatRoll, rolledByName: string | null): MaddoxCombatRollDto {
    return { kind: roll.kind, status: roll.status, reason: roll.reason, dice: roll.dice, mode: roll.mode, dc: roll.dc, roll: roll.roll ?? null, total: roll.total ?? null, success: roll.success ?? null, outcome: roll.outcome ?? null, rolledByName, groupName: roll.groupName ?? null }
}

export function combatReactionDto(reaction: IMaddoxCombatReaction, mine: boolean): MaddoxCombatReactionDto {
    return {
        status: reaction.status,
        trigger: reaction.trigger,
        description: reaction.description,
        options: mine && reaction.status === "pending" ? reaction.options.map((option) => ({ id: option.id, label: option.label, detail: option.detail })) : [],
        choice: reaction.choice ?? null,
        deadline: new Date(reaction.deadline).toISOString(),
        outcome: reaction.outcome ?? null,
    }
}
