import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { downloadBackup, generateBackup } from "@/features/engramind/server/migration"
import { AcaoAuditoria, auditEngramind } from "@/features/engramind/server/shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET — baixa o backup (JSON com SHA-256). */
export const GET = withRoute(async () => {
    const actor = await requirePermissionActor("integrations.engramind.edit")
    const file = await downloadBackup()
    await auditEngramind(actor.id, "migracao", AcaoAuditoria.EXECUTAR, { passo: "download-backup" })
    return new Response(file.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "no-store" } })
})

/** POST — gera o backup de `agent_memories` (somente leitura da coleção antiga). */
export const POST = withRoute(async () => {
    const actor = await requirePermissionActor("integrations.engramind.edit")
    return ok(await generateBackup(actor.id))
})
