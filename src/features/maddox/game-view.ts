import { MADDOX_MASTER_RETRY_MS, MADDOX_TURN_PHASE_LABELS } from "./constants"
import type { MaddoxGameMessageDto, MaddoxGameParticipantDto, MaddoxGameStateDto, MaddoxLiveGenerationDto } from "./game-types"

/** Sem Pusher, a mesa recarrega neste intervalo (os outros jogadores não avisam em tempo real). */
export const MADDOX_GAME_POLL_MS = 5000

/** Regras de exibição da mesa (Maddox 3) — módulo PURO, sem React. */

export type MaddoxSeatStatus = "declared" | "waiting" | "offline" | "next-turn" | "preparing" | "watching" | "rolling" | "acting" | "stuck"

export const MADDOX_SEAT_LABELS: Record<MaddoxSeatStatus, string> = {
    declared: "Declarou",
    waiting: "Aguardando",
    offline: "Offline (não conta)",
    "next-turn": "Entra no próximo turno",
    preparing: "Preparando personagem",
    watching: "Na mesa",
    rolling: "Rolando teste",
    acting: "Agindo…",
    stuck: "Parado: aguardando o dono",
}

/**
 * Situação de um participante no turno: no turno dos jogadores, quem é elegível declarou ou está sendo
 * aguardado (offline não conta para fechar o turno); quem não é elegível entra no próximo turno; quem não
 * concluiu a entrevista está preparando o personagem.
 */
export function seatStatus(participant: MaddoxGameParticipantDto, state: Pick<MaddoxGameStateDto, "status" | "turn">, presence: { available: boolean; online: ReadonlySet<string> }): MaddoxSeatStatus {
    if (!participant.ready) return "preparing"
    // Personagem Opex (DND-26): agindo agora, ou parado com falha até o dono decidir.
    const opexActor = state.status === "active" && state.turn.phase === "players" ? state.turn.opexActor : null
    if (opexActor && opexActor.memberId === participant.memberId) return opexActor.failed ? "stuck" : "acting"
    if (state.status === "active" && state.turn.phase === "master" && state.turn.awaitingChecks && [...state.turn.pendingChecks, ...(state.turn.pendingCombat ?? [])].some((check) => check.memberId === participant.memberId)) return "rolling"
    if (state.status !== "active" || state.turn.phase !== "players") return "watching"
    if (!participant.eligible) return "next-turn"
    if (participant.declared) return "declared"
    if (presence.available && !participant.opex && !presence.online.has(participant.userId)) return "offline"
    return "waiting"
}

/** Quantos elegíveis presentes já declararam (faixa "aguardando X de N"). */
export function turnProgress(state: Pick<MaddoxGameStateDto, "participants">, presence: { available: boolean; online: ReadonlySet<string> }) {
    // Os Personagens Opex (DND-26) agem depois dos humanos: não entram na contagem da faixa.
    const required = state.participants.filter((participant) => !participant.opex && participant.eligible && (participant.declared || !presence.available || presence.online.has(participant.userId)))
    return { declared: required.filter((participant) => participant.declared).length, total: required.length }
}

/** Motivo de o campo da mesa estar bloqueado para mim (`null` = posso agir). */
export function composerBlockReason(state: Pick<MaddoxGameStateDto, "status" | "turn" | "me">): string | null {
    if (state.status !== "active") return "A campanha não está em andamento."
    if (!state.me.ready) return "Conclua a entrevista de personagem com o Maddox para entrar no jogo."
    if (state.turn.phase === "master" && state.turn.awaitingChecks) {
        return state.turn.pendingChecks.some((check) => check.memberId === state.me.memberId) ? "O Maddox pediu um teste para você: role os dados na conversa." : "O Maddox aguarda os testes pedidos. Aguarde o turno dos jogadores."
    }
    if (state.turn.phase === "master") return "O Maddox está narrando. Aguarde o turno dos jogadores."
    if (state.turn.opexActor && !state.turn.opexActor.combat) return "Os Personagens Opex estão agindo. Aguarde a narração do Maddox."
    if (!state.me.eligible) return "Você entra no jogo a partir do próximo turno."
    return null
}

