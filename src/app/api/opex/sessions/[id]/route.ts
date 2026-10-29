import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { updateOpexSessionSchema } from "@/features/opex-agent/schemas"
import { actorIdOf } from "@/features/opex-agent/server/scope"
import { deleteSession, getSessionDetail, updateSession } from "@/features/opex-agent/server/sessions"
import { requireOpexScope } from "@/features/opex-agent/server/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/sessions/[id] — sessão com as mensagens gravadas (só do dono). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getSessionDetail(params.id, await requireOpexScope())))

/** PATCH /api/opex/sessions/[id] — renomeia (título passa a ser manual) ou arquiva. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const scope = await requireOpexScope()
    const body = await parseBody(req, updateOpexSessionSchema)
    if (!body.ok) return body.response
    return ok(await updateSession(params.id, body.data, actorIdOf(scope), scope))
})

/** DELETE /api/opex/sessions/[id] — exclui a sessão, as mensagens, as ações pendentes e os arquivos (storage + metadados). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    const scope = await requireOpexScope()
    await deleteSession(params.id, actorIdOf(scope), scope)
    return ok({ id: params.id })
})
