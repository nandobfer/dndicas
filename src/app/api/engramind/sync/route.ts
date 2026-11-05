import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { getCampaignSync, reconcileCampaignMemories } from "@/features/engramind/server/campaign-mirror"
import { AcaoAuditoria, auditEngramind } from "@/features/engramind/server/shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/sync — estado do espelho das memórias das campanhas. */
export const GET = withRoute(async () => {
    await requirePermissionActor("integrations.engramind.view")
    return ok(await getCampaignSync())
})

/** POST /api/engramind/sync — "Sincronizar agora" (o mesmo que o cron faz). */
export const POST = withRoute(async () => {
    const actor = await requirePermissionActor("integrations.engramind.edit")
    const summary = await reconcileCampaignMemories(actor.id)
    await auditEngramind(actor.id, "sync.campanhas", AcaoAuditoria.EXECUTAR, { resultado: summary })
    return ok(await getCampaignSync())
})
