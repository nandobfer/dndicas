import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxCharacterPortraitRetrySchema } from "@/features/maddox/campaign-schemas"
import { retryCharacterPortrait } from "@/features/maddox/server/character-portrait"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/campaigns/[id]/character/portrait — gera de novo o retrato do meu personagem (falha ou sem imagem). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxCharacterPortraitRetrySchema)
    if (!body.ok) return body.response
    return ok(await retryCharacterPortrait(params.id, actor.id), { status: 202 })
})
