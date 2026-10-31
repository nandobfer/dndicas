import { MADDOX_MASTER_RETRY_MS, MADDOX_TURN_PHASE_LABELS } from "./constants"
import type { MaddoxGameMessageDto, MaddoxGameParticipantDto, MaddoxGameStateDto, MaddoxLiveGenerationDto } from "./game-types"

/** Sem Pusher, a mesa recarrega neste intervalo (os outros jogadores não avisam em tempo real). */
export const MADDOX_GAME_POLL_MS = 5000

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

/** Faixa do turno do mestre: narrando ou, depois de uma falha, a espera da nova tentativa. */
export function masterBannerText(state: Pick<MaddoxGameStateDto, "turn">): string {
    return state.turn.failed ? `${MADDOX_TURN_PHASE_LABELS.master} — o Maddox teve um problema; tentando de novo em instantes…` : `${MADDOX_TURN_PHASE_LABELS.master} — o Maddox está narrando…`
}

/**
 * Gerações do Maddox a mostrar: as ao vivo e as que já terminaram até a mensagem gravada chegar à lista (sem
 * piscar entre o fim do stream e a recarga da mesa).
 */
export function visibleLiveGenerations(stream: { live: MaddoxLiveGenerationDto[]; settled: (MaddoxLiveGenerationDto & { messageId: string })[] }, messages: readonly Pick<MaddoxGameMessageDto, "id">[]): MaddoxLiveGenerationDto[] {
    const saved = new Set(messages.map((message) => message.id))
    return [...stream.settled.filter((item) => !saved.has(item.messageId)), ...stream.live]
}

/**
 * Intervalo de recarga da mesa (`false` = só pelo tempo real). Sem Pusher, recarrega sempre. Com Pusher, só
 * quando o turno do mestre está sem geração em andamento — a última tentativa falhou e o servidor não avisa:
 * recarregar no intervalo da nova tentativa faz a retomada, sem laço.
 */
export function gameRefetchInterval(state: Pick<MaddoxGameStateDto, "status" | "turn"> | undefined, realtime: boolean): number | false {
    if (!realtime) return MADDOX_GAME_POLL_MS
    return state?.status === "active" && state.turn.phase === "master" && !state.turn.generating ? MADDOX_MASTER_RETRY_MS : false
}
