import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxTalkSchema } from "@/features/maddox/game-schemas"
import { submitTalk } from "@/features/maddox/server/reminders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/game/talk — `{ texto }`: "Conversar com o Mestre" (DND-74; sucede o "Perguntar ao mestre" e o "Injetar
 * Lembrança"). Conversa fora da mesa, em qualquer fase da campanha em andamento: o mestre trata o pedido na hora.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxTalkSchema)
    if (!body.ok) return body.response
    return ok(await submitTalk(params.id, body.data, actor.id))
})
