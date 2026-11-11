import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { resetCampaign } from "@/features/maddox/server/campaign-reset"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/campaigns/[id]/reset — o dono reinicia a campanha: ela volta ao lobby do fim das entrevistas (DND-50). */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await resetCampaign(params.id, actor.id))
})
