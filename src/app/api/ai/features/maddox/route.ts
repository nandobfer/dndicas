import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { parseBody, withRoute } from "@/lib/api/route"
import { maddoxSettingsSchema } from "@/features/maddox/schemas"
import { getMaddoxSettings, saveMaddoxSettings } from "@/features/maddox/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/maddox — configuração do Agente Maddox, roteiros vigentes e históricos. */
export const GET = withRoute(async () => {
    await requireAdminActor()
    return ok(await getMaddoxSettings())
})

/** PUT /api/ai/features/maddox — salva (confere provedores, modelos, variantes e agentes no catálogo). */
export const PUT = withRoute(async ({ req }) => {
    const actor = await requireAdminActor()
    const body = await parseBody(req, maddoxSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveMaddoxSettings(body.data, actor.id))
})
