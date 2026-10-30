import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { parseBody, withRoute } from "@/lib/api/route"
import { imageGeneratorSettingsSchema } from "@/features/ai/schemas"
import { getImageGeneratorSettings, saveImageGeneratorSettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/image-generator — configuração do agente "Gerador de imagens" e se pode ser usado. */
export const GET = withRoute(async () => {
    await requireAdminActor("integrations.ai.view")
    return ok(await getImageGeneratorSettings())
})

/** PUT /api/ai/features/image-generator — salva (confere provedor e modelo no catálogo; auditado). */
export const PUT = withRoute(async ({ req }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    const body = await parseBody(req, imageGeneratorSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveImageGeneratorSettings(body.data, actor.id))
})
