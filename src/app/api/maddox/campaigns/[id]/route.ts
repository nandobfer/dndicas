import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { updateMaddoxCampaignSchema } from "@/features/maddox/campaign-schemas"
import { getCampaignDetail, updateCampaign } from "@/features/maddox/server/campaigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/campaigns/[id] — campanha e membros (só para membros; os demais recebem 404). */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await getCampaignDetail(params.id, actor.id))
})

/** PATCH /api/maddox/campaigns/[id] — dono altera nome e (só no lobby) o rigor. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, updateMaddoxCampaignSchema)
    if (!body.ok) return body.response
    return ok(await updateCampaign(params.id, body.data, actor.id))
})
