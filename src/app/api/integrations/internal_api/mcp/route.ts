import { withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { getMcpServerOverview } from "@/features/integrations/services/mcp-overview"

export const dynamic = "force-dynamic"

/** GET /api/integrations/internal_api/mcp — endpoint do servidor MCP e tokens MCP ativos (admin). */
export const GET = withRoute(async () => {
    await requireAdminActor()
    return ok(await getMcpServerOverview())
})
