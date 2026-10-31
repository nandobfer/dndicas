import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { withRoute } from "@/lib/api/route"
import { loadMaddoxSettings } from "@/features/maddox/server/settings"
import { maddoxMcpStatus } from "@/features/maddox/server/opencode-mcp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/maddox/opencode-mcp — situação do MCP do Maddox no servidor OpenCode. */
export const GET = withRoute(async () => {
    await requireAdminActor("integrations.ai.view")
    const { settings } = await loadMaddoxSettings()
    return ok(await maddoxMcpStatus(settings))
})

/** POST …/opencode-mcp — adiciona e conecta o MCP do Maddox no OpenCode (se faltar) e devolve a situação. */
export const POST = withRoute(async () => {
    await requireAdminActor("integrations.ai.edit")
    const { settings } = await loadMaddoxSettings()
    return ok(await maddoxMcpStatus(settings, true))
})
