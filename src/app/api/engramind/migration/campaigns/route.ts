import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { migrationConfirmSchema } from "@/features/engramind/schemas/migration"
import { downloadCampaignBackup } from "@/features/engramind/server/campaign-memory-move"
import { moveCampaignHistory } from "@/features/engramind/server/migration"
import { AcaoAuditoria, auditEngramind } from "@/features/engramind/server/shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PERMISSION = "integrations.engramind.edit"

/** GET `?id=` — baixa um backup das memórias antigas das campanhas (sem `id`, o mais recente; JSON com SHA-256). */
export const GET = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor(PERMISSION)
    const id = new URL(req.url).searchParams.get("id")
    const file = await downloadCampaignBackup(id ? id.slice(0, 200) : null)
    await auditEngramind(actor.id, "migracao", AcaoAuditoria.EXECUTAR, { passo: "download-backup-campanhas" })
    return new Response(file.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "no-store" } })
})

/** POST — backup, move as memórias das campanhas para o Engramind, confere e apaga as cópias do banco (confirmação explícita). */
export const POST = withRoute(async ({ req }) => {
    const actor = await requirePermissionActor(PERMISSION)
    const body = await parseBody(req, migrationConfirmSchema)
    if (!body.ok) return body.response
    return ok(await moveCampaignHistory(actor.id))
})
