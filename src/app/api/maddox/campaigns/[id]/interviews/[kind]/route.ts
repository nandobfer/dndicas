import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { getInterview, interviewKind, runTurn, startInterview } from "@/features/maddox/server/interviews"
import { interviewNdjson } from "@/features/maddox/server/interview-stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/campaigns/[id]/interviews/[kind] — `{ interview, maddoxAvatarUrl }` (`interview: null` = ainda não começou). */
export const GET = withRoute<{ id: string; kind: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await getInterview(params.id, interviewKind(params.kind), actor.id))
})

/**
 * POST /api/maddox/campaigns/[id]/interviews/[kind] — começa a entrevista e transmite a abertura do
 * Maddox em NDJSON. Já começada: devolve a entrevista em JSON (idempotente).
 */
export const POST = withRoute<{ id: string; kind: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const { interview, turn } = await startInterview(params.id, interviewKind(params.kind), actor.id)
    if (!turn) return ok({ interview })
    return interviewNdjson((emit) => runTurn(turn, emit))
})
