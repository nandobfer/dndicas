import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxCombatAdjustmentSchema } from "@/features/maddox/combat-schemas"
import { requestCombatAdjustment } from "@/features/maddox/server/combat-adjustments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/combat/adjustments — `{ economy, optionId, text }`: pede ao Maddox o ajuste de uma opção, na própria vez (DND-41). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxCombatAdjustmentSchema)
    if (!body.ok) return body.response
    return ok(await requestCombatAdjustment(params.id, body.data, actor.id))
})
