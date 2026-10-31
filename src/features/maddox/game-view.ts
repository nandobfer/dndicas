import type { MaddoxGameParticipantDto, MaddoxGameStateDto } from "./game-types"

/** Regras de exibição da mesa (Maddox 3) — módulo PURO, sem React. */

export type MaddoxSeatStatus = "declared" | "waiting" | "offline" | "next-turn" | "preparing" | "watching"

export const MADDOX_SEAT_LABELS: Record<MaddoxSeatStatus, string> = {
    declared: "Declarou",
    waiting: "Aguardando",
    offline: "Offline (não conta)",
    "next-turn": "Entra no próximo turno",
    preparing: "Preparando personagem",
    watching: "Na mesa",
}

/**
 * Situação de um participante no turno: no turno dos jogadores, quem é elegível declarou ou está sendo
 * aguardado (offline não conta para fechar o turno); quem não é elegível entra no próximo turno; quem não
 * concluiu a entrevista está preparando o personagem.
 */
export function seatStatus(participant: MaddoxGameParticipantDto, state: Pick<MaddoxGameStateDto, "status" | "turn">, presence: { available: boolean; online: ReadonlySet<string> }): MaddoxSeatStatus {
    if (!participant.ready) return "preparing"
    if (state.status !== "active" || state.turn.phase !== "players") return "watching"
    if (!participant.eligible) return "next-turn"
    if (participant.declared) return "declared"
    if (presence.available && !presence.online.has(participant.userId)) return "offline"
    return "waiting"
}

/** Quantos elegíveis presentes já declararam (faixa "aguardando X de N"). */
export function turnProgress(state: Pick<MaddoxGameStateDto, "participants">, presence: { available: boolean; online: ReadonlySet<string> }) {
    const required = state.participants.filter((participant) => participant.eligible && (participant.declared || !presence.available || presence.online.has(participant.userId)))
    return { declared: required.filter((participant) => participant.declared).length, total: required.length }
}

/** Motivo de o campo da mesa estar bloqueado para mim (`null` = posso agir). */
export function composerBlockReason(state: Pick<MaddoxGameStateDto, "status" | "turn" | "me">): string | null {
    if (state.status !== "active") return "A campanha não está em andamento."
    if (!state.me.ready) return "Conclua a entrevista de personagem com o Maddox para entrar no jogo."
    if (state.turn.phase === "master") return "O Maddox está narrando. Aguarde o turno dos jogadores."
    if (!state.me.eligible) return "Você entra no jogo a partir do próximo turno."
    return null
}
