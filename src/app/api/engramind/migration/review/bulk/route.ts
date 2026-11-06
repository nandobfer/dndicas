import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PERMISSION = "integrations.engramind.edit"
import { migrationBulkSchema } from "@/features/engramind/schemas/migration"
import { reviewBulk } from "@/features/engramind/server/migration"

/** POST — aprovar ou rejeitar uma lista inteira (descartadas nunca são aprovadas em lote). */
export const POST = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor(PERMISSION)
    const body = await parseBody(req, migrationBulkSchema)
    if (!body.ok) return body.response
    return ok(await reviewBulk(body.data, actor.id))
})
