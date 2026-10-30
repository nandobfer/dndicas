import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { createMaddoxCampaignSchema } from "@/features/maddox/campaign-schemas"
import { createCampaign, listMyCampaigns } from "@/features/maddox/server/campaigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/campaigns — campanhas em que o usuário é dono ou membro ativo. */
export const GET = withRoute(async () => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await listMyCampaigns(actor.id))
})

/** POST /api/maddox/campaigns — cria a campanha no lobby (409 se o Agente Maddox estiver indisponível). */
export const POST = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, createMaddoxCampaignSchema)
    if (!body.ok) return body.response
    return created(await createCampaign(body.data, actor.id))
})
