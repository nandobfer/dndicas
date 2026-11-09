import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { regenerateMaddoxOpexDraftSchema } from "@/features/maddox/opex-schemas"
import { regenerateOpexDraft } from "@/features/maddox/server/opex-interview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/interview/draft/regenerate — `{ orientacao? }`: "Gerar outra resposta" (ou pedir um ajuste na síntese). */
export const POST = withRoute<{ id: string; memberId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, regenerateMaddoxOpexDraftSchema)
    if (!body.ok) return body.response
    return ok(await regenerateOpexDraft(params.id, params.memberId, body.data.orientacao || null, actor.id), { status: 202 })
})
