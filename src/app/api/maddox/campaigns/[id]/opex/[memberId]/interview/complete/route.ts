import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { completeOpexInterview } from "@/features/maddox/server/opex-interview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** POST …/interview/complete — o dono confirma a síntese do Personagem Opex (modo ao vivo). */
export const POST = withRoute<{ id: string; memberId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await completeOpexInterview(params.id, params.memberId, actor.id))
})
