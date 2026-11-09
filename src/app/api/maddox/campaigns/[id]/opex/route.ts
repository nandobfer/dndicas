import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { addMaddoxOpexSchema, canAddMaddoxOpex } from "@/features/maddox/opex-schemas"
import { addOpexCharacter } from "@/features/maddox/server/opex"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/campaigns/[id]/opex — `{ prompt?, interviewMode }`: o dono adiciona um Personagem Opex (permissão `maddox.opex`). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    if (!canAddMaddoxOpex(actor.permissions)) throw new DomainError(403, "Você não tem permissão para adicionar Personagens Opex.", "FORBIDDEN")
    const body = await parseBody(req, addMaddoxOpexSchema)
    if (!body.ok) return body.response
    return ok(await addOpexCharacter(params.id, body.data, actor.id), { status: 201 })
})
