import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { restExchangeFinishSchema } from "@/features/maddox/rest-schemas"
import { finishRestExchange } from "@/features/maddox/server/rest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/exchange/finish — `{ nothing? }`: "Concluir trocas" ou "Nada a trocar" (DND-58).
 */
export const POST = withRoute<{ id: string; restId: string; characterId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, restExchangeFinishSchema)
    if (!body.ok) return body.response
    return ok(await finishRestExchange(params.id, params.restId, params.characterId, body.data.nothing, actor.id))
})
