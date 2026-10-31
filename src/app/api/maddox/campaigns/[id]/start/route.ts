import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { startCampaign } from "@/features/maddox/server/game"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/campaigns/[id]/start — o dono inicia a campanha (turno 1 do mestre). */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await startCampaign(params.id, actor.id))
})
