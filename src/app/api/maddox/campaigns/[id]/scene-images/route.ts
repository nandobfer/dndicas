import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { assertMemberCanPlay } from "@/features/maddox/server/campaigns"
import { requestManualSceneImage } from "@/features/maddox/server/scene-images"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/scene-images — "Gerar imagem da cena" (só o dono, Maddox 10): o Maddox descreve a cena atual e a imagem é
 * pintada em segundo plano, presa à última narração. Respeita o teto diário e uma por vez (409 `SCENE_IMAGE_LIMIT`,
 * `SCENE_IMAGE_BUSY`, `AI_IMAGE_UNAVAILABLE`, `NO_NARRATION`).
 */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    await assertMemberCanPlay(params.id, actor.id)
    return ok(await requestManualSceneImage(params.id, actor.id), { status: 202 })
})
