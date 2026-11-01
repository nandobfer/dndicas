import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxCombatRollSchema } from "@/features/maddox/combat-schemas"
import { rollCombatAction } from "@/features/maddox/server/tactical-actions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/combat/actions/[actionId]/roll — `{}`: rola o próximo passo da ação (ataque, dano, cura, teste). */
export const POST = withRoute<{ id: string; actionId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxCombatRollSchema)
    if (!body.ok) return body.response
    return ok(await rollCombatAction(params.id, params.actionId, actor.id))
})
