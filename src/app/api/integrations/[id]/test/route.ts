import { NextResponse, type NextRequest } from "next/server"
import { denyUnlessAdmin } from "@/features/auth/server/actor"
import { isIntegrationId } from "@/lib/integrations/catalog"
import { runIntegrationTest } from "@/features/integrations/services/integration-test-runner"
import type { IntegrationTestEvent } from "@/features/integrations/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/integrations/[id]/test — teste de conexão sob demanda.
 *
 * Resposta em NDJSON (`application/x-ndjson`): uma linha `{type:"log"}` por evento, à medida
 * que acontecem, e uma linha final `{type:"result"}`.
 */
export async function POST(request: NextRequest, { params }: Params) {
    const { id } = await params
    const denied = await denyUnlessAdmin(`integrations.${id}.test`)
    if (denied) return denied
    if (!isIntegrationId(id)) {
        return NextResponse.json({ success: false, error: "Integração não encontrada" }, { status: 404 })
    }
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let open = true
            const write = (event: IntegrationTestEvent) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
                } catch {
                    open = false
                }
            }
            const result = await runIntegrationTest(id, {
                source: "manual",
                signal: request.signal,
                emit: (level, message) => write({ type: "log", level, message, ts: new Date().toISOString() }),
            })
            write({ type: "result", ...result, ts: new Date().toISOString() })
            if (open) controller.close()
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
