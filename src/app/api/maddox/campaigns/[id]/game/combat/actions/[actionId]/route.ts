import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { cancelCombatAction } from "@/features/maddox/server/tactical-actions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** DELETE …/game/combat/actions/[actionId] — cancela a ação ainda não rolada (sem recurso gasto); a economia volta. */
export const DELETE = withRoute<{ id: string; actionId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await cancelCombatAction(params.id, params.actionId, actor.id))
})
