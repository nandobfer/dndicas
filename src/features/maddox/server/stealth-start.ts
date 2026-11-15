import { Types } from "mongoose"
import { normalizeCatalogName } from "../catalog-markup"
import { MaddoxCampaignMessageModel, MaddoxCharacterModel, MaddoxCombatModel } from "../models"

/**
 * DND-59 — Esconder-se antes do combate (SOMENTE servidor): quem venceu um teste de Furtividade antes da luta começa o
 * combate tático Invisível (Esconder-se), com o total do teste como a CD para ser encontrado, até atacar, conjurar com
 * componente Verbal ou o mestre tirar a condição. O teste do turno em que o combate começa vale sozinho (o narrador tira
 * quem já se revelou com `revelados`); um teste de turno anterior só vale quando o narrador confirma, em `escondidos`,
 * que o personagem continua escondido na ficção.
 */

/** Quantos turnos para trás um teste de Furtividade ainda pode valer no início do combate (com a confirmação do narrador). */
export const STEALTH_START_LOOKBACK_TURNS = 5

export interface StealthCheck {
    characterId: string
    characterName: string
    turnNumber: number
    total: number
    dc: number
}

export interface StealthStartDecision {
    hidden: { characterId: string; characterName: string; dc: number; turnNumber: number }[]
    /** Pedidos do narrador sem teste que os sustente (vão no retorno da ferramenta). */
    refused: string[]
    /** Testes de turnos anteriores que o narrador não confirmou (informação para ele). */
    unconfirmed: StealthCheck[]
}

/** Regra pura: cada personagem usa o teste bem-sucedido mais recente da janela. */
export function decideStealthStart(checks: readonly StealthCheck[], input: { turnNumber: number; hidden?: readonly string[]; revealed?: readonly string[] }): StealthStartDecision {
    const fold = (value: string) => normalizeCatalogName(value)
    const listed = new Set((input.hidden ?? []).map(fold))
    const revealed = new Set((input.revealed ?? []).map(fold))
    const latest = new Map<string, StealthCheck>()
    for (const check of checks) {
        if (check.total < check.dc) continue
        const current = latest.get(check.characterId)
        if (!current || check.turnNumber >= current.turnNumber) latest.set(check.characterId, check)
    }
    const hidden: StealthStartDecision["hidden"] = []
    const unconfirmed: StealthCheck[] = []
    for (const check of latest.values()) {
        const key = fold(check.characterName)
        if (revealed.has(key)) continue
        if (check.turnNumber === input.turnNumber || listed.has(key)) hidden.push({ characterId: check.characterId, characterName: check.characterName, dc: check.total, turnNumber: check.turnNumber })
        else unconfirmed.push(check)
    }
    const covered = new Set(hidden.map((item) => fold(item.characterName)))
    const refused = [...listed].filter((name) => !covered.has(name) && !revealed.has(name)).map((name) => (input.hidden ?? []).find((item) => fold(item) === name) ?? name)
    return { hidden, refused, unconfirmed }
}

/**
 * Testes de Furtividade rolados na janela: desde o turno seguinte ao fim do último combate e no máximo
 * `STEALTH_START_LOOKBACK_TURNS` turnos antes do atual.
 */
export async function loadStealthChecks(campaignId: Types.ObjectId, turnNumber: number): Promise<StealthCheck[]> {
    const lastCombat = await MaddoxCombatModel.findOne({ campaignId, status: { $ne: "active" }, endedTurn: { $ne: null } }).sort({ endedTurn: -1 }).select("endedTurn").lean<{ endedTurn?: number | null }>()
    const from = Math.max(turnNumber - STEALTH_START_LOOKBACK_TURNS, (lastCombat?.endedTurn ?? -1) + 1)
    const messages = await MaddoxCampaignMessageModel.find({ campaignId, kind: "check", turnNumber: { $gte: from, $lte: turnNumber }, "check.skill": "Furtividade", "check.status": "rolled", characterId: { $ne: null } })
        .select("characterId characterName turnNumber check.dc check.roll.total")
        .lean<{ characterId: Types.ObjectId; characterName: string | null; turnNumber: number; check?: { dc?: number; roll?: { total?: number } | null } }[]>()
    const ids = [...new Set(messages.map((message) => String(message.characterId)))]
    const active = ids.length ? await MaddoxCharacterModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, campaignId, status: "active" }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>() : []
    const names = new Map(active.map((character) => [String(character._id), character.name]))
    return messages
        .filter((message) => names.has(String(message.characterId)) && typeof message.check?.roll?.total === "number" && typeof message.check?.dc === "number")
        .map((message) => ({ characterId: String(message.characterId), characterName: names.get(String(message.characterId))!, turnNumber: message.turnNumber, total: message.check!.roll!.total!, dc: message.check!.dc! }))
}
