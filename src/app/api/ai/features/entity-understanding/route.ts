import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { parseBody, withRoute } from "@/lib/api/route"
import { entityUnderstandingSettingsSchema } from "@/features/ai/schemas"
import { getEntityUnderstandingSettings, saveEntityUnderstandingSettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/entity-understanding — configuração do agente "Entender com IA" e se pode ser usado. */
export const GET = withRoute(async () => {
    await requireAdminActor("integrations.ai.view")
    return ok(await getEntityUnderstandingSettings())
})

/** PUT /api/ai/features/entity-understanding — salva (confere provedor e modelo no catálogo; auditado). */
export const PUT = withRoute(async ({ req }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    const body = await parseBody(req, entityUnderstandingSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveEntityUnderstandingSettings(body.data, actor.id))
})
