import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxAbilityScoresSubmitSchema } from "@/features/maddox/interview-schemas"
import { interviewKind, runTurn } from "@/features/maddox/server/interviews"
import { submitAbilityScores } from "@/features/maddox/server/interview-scores-service"
import { interviewNdjson } from "@/features/maddox/server/interview-stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/interviews/character/ability-scores — `{ method, scores }`: envia o card de atributos (travado depois) e
 * transmite a fala seguinte do Maddox (NDJSON). Na rolagem, só as pontuações roladas pelo servidor são aceitas.
 */
export const POST = withRoute<{ id: string; kind: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const kind = interviewKind(params.kind)
    const body = await parseBody(req, maddoxAbilityScoresSubmitSchema)
    if (!body.ok) return body.response
    const turn = await submitAbilityScores(params.id, kind, body.data, actor.id)
    return interviewNdjson((emit) => runTurn(turn, emit))
})
