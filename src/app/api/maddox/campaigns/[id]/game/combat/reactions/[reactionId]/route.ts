import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxReactionChoiceSchema } from "@/features/maddox/combat-schemas"
import { decideReaction } from "@/features/maddox/server/combat-reactions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/combat/reactions/[reactionId] — `{ escolha }`: a reação escolhida ou `none` (o dono só pode recusar no lugar). */
export const POST = withRoute<{ id: string; reactionId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxReactionChoiceSchema)
    if (!body.ok) return body.response
    return ok(await decideReaction(params.id, params.reactionId, body.data.escolha, actor.id))
})
