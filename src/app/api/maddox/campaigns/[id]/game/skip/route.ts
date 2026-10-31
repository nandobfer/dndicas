import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxSkipPlayerSchema } from "@/features/maddox/game-schemas"
import { skipPlayer } from "@/features/maddox/server/game"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/skip — `{ memberId }`: o dono registra "não fez nada" no lugar de um jogador ausente. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxSkipPlayerSchema)
    if (!body.ok) return body.response
    return ok(await skipPlayer(params.id, body.data, actor.id))
})
