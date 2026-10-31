import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxInterviewMessageSchema } from "@/features/maddox/interview-schemas"
import { interviewKind, runTurn, sendInterviewMessage } from "@/features/maddox/server/interviews"
import { interviewNdjson } from "@/features/maddox/server/interview-stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/interviews/[kind]/messages — `{ content }`: grava a resposta e transmite a do Maddox (NDJSON). */
export const POST = withRoute<{ id: string; kind: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const kind = interviewKind(params.kind)
    const body = await parseBody(req, maddoxInterviewMessageSchema)
    if (!body.ok) return body.response
    const turn = await sendInterviewMessage(params.id, kind, body.data, actor.id)
    return interviewNdjson((emit) => runTurn(turn, emit))
})
