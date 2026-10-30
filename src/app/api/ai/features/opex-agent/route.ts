import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { parseBody, withRoute } from "@/lib/api/route"
import { opexAgentSettingsSchema } from "@/features/opex-agent/schemas"
import { getOpexSettings, saveOpexSettings } from "@/features/opex-agent/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/opex-agent — configuração do Agente Opex e se pode ser usado. */
export const GET = withRoute(async () => {
    await requireAdminActor("integrations.ai.view")
    return ok(await getOpexSettings())
})

/** PUT /api/ai/features/opex-agent — salva (confere provedores, modelos e variantes no catálogo). */
export const PUT = withRoute(async ({ req }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    const body = await parseBody(req, opexAgentSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveOpexSettings(body.data, actor.id))
})
