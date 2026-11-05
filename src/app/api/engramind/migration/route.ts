import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { getMigration } from "@/features/engramind/server/migration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/migration — estado da migração das memórias (etapas, itens, orçamento e contagens). */
export const GET = withRoute(async () => {
    await requirePermissionActor("integrations.engramind.edit")
    return ok(await getMigration())
})
