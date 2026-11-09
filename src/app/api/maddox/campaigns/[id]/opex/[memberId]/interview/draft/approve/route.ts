import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { approveMaddoxOpexDraftSchema } from "@/features/maddox/opex-schemas"
import { runTurn } from "@/features/maddox/server/interviews"
import { interviewNdjson } from "@/features/maddox/server/interview-stream"
import { approveOpexDraft } from "@/features/maddox/server/opex-interview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/interview/draft/approve — aprova a resposta do Opex (como está ou editada) e transmite a fala do Maddox (NDJSON). */
export const POST = withRoute<{ id: string; memberId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, approveMaddoxOpexDraftSchema)
    if (!body.ok) return body.response
    const { turn, after } = await approveOpexDraft(params.id, params.memberId, body.data, actor.id)
    return interviewNdjson(async (emit) => {
        await runTurn(turn, emit)
        after()
    })
})
