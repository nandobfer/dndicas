import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { checkTurn } from "@/features/maddox/server/game"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/check — reavalia o turno (alguém saiu da mesa); o servidor consulta a presença por conta própria. */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await checkTurn(params.id, actor.id))
})
