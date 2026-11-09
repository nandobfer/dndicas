import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminActor } from "@/features/auth/server/actor"
import { maddoxOpexGlobalMemorySchema } from "@/features/maddox/opex-schemas"
import { withOpexMemories } from "@/features/maddox/server/opex-memories"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/ai/features/maddox/opex-memories/[memoryId] — `{ title, text }`: edita uma memória global. */
export const PATCH = withRoute<{ memoryId: string }>(async ({ req, params }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    const body = await parseBody(req, maddoxOpexGlobalMemorySchema)
    if (!body.ok) return body.response
    return ok(await withOpexMemories((memories) => memories.updateOpexGlobalMemory(params.memoryId, body.data, actor.id)))
})

/** DELETE /api/ai/features/maddox/opex-memories/[memoryId] — remove uma memória global. */
export const DELETE = withRoute<{ memoryId: string }>(async ({ params }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    await withOpexMemories((memories) => memories.deleteOpexGlobalMemory(params.memoryId, actor.id))
    return ok({ deleted: true })
})
