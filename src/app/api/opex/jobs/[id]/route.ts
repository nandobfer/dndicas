import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { opexJobInputSchema } from "@/features/opex-agent/jobs"
import { cancelOpexJob, getOpexJob, updateOpexJob } from "@/features/opex-agent/server/jobs"
import { actorIdOf } from "@/features/opex-agent/server/scope"
import { requireOpexScope } from "@/features/opex-agent/server/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/jobs/[id] — detalhe do job. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getOpexJob(params.id, await requireOpexScope({ loggedIn: true }))))

/**
 * PATCH /api/opex/jobs/[id] — edita um job agendado do próprio usuário (409 `OPEX_JOB_NOT_SCHEDULED`
 * se já começou; 403 `OPEX_JOB_READONLY` num job de outro usuário).
 */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const scope = await requireOpexScope({ loggedIn: true })
    const body = await parseBody(req, opexJobInputSchema)
    if (!body.ok) return body.response
    return ok(await updateOpexJob(params.id, body.data, actorIdOf(scope), scope))
})

/** DELETE /api/opex/jobs/[id] — cancela um job agendado (fica no histórico como cancelado). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    const scope = await requireOpexScope({ loggedIn: true })
    return ok(await cancelOpexJob(params.id, actorIdOf(scope), scope))
})
