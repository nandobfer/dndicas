import { created, ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { parseBody, withRoute } from "@/lib/api/route"
import { memoryInputSchema } from "@/features/ai/schemas"
import { createAgentMemory, listAgentMemories } from "@/features/ai/server/agent-memory-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/agents/[agentId]/memories — memórias de uma lista do agente. */
export const GET = withRoute<{ agentId: string }>(async ({ params }) => {
    await requireAdminActor()
    return ok(await listAgentMemories(params.agentId))
})

/** POST /api/ai/agents/[agentId]/memories — nova memória, formatada pelo Resumo de memórias. */
export const POST = withRoute<{ agentId: string }>(async ({ req, params }) => {
    const actor = await requireAdminActor()
    const body = await parseBody(req, memoryInputSchema)
    if (!body.ok) return body.response
    return created(await createAgentMemory(params.agentId, body.data.texto, actor.id))
})
