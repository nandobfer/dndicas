import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { restExchangeInputSchema } from "@/features/maddox/rest-schemas"
import { submitRestExchange } from "@/features/maddox/server/rest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/exchange — `{ text }`: pedido de troca depois do descanso, em linguagem natural (DND-58). O Maddox avalia pelo catálogo em segundo plano e aplica na ficha.
 */
export const POST = withRoute<{ id: string; restId: string; characterId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, restExchangeInputSchema)
    if (!body.ok) return body.response
    return ok(await submitRestExchange(params.id, params.restId, params.characterId, body.data.text, actor.id))
})
