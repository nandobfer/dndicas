import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { updateMaddoxCampaignSchema } from "@/features/maddox/campaign-schemas"
import { canAddMaddoxOpex } from "@/features/maddox/opex-schemas"
import { getCampaignDetail, updateCampaign } from "@/features/maddox/server/campaigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/campaigns/[id] — campanha e membros (só para membros; os demais recebem 404). */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const detail = await getCampaignDetail(params.id, actor.id)
    // Personagens Opex (DND-26): o botão "Adicionar Personagem Opex" só aparece para o dono com a permissão.
    return ok({ ...detail, canAddOpex: detail.ownerId === actor.id && canAddMaddoxOpex(actor.permissions) })
})

/** PATCH /api/maddox/campaigns/[id] — dono altera nome, CD, imagens, densidade (a qualquer momento) e (só no lobby) o rigor. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const body = await parseBody(req, updateMaddoxCampaignSchema)
    if (!body.ok) return body.response
    return ok(await updateCampaign(params.id, body.data, actor.id))
})
