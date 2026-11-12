import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxCombatPrepAnswerSchema } from "@/features/maddox/combat-schemas"
import { answerCombatPrep } from "@/features/maddox/server/combat-prep"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST …/game/combat/preps/[prepId]/answer — `{ text }`: resposta do jogador à pergunta da preparação do combate (DND-51).
 * Responde o dono do personagem; pelo Personagem Opex, o dono da campanha.
 */
export const POST = withRoute<{ id: string; prepId: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, maddoxCombatPrepAnswerSchema)
    if (!body.ok) return body.response
    return ok(await answerCombatPrep(params.id, params.prepId, body.data.text, actor.id))
})
