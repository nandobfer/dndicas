import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { runBootstrap } from "@/features/engramind/server/bootstrap"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/connection/bootstrap — configuração automática (idempotente), auditada passo a passo. */
export const POST = withRoute(async () => {
    const actor = await requirePermissionActor("integrations.engramind.edit")
    return ok(await runBootstrap(actor.id))
})
