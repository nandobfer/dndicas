import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { skipOpexTableAction } from "@/features/maddox/server/opex"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/opex/[memberId]/skip — "Pular": registra "não fez nada" (ou encerra a vez no combate) no lugar do Opex (só o dono). */
export const POST = withRoute<{ id: string; memberId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await skipOpexTableAction(params.id, params.memberId, actor.id))
})
