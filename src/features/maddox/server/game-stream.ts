import type { MaddoxGameStreamLine } from "../game-types"
import { liveSnapshot, subscribeGameLive } from "./game-live"

const PING_MS = 15_000

/**
 * Stream NDJSON da mesa (Maddox 4): `snapshot` com as gerações em andamento e as linhas ao vivo de todas as
 * gerações do Maddox na campanha, com `ping` a cada 15 s. Reconectar recomeça pelo `snapshot`. O acesso (membro
 * da campanha) é conferido pela rota antes de abrir.
 */
export function openGameStream(campaignId: string, signal: AbortSignal): Response {
    const encoder = new TextEncoder()
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let open = true
            const write = (line: MaddoxGameStreamLine) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
                } catch {
                    open = false
                }
            }
            // Assina antes do retrato: nenhuma linha fica entre os dois.
            const unsubscribe = subscribeGameLive(campaignId, write)
            write({ type: "snapshot", live: liveSnapshot(campaignId) })
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
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } })
}
