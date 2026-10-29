import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { parseBody, withRoute } from "@/lib/api/route"
import { entityImportSettingsSchema } from "@/features/ai/schemas"
import { getEntityImportSettings, saveEntityImportSettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/entity-import — configuração do agente "Importador 5etools" e se pode ser usado. */
export const GET = withRoute(async () => {
    await requireAdminActor()
    return ok(await getEntityImportSettings())
})

/** PUT /api/ai/features/entity-import — salva (confere provedor e modelo no catálogo; auditado). */
export const PUT = withRoute(async ({ req }) => {
    const actor = await requireAdminActor()
    const body = await parseBody(req, entityImportSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveEntityImportSettings(body.data, actor.id))
})
