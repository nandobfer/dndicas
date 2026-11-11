import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxSneakChoiceSchema } from "@/features/maddox/combat-schemas"
import { chooseSneakAttack } from "@/features/maddox/server/tactical-actions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/combat/actions/[actionId]/sneak — `{ add }`: depois do acerto, soma (ou não) o ataque furtivo ao dano (DND-49). */
export const POST = withRoute<{ id: string; actionId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxSneakChoiceSchema)
    if (!body.ok) return body.response
    return ok(await chooseSneakAttack(params.id, params.actionId, body.data.add, actor.id))
})
