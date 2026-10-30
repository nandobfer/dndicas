import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { parseBody, withRoute } from "@/lib/api/route"
import { memorySummarySettingsSchema } from "@/features/ai/schemas"
import { getMemorySummarySettings, saveMemorySummarySettings } from "@/features/ai/server/memory-summary"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/memory-summary — configuração do uso "Resumo de memórias" e se pode ser usado. */
export const GET = withRoute(async () => {
    await requireAdminActor("integrations.ai.view")
    return ok(await getMemorySummarySettings())
})

/** PUT /api/ai/features/memory-summary — salva (confere provedor, modelo e variante no catálogo). */
export const PUT = withRoute(async ({ req }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    const body = await parseBody(req, memorySummarySettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveMemorySummarySettings(body.data, actor.id))
})
