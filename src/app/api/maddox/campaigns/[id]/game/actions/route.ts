import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxGameActionSchema } from "@/features/maddox/game-schemas"
import { submitGameAction } from "@/features/maddox/server/game"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/actions — `{ kind: "declaration" | "question", content }` ou `{ kind: "pass" }` ("Não fazer nada"). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxGameActionSchema)
    if (!body.ok) return body.response
    return ok(await submitGameAction(params.id, body.data, actor.id))
})
