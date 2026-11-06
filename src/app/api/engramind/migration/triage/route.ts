import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PERMISSION = "integrations.engramind.edit"
import { curatorRunSchema } from "@/features/engramind/schemas/migration"
import { runCurator } from "@/features/engramind/server/migration"

/** POST — roda o curador (provedor e modelo de texto escolhidos), em segundo plano. */
export const POST = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor(PERMISSION)
    const body = await parseBody(req, curatorRunSchema)
    if (!body.ok) return body.response
    return ok(await runCurator(body.data, actor.id))
})
