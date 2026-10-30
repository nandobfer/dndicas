import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { joinByInvite, previewInvite } from "@/features/maddox/server/campaigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/campaigns/invites/[token] — resumo da campanha do convite. */
export const GET = withRoute<{ token: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await previewInvite(params.token, actor.id))
})

/** POST /api/maddox/campaigns/invites/[token] — entra na campanha pelo link. */
export const POST = withRoute<{ token: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await joinByInvite(params.token, actor.id))
})
