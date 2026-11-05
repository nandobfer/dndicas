import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PERMISSION = "integrations.engramind.edit"
import { migrationConfirmSchema } from "@/features/engramind/schemas/migration"
import { mirrorHistory } from "@/features/engramind/server/migration"

/** POST — espelha o histórico das campanhas (`maddox_campaign_memories`) sem curadoria, em lote idempotente. */
export const POST = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor(PERMISSION)
    const body = await parseBody(req, migrationConfirmSchema)
    if (!body.ok) return body.response
    return ok(await mirrorHistory(actor.id))
})
