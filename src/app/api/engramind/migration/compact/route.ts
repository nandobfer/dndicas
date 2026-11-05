import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PERMISSION = "integrations.engramind.edit"
import { migrationCompactSchema } from "@/features/engramind/schemas/migration"
import { compactCombination } from "@/features/engramind/server/migration"

/** POST — "Compactar com o curador" numa combinação de turno que estoura o orçamento. */
export const POST = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor(PERMISSION)
    const body = await parseBody(req, migrationCompactSchema)
    if (!body.ok) return body.response
    return ok(await compactCombination(body.data.combination, actor.id))
})
