import { applyLiveLine, startLiveMessage } from "../live-message"
import type { OpexLiveMessage, OpexStreamLine } from "../types"

/**
 * Barramento em memória dos turnos do Agente Opex (um processo Node, em `globalThis` para sobreviver
 * ao recarregamento do `next dev`). Guarda o retrato da resposta em andamento — enviado a quem
 * conecta no meio do turno — e repassa cada linha aos ouvintes da sessão. A mensagem só vai ao banco
 * no fim do turno.
 */

type Listener = (line: OpexStreamLine) => void

export interface OpexFollowUp {
    /** Texto enviado ao modelo. */
    text: string
    kind: "message" | "confirmation" | "job"
    /** Texto exibido no chat (padrão: o próprio `text`). */
    display?: string
    /** Arquivos enviados antes (`POST …/files`) que vão nesta mensagem. */
    fileIds?: string[]
    /** Job agendado que disparou a mensagem (o fim do turno conclui o job). */
    job?: { id: string; title: string }
}

interface LiveTurn {
    controller: AbortController
    live: OpexLiveMessage
}

interface HubState {
    turns: Map<string, LiveTurn>
    listeners: Map<string, Set<Listener>>
    /** Mensagens que chegaram durante um turno (ex.: decisão de uma confirmação). */
    queues: Map<string, OpexFollowUp[]>
}

const globalHub = globalThis as unknown as { __opexHub?: HubState }
const hub: HubState = (globalHub.__opexHub ??= { turns: new Map(), listeners: new Map(), queues: new Map() })

function emit(sessionId: string, line: OpexStreamLine): void {
    for (const listener of hub.listeners.get(sessionId) ?? []) {
        try {
            listener(line)
        } catch {
            // ouvinte com problema não derruba os demais
        }
    }
}

export function isTurnActive(sessionId: string): boolean {
    return hub.turns.has(sessionId)
}

export function liveMessageOf(sessionId: string): OpexLiveMessage | null {
    return hub.turns.get(sessionId)?.live ?? null
}

/** Marca o turno como ativo e avisa os ouvintes (`turn-start`). */
export function beginTurn(sessionId: string, messageId: string, controller: AbortController): void {
    const startedAt = new Date().toISOString()
    hub.turns.set(sessionId, { controller, live: startLiveMessage(messageId, startedAt) })
    emit(sessionId, { type: "turn-start", messageId, startedAt })
}

/** Linha do turno em andamento: atualiza o retrato e repassa. */
export function publishLine(sessionId: string, line: OpexStreamLine): void {
    const turn = hub.turns.get(sessionId)
    if (turn) {
        const next = applyLiveLine(turn.live, line)
        if (next) turn.live = next
    }
    emit(sessionId, line)
}

export function endTurn(sessionId: string, controller: AbortController, line: Extract<OpexStreamLine, { type: "turn-end" }>): void {
    if (hub.turns.get(sessionId)?.controller === controller) hub.turns.delete(sessionId)
    emit(sessionId, line)
}

export function abortTurn(sessionId: string, reason: string): boolean {
    const turn = hub.turns.get(sessionId)
    if (!turn) return false
    turn.controller.abort(new Error(reason))
    return true
}

export function subscribeSession(sessionId: string, listener: Listener): () => void {
    const set = hub.listeners.get(sessionId) ?? new Set()
    set.add(listener)
    hub.listeners.set(sessionId, set)
    return () => {
        set.delete(listener)
        if (!set.size) hub.listeners.delete(sessionId)
    }
}

export function enqueueFollowUp(sessionId: string, followUp: OpexFollowUp): void {
    hub.queues.set(sessionId, [...(hub.queues.get(sessionId) ?? []), followUp])
}

export function takeFollowUp(sessionId: string): OpexFollowUp | null {
    const queue = hub.queues.get(sessionId)
    const next = queue?.shift() ?? null
    if (queue && !queue.length) hub.queues.delete(sessionId)
    return next
}

/** O job está na fila de alguma sessão (esperando o turno atual terminar)? */
export function hasQueuedJob(jobId: string): boolean {
    for (const queue of hub.queues.values()) if (queue.some((item) => item.job?.id === jobId)) return true
    return false
}

/** Sessão excluída: interrompe e esquece. */
export function forgetSession(sessionId: string): void {
    abortTurn(sessionId, "Sessão excluída")
    hub.turns.delete(sessionId)
    hub.queues.delete(sessionId)
}
