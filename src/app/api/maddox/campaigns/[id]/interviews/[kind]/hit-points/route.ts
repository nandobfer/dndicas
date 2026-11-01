import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxHitPointsSubmitSchema } from "@/features/maddox/interview-schemas"
import { interviewKind, runTurn } from "@/features/maddox/server/interviews"
import { submitHitPoints } from "@/features/maddox/server/interview-hit-points"
import { interviewNdjson } from "@/features/maddox/server/interview-stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/interviews/character/hit-points — `{ escolhas: { "2": "media" | "rolagem", … } }`: envia o card de pontos de
 * vida (travado depois) e transmite a fala seguinte do Maddox (NDJSON). "rolagem" só vale num nível já rolado no servidor.
 */
export const POST = withRoute<{ id: string; kind: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const kind = interviewKind(params.kind)
    const body = await parseBody(req, maddoxHitPointsSubmitSchema)
    if (!body.ok) return body.response
    const turn = await submitHitPoints(params.id, kind, body.data, actor.id)
    return interviewNdjson((emit) => runTurn(turn, emit))
})
