import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { restEmptyBodySchema } from "@/features/maddox/rest-schemas"
import { skipRestPrep } from "@/features/maddox/server/rest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/prep/skip — `{}`: "Seguir sem" do dono: aplica a recuperação sem o catálogo (cargas e espaços do curto não voltam, com o motivo) (DND-58).
 */
export const POST = withRoute<{ id: string; restId: string; characterId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, restEmptyBodySchema)
    if (!body.ok) return body.response
    return ok(await skipRestPrep(params.id, params.restId, params.characterId, actor.id))
})
