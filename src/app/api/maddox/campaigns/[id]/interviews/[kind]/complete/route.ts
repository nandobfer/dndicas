import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { interviewKind } from "@/features/maddox/server/interviews"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/interviews/[kind]/complete — "Confirmar e concluir": consolida e grava o cenário ou o personagem. */
export const POST = withRoute<{ id: string; kind: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const kind = interviewKind(params.kind)
    // Sob demanda: a consolidação alcança a camada de IA e a ficha.
    const { completeInterview } = await import("@/features/maddox/server/interview-consolidation")
    return ok(await completeInterview(params.id, kind, actor.id))
})
