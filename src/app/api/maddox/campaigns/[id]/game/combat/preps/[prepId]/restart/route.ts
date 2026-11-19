import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { restartCombatPrep } from "@/features/maddox/server/combat-prep"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/combat/preps/[prepId]/restart — só o dono da campanha: a preparação parada volta para a fila do zero (DND-75). */
export const POST = withRoute<{ id: string; prepId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await restartCombatPrep(params.id, params.prepId, actor.id))
})
