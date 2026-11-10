import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { skipCombatPrep } from "@/features/maddox/server/combat-prep"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/combat/preps/[prepId]/skip — só o dono da campanha: a ficha segue com a lista base do servidor (DND-41). */
export const POST = withRoute<{ id: string; prepId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await skipCombatPrep(params.id, params.prepId, actor.id))
})
