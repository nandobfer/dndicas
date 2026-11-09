import type { Types } from "mongoose"

/**
 * Declarações dos outros jogadores ocultas no chat (DND-36). A regra fica só aqui: a leitura das mensagens e a busca do
 * Diário usam as mesmas condições, para a tela e a busca nunca divergirem.
 */

/** Começo do resumo da vez no combate tático gravado antes da marca `combatTurn` (formato de `recordCombatTurn`). */
export const COMBAT_TURN_SUMMARY_PATTERN = /^Vez de .+ \(rodada do combate\)/

interface PlayerActionMessage {
    kind: string
    memberId?: Types.ObjectId | string | null
    content?: string | null
    combatTurn?: boolean | null
}

export interface PlayerActionsViewer {
    memberId: string | null
    hidePlayerActions: boolean
}

/** Resumo da vez no combate tático: é uma declaração, mas o combate em turnos não sofre a ocultação. */
export const isCombatTurnSummary = (message: PlayerActionMessage): boolean => Boolean(message.combatTurn) || COMBAT_TURN_SUMMARY_PATTERN.test(message.content ?? "")

/** A declaração de outro jogador chega sem texto (a linha "Fulano declarou sua ação"); o autor sempre vê a própria. */
export function isHiddenPlayerAction(message: PlayerActionMessage, viewer: PlayerActionsViewer): boolean {
    if (!viewer.hidePlayerActions || message.kind !== "declaration" || !message.memberId) return false
    if (String(message.memberId) === viewer.memberId) return false
    return !isCombatTurnSummary(message)
}

/** Filtro Mongo que tira das consultas as declarações ocultas para `memberId` (a mesma regra de `isHiddenPlayerAction`). */
export const hiddenPlayerActionsFilter = (memberId: Types.ObjectId) => ({
    $nor: [{ kind: "declaration", memberId: { $nin: [memberId, null] }, combatTurn: { $ne: true }, content: { $not: COMBAT_TURN_SUMMARY_PATTERN } }],
})
