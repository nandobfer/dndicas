import { createSseHandler } from "@engramind/client/server"
import { denyUnlessPermission } from "@/features/auth/server/actor"
import { MEMORIES_VIEW_PERMISSION } from "@/features/engramind/constants"
import { engramindBus } from "@/features/engramind/server/live"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** SSE da rede de memórias (eventos do webhook, só ids, slugs e tipos). Exige `memories.view`. */
const sse = createSseHandler({ bus: engramindBus() })

export async function GET(request: Request): Promise<Response> {
    return (await denyUnlessPermission(MEMORIES_VIEW_PERMISSION)) ?? sse(request)
}
