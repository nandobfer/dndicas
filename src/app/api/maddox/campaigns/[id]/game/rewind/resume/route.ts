import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxResumeTurnSchema } from "@/features/maddox/game-schemas"
import { resumeCurrentTurn } from "@/features/maddox/server/rewind"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/rewind/resume — "Voltar ao turno atual (N)": desfaz a volta pendente inteira (DND-44). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxResumeTurnSchema)
    if (!body.ok) return body.response
    return ok(await resumeCurrentTurn(params.id, actor.id))
})
