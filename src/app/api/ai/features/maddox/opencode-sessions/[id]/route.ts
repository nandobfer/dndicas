import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { withRoute } from "@/lib/api/route"
import { deleteMaddoxSession } from "@/features/maddox/server/opencode-sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** DELETE /api/ai/features/maddox/opencode-sessions/[id] — exclui no OpenCode (falha = fica pendente para a rotina). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    return ok(await deleteMaddoxSession(params.id, actor.id))
})
