import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { getConnectionState } from "@/features/engramind/server/connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/connection — estado da conexão e do último bootstrap (sem segredos). */
export const GET = withRoute(async () => {
    await requirePermissionActor("integrations.engramind.view")
    return ok(await getConnectionState())
})
