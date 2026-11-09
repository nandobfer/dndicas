import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminActor } from "@/features/auth/server/actor"
import { maddoxOpexGlobalMemorySchema } from "@/features/maddox/opex-schemas"
import { withOpexMemories } from "@/features/maddox/server/opex-memories"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/maddox/opex-memories — memórias globais que todo Personagem Opex lê (administradores). */
export const GET = withRoute(async () => {
    await requireAdminActor("integrations.ai.view")
    return ok(await withOpexMemories((memories) => memories.listOpexGlobalMemories()))
})

/** POST /api/ai/features/maddox/opex-memories — `{ title, text }`: inclui uma memória global. */
export const POST = withRoute(async ({ req }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    const body = await parseBody(req, maddoxOpexGlobalMemorySchema)
    if (!body.ok) return body.response
    return ok(await withOpexMemories((memories) => memories.createOpexGlobalMemory(body.data, actor.id)), { status: 201 })
})
