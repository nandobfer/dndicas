import { z } from "zod"
import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { discardPendingWrite } from "@/features/engramind/server/campaign-memories"
import { getCampaignSync, syncCampaignMemories } from "@/features/engramind/server/campaign-sync"
import { AcaoAuditoria, auditEngramind } from "@/features/engramind/server/shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/sync — estado da rotina das campanhas (rede, ciclo de vida e fila de gravações). */
export const GET = withRoute(async () => {
    await requirePermissionActor("integrations.engramind.view")
    return ok(await getCampaignSync())
})

/** POST /api/engramind/sync — "Sincronizar agora" (o mesmo que o cron faz). */
export const POST = withRoute(async () => {
    const actor = await requirePermissionActor("integrations.engramind.edit")
    const summary = await syncCampaignMemories(actor.id)
    await auditEngramind(actor.id, "sync.campanhas", AcaoAuditoria.EXECUTAR, { resultado: summary })
    return ok(await getCampaignSync())
})

const discardSchema = z.object({ id: z.string().min(1).max(300) })

/** DELETE /api/engramind/sync — descarta uma gravação recusada da fila (com confirmação na tela). */
export const DELETE = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor("integrations.engramind.edit")
    const body = await parseBody(req, discardSchema)
    if (!body.ok) return body.response
    if (!(await discardPendingWrite(body.data.id))) throw new DomainError(404, "Gravação não encontrada na fila", "NOT_FOUND")
    await auditEngramind(actor.id, "sync.descartar", AcaoAuditoria.EXCLUIR, { gravacao: body.data.id.split(":").slice(1).join(":") })
    return ok(await getCampaignSync())
})
