import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { restEmptyBodySchema } from "@/features/maddox/rest-schemas"
import { rollRestHitDie } from "@/features/maddox/server/rest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/game/rests/[restId]/characters/[characterId]/hit-dice/roll — `{}`: rola UM dado de vida no descanso curto (DND-58). O jogador do personagem (ou o dono, pelo Personagem Opex cujo agente falhou); o servidor rola com o motor de dados e a Constituição da ficha.
 */
export const POST = withRoute<{ id: string; restId: string; characterId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, restEmptyBodySchema)
    if (!body.ok) return body.response
    return ok(await rollRestHitDie(params.id, params.restId, params.characterId, actor.id))
})
