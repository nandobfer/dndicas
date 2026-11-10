import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { canAddMaddoxOpex } from "@/features/maddox/opex-schemas"
import { promoteOpexNpcAsOwner, retireOpexNpcAsOwner } from "@/features/maddox/server/opex-npcs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const FORBIDDEN_MESSAGE = "Você não tem permissão para cuidar de NPCs Opex."

/** POST …/npcs/[npcId]/opex — "Promover a NPC Opex": o dono (permissão `maddox.opex`) promove um NPC conhecido. */
export const POST = withRoute<{ id: string; npcId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    if (!canAddMaddoxOpex(actor.permissions)) throw new DomainError(403, FORBIDDEN_MESSAGE, "FORBIDDEN")
    return ok(await promoteOpexNpcAsOwner(params.id, params.npcId, actor.id))
})

/** DELETE …/npcs/[npcId]/opex — "Remover Opex": o dono (permissão `maddox.opex`) desfaz um NPC Opex conhecido. */
export const DELETE = withRoute<{ id: string; npcId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    if (!canAddMaddoxOpex(actor.permissions)) throw new DomainError(403, FORBIDDEN_MESSAGE, "FORBIDDEN")
    return ok(await retireOpexNpcAsOwner(params.id, params.npcId, actor.id))
})
