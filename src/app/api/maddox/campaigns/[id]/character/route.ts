import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxCharacterDraftSchema } from "@/features/maddox/campaign-schemas"
import { upsertCharacterDraft } from "@/features/maddox/server/campaigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PUT /api/maddox/campaigns/[id]/character — esboço do meu personagem (nome e retrato). */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxCharacterDraftSchema)
    if (!body.ok) return body.response
    return ok(await upsertCharacterDraft(params.id, body.data, actor.id))
})
