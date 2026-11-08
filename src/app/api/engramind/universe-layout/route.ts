import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MEMORIES_EDIT_PERMISSION, MEMORIES_VIEW_PERMISSION } from "@/features/engramind/constants"
import { getUniverseLayout, resetUniverseLayout, saveUniverseLayout } from "@/features/engramind/server/universe-layout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Lê quem vê a rede (`memories.view`) ou a integração (`integrations.engramind.view`). */
async function requireLayoutReader(): Promise<void> {
    const { requestAccess, denied } = await import("@/features/perfix/server/access")
    const { can } = await import("@/features/perfix/catalog")
    const context = await requestAccess()
    if (!context) throw new DomainError(401, "Faça login para continuar.", "UNAUTHORIZED")
    if (!can(context.effective, MEMORIES_VIEW_PERMISSION) && !can(context.effective, "integrations.engramind.view")) throw denied()
}

/** GET /api/engramind/universe-layout — a configuração em uso (o padrão da lib quando nada foi gravado). */
export const GET = withRoute(async () => {
    await requireLayoutReader()
    return ok(await getUniverseLayout())
})

/** PUT /api/engramind/universe-layout — grava a configuração (campo desconhecido ou fora do intervalo é recusado, com os erros por campo). */
export const PUT = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor(MEMORIES_EDIT_PERMISSION)
    let body: unknown
    try {
        body = await req.json()
    } catch {
        throw new DomainError(400, "Corpo da requisição inválido", "INVALID_JSON")
    }
    return ok(await saveUniverseLayout(body, actor.id))
})

/** DELETE /api/engramind/universe-layout — volta ao padrão. */
export const DELETE = withRoute(async () => {
    const actor = await requirePermissionActor(MEMORIES_EDIT_PERMISSION)
    return ok(await resetUniverseLayout(actor.id))
})
