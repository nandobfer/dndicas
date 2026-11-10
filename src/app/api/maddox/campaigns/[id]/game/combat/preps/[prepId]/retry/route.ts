import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { retryCombatPrep } from "@/features/maddox/server/combat-prep"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/combat/preps/[prepId]/retry — só o dono da campanha: a preparação que falhou volta para a fila (DND-41). */
export const POST = withRoute<{ id: string; prepId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await retryCombatPrep(params.id, params.prepId, actor.id))
})
