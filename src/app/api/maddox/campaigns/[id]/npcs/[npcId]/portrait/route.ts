import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { assertMemberCanPlay } from "@/features/maddox/server/campaigns"
import { requestNpcPortrait } from "@/features/maddox/server/scene-images"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/npcs/[npcId]/portrait — "Gerar retrato" de um NPC conhecido pelos jogadores (só o dono, Maddox 10). */
export const POST = withRoute<{ id: string; npcId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    await assertMemberCanPlay(params.id, actor.id)
    return ok(await requestNpcPortrait(params.id, params.npcId, actor.id), { status: 202 })
})
