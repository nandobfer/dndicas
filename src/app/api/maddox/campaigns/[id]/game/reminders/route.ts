import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxReminderSchema } from "@/features/maddox/game-schemas"
import { submitReminder } from "@/features/maddox/server/reminders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/reminders — `{ texto }`: "Injetar Lembrança" (DND-25), considerada na próxima narração do Maddox. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxReminderSchema)
    if (!body.ok) return body.response
    return ok(await submitReminder(params.id, body.data, actor.id))
})
