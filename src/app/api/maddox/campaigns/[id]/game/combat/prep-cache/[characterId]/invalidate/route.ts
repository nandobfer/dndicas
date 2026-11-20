import { z } from "zod"
import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { invalidateCombatPrepCache } from "@/features/maddox/server/combat-prep-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const paramsSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i), characterId: z.string().regex(/^[a-f0-9]{24}$/i) })

/**
 * POST …/game/combat/prep-cache/[characterId]/invalidate — "Repreparar ficha" (DND-78): só o dono da campanha. A
 * preparação guardada do personagem deixa de valer; o próximo combate prepara a ficha inteira (o combate atual não muda).
 */
export const POST = withRoute<{ id: string; characterId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const parsed = paramsSchema.safeParse(params)
    if (!parsed.success) throw new DomainError(404, "Personagem não encontrado.", "NOT_FOUND")
    return ok(await invalidateCombatPrepCache(parsed.data.id, parsed.data.characterId, actor.id))
})
