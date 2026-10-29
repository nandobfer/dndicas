import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { withRoute } from "@/lib/api/route"
import { listMaddoxSessions } from "@/features/maddox/server/opencode-sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/maddox/opencode-sessions — sessões do OpenCode mantidas pelo Maddox. */
export const GET = withRoute(async () => {
    await requireAdminActor()
    return ok(await listMaddoxSessions())
})
