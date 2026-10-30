import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { DomainError, withRoute } from "@/lib/api/route"
import { listAiModels } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { isAiProviderId } from "@/lib/ai/providers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/providers/[provider]/models — modelos disponíveis (`?refresh=1` ignora o cache). */
export const GET = withRoute<{ provider: string }>(async ({ req, params }) => {
    await requireAdminActor("integrations.ai.view")
    if (!isAiProviderId(params.provider)) throw new DomainError(404, "Provedor de IA não encontrado", "AI_PROVIDER_NOT_FOUND")
    try {
        return ok(await listAiModels(params.provider, { fresh: req.nextUrl.searchParams.get("refresh") === "1", signal: req.signal }))
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "AI_PROVIDER_ERROR")
        throw error
    }
})
