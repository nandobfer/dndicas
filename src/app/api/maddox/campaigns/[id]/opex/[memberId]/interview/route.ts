import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { getOpexInterview } from "@/features/maddox/server/opex-interview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET …/opex/[memberId]/interview — a entrevista do Personagem Opex (só o dono da campanha). */
export const GET = withRoute<{ id: string; memberId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await getOpexInterview(params.id, params.memberId, actor.id))
})
