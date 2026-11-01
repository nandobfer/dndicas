import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxHitPointRollSchema } from "@/features/maddox/interview-schemas"
import { interviewKind } from "@/features/maddox/server/interviews"
import { rollHitPoint } from "@/features/maddox/server/interview-hit-points"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/interviews/character/hit-points/roll — `{ nivel }`: rola o dado de vida desse nível no servidor (motor de dados). */
export const POST = withRoute<{ id: string; kind: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const kind = interviewKind(params.kind)
    const body = await parseBody(req, maddoxHitPointRollSchema)
    if (!body.ok) return body.response
    return ok(await rollHitPoint(params.id, kind, body.data.nivel, actor.id))
})
