import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { parseBody, withRoute } from "@/lib/api/route"
import { memoryInputSchema } from "@/features/ai/schemas"
import { deleteAgentMemory, getAgentMemory, updateAgentMemory } from "@/features/ai/server/agent-memory-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { agentId: string; memoryId: string }

/** GET /api/ai/agents/[agentId]/memories/[memoryId] — uma memória. */
export const GET = withRoute<Params>(async ({ params }) => {
    await requireAdminActor()
    return ok(await getAgentMemory(params.agentId, params.memoryId))
})

/** PATCH — edita o texto (reformatado pelo Resumo de memórias). */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireAdminActor()
    const body = await parseBody(req, memoryInputSchema)
    if (!body.ok) return body.response
    return ok(await updateAgentMemory(params.agentId, params.memoryId, body.data.texto, actor.id))
})

/** DELETE — exclui (a auditoria guarda o texto). */
export const DELETE = withRoute<Params>(async ({ params }) => {
    const actor = await requireAdminActor()
    return ok(await deleteAgentMemory(params.agentId, params.memoryId, actor.id))
})
