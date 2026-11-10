import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminActor } from "@/features/auth/server/actor"
import { maddoxOpexGlobalMemorySchema } from "@/features/maddox/opex-schemas"
import { withOpexNpcMemories } from "@/features/maddox/server/opex-memories"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/ai/features/maddox/opex-npc-memories/[memoryId] — `{ title, text }`: edita uma memória global dos NPCs Opex. */
export const PATCH = withRoute<{ memoryId: string }>(async ({ req, params }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    const body = await parseBody(req, maddoxOpexGlobalMemorySchema)
    if (!body.ok) return body.response
    return ok(await withOpexNpcMemories((memories) => memories.updateOpexNpcGlobalMemory(params.memoryId, body.data, actor.id)))
})

/** DELETE /api/ai/features/maddox/opex-npc-memories/[memoryId] — remove uma memória global dos NPCs Opex. */
export const DELETE = withRoute<{ memoryId: string }>(async ({ params }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    await withOpexNpcMemories((memories) => memories.deleteOpexNpcGlobalMemory(params.memoryId, actor.id))
    return ok({ deleted: true })
})
