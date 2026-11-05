import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PERMISSION = "integrations.engramind.edit"
import { migrationItemPatchSchema } from "@/features/engramind/schemas/migration"
import { reviewItems } from "@/features/engramind/server/migration"

/** PATCH — aprovar, rejeitar ou editar memórias da revisão. */
export const PATCH = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor(PERMISSION)
    const body = await parseBody(req, migrationItemPatchSchema)
    if (!body.ok) return body.response
    return ok(await reviewItems(body.data, actor.id))
})
