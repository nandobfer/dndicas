import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxCombatRollSchema } from "@/features/maddox/combat-schemas"
import { rollCombatRoll } from "@/features/maddox/server/tactical-actions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/game/combat/rolls/[rollId]/roll — `{}`: rola a iniciativa, o teste contra a morte, a concentração, a salvaguarda
 * ou o dano pedido (o jogador indicado ou o dono, no lugar dele).
 */
export const POST = withRoute<{ id: string; rollId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxCombatRollSchema)
    if (!body.ok) return body.response
    return ok(await rollCombatRoll(params.id, params.rollId, actor.id))
})
