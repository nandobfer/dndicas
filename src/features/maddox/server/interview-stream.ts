import type { MaddoxInterviewStreamLine } from "../interview-types"

const PING_MS = 15_000

/**
 * Resposta NDJSON de um turno de entrevista. A geração (`producer`) NÃO depende da conexão: se o
 * navegador fechar, ela continua e grava a resposta; só as linhas deixam de ser enviadas.
 */
export function interviewNdjson(producer: (emit: (line: MaddoxInterviewStreamLine) => void) => Promise<void>): Response {
    const encoder = new TextEncoder()
    let open = true
    let ping: ReturnType<typeof setInterval> | null = null
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const emit = (line: MaddoxInterviewStreamLine) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
                } catch {
                    open = false
                }
            }
            ping = setInterval(() => emit({ type: "ping" }), PING_MS)
            ping.unref?.()
            void producer(emit).finally(() => {
                if (ping) clearInterval(ping)
                if (!open) return
                open = false
                try {
                    controller.close()
                } catch {
                    // já fechado pelo cliente
                }
            })
        },
        cancel() {
            open = false
            if (ping) clearInterval(ping)
        },
    })
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } })
}
