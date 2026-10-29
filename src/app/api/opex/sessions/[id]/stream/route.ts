import { withRoute } from "@/lib/api/route"
import { openSessionStream } from "@/features/opex-agent/server/stream"
import { requireOpexScope } from "@/features/opex-agent/server/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/sessions/[id]/stream — NDJSON: `snapshot` + resposta ao vivo (`ping` a cada 15 s). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => openSessionStream(params.id, req.signal, await requireOpexScope()))
