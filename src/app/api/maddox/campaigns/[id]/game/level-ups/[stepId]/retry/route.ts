import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { levelUpRetryBodySchema } from "@/features/maddox/game-schemas"
import { retryOpexLevelUp } from "@/features/maddox/server/level-up-opex"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/game/level-ups/[stepId]/retry — `{}`: "Tentar de novo" do dono na subida de nível do Personagem Opex que
 * falhou (DND-56). O agente decide de novo fora da fila da campanha; devolve a mesa.
 */
export const POST = withRoute<{ id: string; stepId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, levelUpRetryBodySchema)
    if (!body.ok) return body.response
    return ok(await retryOpexLevelUp(params.id, params.stepId, actor.id))
})
