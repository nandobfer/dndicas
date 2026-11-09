import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { retryOpexTableAction } from "@/features/maddox/server/opex"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/opex/[memberId]/retry — "Tentar de novo": o Personagem Opex que falhou age de novo (só o dono). */
export const POST = withRoute<{ id: string; memberId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await retryOpexTableAction(params.id, params.memberId, actor.id))
})
