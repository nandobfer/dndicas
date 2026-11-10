import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxRewindSchema } from "@/features/maddox/game-schemas"
import { listRewindTurns, rewindToTurn } from "@/features/maddox/server/rewind"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET …/game/rewind — turnos para onde o dono pode voltar a mesa (DND-44), do mais recente para o mais antigo. */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await listRewindTurns(params.id, actor.id))
})

/** POST …/game/rewind — `{ turnNumber }`: o dono leva a mesa ao estado do turno (também "Desfazer turno"). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxRewindSchema)
    if (!body.ok) return body.response
    return ok(await rewindToTurn(params.id, body.data, actor.id))
})
