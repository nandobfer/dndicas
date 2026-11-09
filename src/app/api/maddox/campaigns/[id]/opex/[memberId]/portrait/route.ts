import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { retryOpexCharacterPortrait } from "@/features/maddox/server/character-portrait"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/opex/[memberId]/portrait — "Gerar retrato de novo" do Personagem Opex (só o dono da campanha). */
export const POST = withRoute<{ id: string; memberId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await retryOpexCharacterPortrait(params.id, params.memberId, actor.id), { status: 202 })
})
