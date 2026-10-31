import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { assertGameMember } from "@/features/maddox/server/game"
import { openGameStream } from "@/features/maddox/server/game-stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET …/game/stream — NDJSON da mesa: `snapshot` + as gerações do Maddox ao vivo (`ping` a cada 15 s). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    await assertGameMember(params.id, actor.id)
    return openGameStream(params.id, req.signal)
})
