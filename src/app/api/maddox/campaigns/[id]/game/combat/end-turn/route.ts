import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxEndCombatTurnSchema } from "@/features/maddox/combat-schemas"
import { endCombatTurn } from "@/features/maddox/server/tactical-actions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/game/combat/end-turn — `{ movimento? }`: encerra a vez do personagem (o resumo das ações vai para o Maddox). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxEndCombatTurnSchema)
    if (!body.ok) return body.response
    return ok(await endCombatTurn(params.id, body.data, actor.id))
})
