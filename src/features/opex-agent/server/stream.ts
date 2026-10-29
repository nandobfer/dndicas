import type { OpexStreamLine } from "../types"
import { liveMessageOf, subscribeSession } from "./hub"
import { loadSession } from "./sessions"
import type { OpexServerScope } from "./scope"

const PING_MS = 15_000

/**
 * Stream NDJSON da sessão: `snapshot` (situação + resposta em andamento) e as linhas ao vivo, com
 * `ping` a cada 15 s. Reconectar recomeça pelo `snapshot`, então nada se perde no meio do turno.
 */
export async function openSessionStream(sessionId: string, signal: AbortSignal, scope: OpexServerScope): Promise<Response> {
    const session = await loadSession(sessionId, scope)
    const encoder = new TextEncoder()
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let open = true
            const write = (line: OpexStreamLine) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
                } catch {
                    open = false
                }
            }
            // Assina antes do retrato: nenhuma linha fica entre os dois.
            const unsubscribe = subscribeSession(sessionId, write)
            const live = liveMessageOf(sessionId)
            write({ type: "snapshot", status: live ? "running" : session.status === "running" ? "idle" : session.status, live })
            const ping = setInterval(() => write({ type: "ping" }), PING_MS)
            ping.unref?.()
            cleanup = () => {
                if (!open) return
                open = false
                clearInterval(ping)
                unsubscribe()
                try {
                    controller.close()
                } catch {
                    // já fechado
                }
            }
            signal.addEventListener("abort", cleanup, { once: true })
        },
        cancel() {
            cleanup()
        },
    })
    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    })
}
