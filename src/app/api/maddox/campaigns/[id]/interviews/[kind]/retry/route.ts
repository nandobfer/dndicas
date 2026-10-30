import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { interviewKind, retryInterviewTurn, runTurn } from "@/features/maddox/server/interviews"
import { interviewNdjson } from "@/features/maddox/server/interview-stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/interviews/[kind]/retry — gera de novo a última resposta do Maddox que falhou (NDJSON). */
export const POST = withRoute<{ id: string; kind: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const turn = await retryInterviewTurn(params.id, interviewKind(params.kind), actor.id)
    return interviewNdjson((emit) => runTurn(turn, emit))
})