/** Nomes em lista pt-BR ("Lyra", "Lyra e Doran", "Lyra, Doran e Mira"). */
const listNames = (names: readonly string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`)

/** Faixa do turno dos jogadores no combate tático (Maddox 7): de quem é a vez. */
export function combatBannerText(state: Pick<MaddoxGameStateDto, "turn" | "combat"> & { me?: Pick<MaddoxGameStateDto["me"], "memberId"> }): string {
    const actor = state.turn.combatActor
    if (!actor) return MADDOX_TURN_PHASE_LABELS.players
    const round = state.combat?.tactical?.round ?? 1
    return actor.memberId === state.me?.memberId ? `Combate — rodada ${round}: é a sua vez (${actor.characterName})` : `Combate — rodada ${round}: vez de ${actor.characterName}`
}

/** Faixa dos Personagens Opex (DND-26): quem está agindo, ou a falha que trava a mesa. `null` = nenhum Opex na vez. */
export function opexBannerText(state: Pick<MaddoxGameStateDto, "turn" | "status"> & { me?: Pick<MaddoxGameStateDto["me"], "isOwner"> }): string | null {
    const actor = state.status === "active" && state.turn.phase === "players" ? state.turn.opexActor : null
    if (!actor) return null
    if (actor.failed) return `${actor.characterName} (Personagem Opex) não conseguiu agir${actor.error ? `: ${actor.error}` : ""} — ${state.me?.isOwner ? "escolha Tentar de novo ou Pular" : "aguardando o dono da campanha"}`
    return actor.combat ? `Combate: vez de ${actor.characterName} (Personagem Opex), que está escolhendo a ação…` : `Personagens Opex agindo — vez de ${actor.characterName}`
}

/** Faixa do turno do mestre: narrando, esperando os testes (Maddox 5) ou, depois de uma falha, a espera da nova tentativa. */
export function masterBannerText(state: Pick<MaddoxGameStateDto, "turn"> & { me?: Pick<MaddoxGameStateDto["me"], "memberId"> }): string {
    if (state.turn.awaitingChecks) {
        // Combate tático: as rolagens e reações pendentes contam junto com os testes.
        const waits = [...state.turn.pendingChecks.map((check) => ({ memberId: check.memberId, characterName: check.characterName })), ...(state.turn.pendingCombat ?? []).map((item) => ({ memberId: item.memberId, characterName: item.characterName }))]
        // Sem ninguém a esperar: o dado dos inimigos rolando ou a pausa entre dois blocos do combate tático (DND-25).
        if (!waits.length) return `${MADDOX_TURN_PHASE_LABELS.master} — o Maddox está narrando…`
        const mine = waits.some((check) => check.memberId === state.me?.memberId)
        const others = [...new Set(waits.filter((check) => check.memberId !== state.me?.memberId).map((check) => check.characterName))]
        if ((state.turn.pendingCombat ?? []).length && !state.turn.pendingChecks.length) {
            if (mine) return `${MADDOX_TURN_PHASE_LABELS.master} — o combate espera uma rolagem ou reação sua${others.length ? ` (e de ${listNames(others)})` : ""}`
            return `${MADDOX_TURN_PHASE_LABELS.master} — aguardando ${listNames(others) || "um jogador"} no combate`
        }
        if (mine) return `${MADDOX_TURN_PHASE_LABELS.master} — o Maddox pediu um teste para você${others.length ? ` (e aguarda ${listNames(others)})` : ""}`
        return `${MADDOX_TURN_PHASE_LABELS.master} — aguardando o teste de ${listNames(others) || "um jogador"}`
    }
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
    return state?.status === "active" && state.turn.phase === "master" && !state.turn.generating && !state.turn.awaitingChecks ? MADDOX_MASTER_RETRY_MS : false
}

/** Por que o jogador não pode injetar uma lembrança agora (`null` = pode). DND-25. */
export function reminderBlockReason(state: Pick<MaddoxGameStateDto, "status"> & { me: Pick<MaddoxGameStateDto["me"], "memberId" | "ready"> }): string | null {
    if (state.status !== "active") return "A campanha não está em andamento."
    if (!state.me.memberId || !state.me.ready) return "Conclua a entrevista de personagem com o Maddox antes de entrar no jogo."
    return null
}

/** Bloco de sugestões de ação abaixo de uma narração (DND-30). */
export interface MaddoxActionOptionsView {
    /** Narração abaixo da qual o bloco aparece. */
    messageId: string
    options: string[]
    /** Sugestão que virou a minha declaração neste turno (`null` = nenhuma). */
    chosen: string | null
    /** Já declarei ou passei: as sugestões ficam visíveis, mas sem ação. */
    disabled: boolean
}

const sameAction = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR") === b.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR")

/**
 * Sugestões de ação a mostrar (DND-30): só as da ÚLTIMA narração, e só quando ela é do turno atual, o turno dos jogadores está
 * aberto fora do combate tático e eu posso declarar (pronto e elegível). Depois de declarar, ficam desabilitadas com a escolhida
 * marcada; somem com a narração seguinte (que é outra mensagem) ou quando o turno do mestre começa.
 */
export function actionOptionsView(state: Pick<MaddoxGameStateDto, "status" | "turn" | "me">, messages: readonly Pick<MaddoxGameMessageDto, "id" | "kind" | "turnNumber" | "memberId" | "content" | "actionOptions">[]): MaddoxActionOptionsView | null {
    if (state.status !== "active" || state.turn.phase !== "players" || state.turn.combatActor) return null
    if (!state.me.memberId || !state.me.ready || !state.me.eligible) return null
    const narration = [...messages].reverse().find((message) => message.kind === "narration")
    if (!narration || narration.turnNumber !== state.turn.number || !narration.actionOptions?.length) return null
    const mine = messages.find((message) => message.kind === "declaration" && message.turnNumber === state.turn.number && message.memberId === state.me.memberId)
    return {
        messageId: narration.id,
        options: narration.actionOptions,
        chosen: mine ? (narration.actionOptions.find((option) => sameAction(option, mine.content)) ?? null) : null,
        disabled: state.me.declared,
    }
}
