import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { opexJobInputSchema, opexJobListQuerySchema } from "@/features/opex-agent/jobs"
import { createOpexJob, listOpexJobs } from "@/features/opex-agent/server/jobs"
import { actorIdOf } from "@/features/opex-agent/server/scope"
import { requireOpexScope } from "@/features/opex-agent/server/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/opex/jobs?filter=scheduled|finished|all&origin=all|mine|others&userId= — jobs do Agente
 * Opex (login obrigatório): o usuário vê os próprios; o administrador, os de todos.
 */
export const GET = withRoute(async ({ req }) => {
    const scope = await requireOpexScope({ loggedIn: true })
    const params = new URL(req.url).searchParams
    const query = opexJobListQuerySchema.safeParse({
        filter: params.get("filter") ?? undefined,
        origin: params.get("origin") ?? undefined,
        userId: params.get("userId") || undefined,
    })
    return ok(await listOpexJobs(query.success ? query.data : { filter: "all", origin: "all" }, scope))
})

/** POST /api/opex/jobs — agenda um prompt do agente (`when: "now"` começa na hora). */
export const POST = withRoute(async ({ req }) => {
    const scope = await requireOpexScope({ loggedIn: true })
    const body = await parseBody(req, opexJobInputSchema)
    if (!body.ok) return body.response
    return created(await createOpexJob(body.data, { actorId: actorIdOf(scope), createdBy: "user" }, scope))
})
