import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { getJournalSummary } from "@/features/maddox/server/journal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/campaigns/[id]/journal — resumo do Diário da campanha (situação atual, missões ativas, contagens). */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await getJournalSummary(params.id, actor.id))
})
