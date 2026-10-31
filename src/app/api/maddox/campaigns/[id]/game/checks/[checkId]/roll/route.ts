import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxRollCheckSchema } from "@/features/maddox/game-schemas"
import { rollCheck } from "@/features/maddox/server/game-checks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/game/checks/[checkId]/roll — `{}`: rola o teste pedido pelo Maddox (o jogador indicado ou o dono, no lugar
 * dele). O servidor rola com o motor de dados e o modificador da ficha; o corpo não aceita dado nem modificador.
 */
export const POST = withRoute<{ id: string; checkId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxRollCheckSchema)
    if (!body.ok) return body.response
    return ok(await rollCheck(params.id, params.checkId, actor.id))
})
