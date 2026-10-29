import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { DomainError, withRoute } from "@/lib/api/route"
import { listAiAgents } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/agents — agentes primários do servidor OpenCode. */
export const GET = withRoute(async ({ req }) => {
    await requireAdminActor()
    try {
        return ok(await listAiAgents({ fresh: req.nextUrl.searchParams.get("refresh") === "1", signal: req.signal }))
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "AI_PROVIDER_ERROR")
        throw error
    }
})
