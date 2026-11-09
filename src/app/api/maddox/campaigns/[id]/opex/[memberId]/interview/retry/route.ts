import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { retryOpexInterview } from "@/features/maddox/server/opex-interview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/opex/[memberId]/interview/retry — "Tentar de novo": a entrevista continua de onde parou (só o dono). */
export const POST = withRoute<{ id: string; memberId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await retryOpexInterview(params.id, params.memberId, actor.id), { status: 202 })
})
