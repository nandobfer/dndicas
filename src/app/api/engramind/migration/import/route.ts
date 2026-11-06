import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PERMISSION = "integrations.engramind.edit"
import { migrationConfirmSchema } from "@/features/engramind/schemas/migration"
import { importApproved } from "@/features/engramind/server/migration"

/** POST — importa as aprovadas (com confirmação), em lotes idempotentes. */
export const POST = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor(PERMISSION)
    const body = await parseBody(req, migrationConfirmSchema)
    if (!body.ok) return body.response
    return ok(await importApproved(actor.id))
})
