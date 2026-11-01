import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxCombatActionSchema } from "@/features/maddox/combat-schemas"
import { submitCombatAction } from "@/features/maddox/server/tactical-actions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/game/combat/actions — `{ economy, optionId, targets?, spellLevel?, skill?, freeText?, readyOptionId?, readyTrigger? }`:
 * Ação ou Ação bônus do personagem da vez no combate tático. A opção precisa estar na lista que o servidor calculou da ficha.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxCombatActionSchema)
    if (!body.ok) return body.response
    return ok(await submitCombatAction(params.id, body.data, actor.id))
})
