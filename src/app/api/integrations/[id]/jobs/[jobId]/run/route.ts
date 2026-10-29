import { NextResponse, type NextRequest } from "next/server"
import { denyUnlessAdmin, requireAdminActor } from "@/features/auth/server/actor"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { logApiError, logger } from "@/lib/logger"
import { CronJobRunError, runJobNow } from "@/features/integrations/scheduler/cron-scheduler"
import { INTEGRATION_AUDIT_ENTITY } from "@/features/integrations/services/integration-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; jobId: string }> }

/**
 * POST /api/integrations/crons/jobs/[jobId]/run — "Executar agora".
 *
 * Executa a rotina SALVA imediatamente, sem alterar a próxima execução agendada. 404: rotina não salva; 409: já em execução. Falha da própria
 * rotina responde 200 com `ok: false` (o resultado também fica gravado no estado da rotina).
 */
export async function POST(_request: NextRequest, { params }: Params) {
    const denied = await denyUnlessAdmin()
    if (denied) return denied
    const { id, jobId } = await params
    if (id !== "crons") {
        return NextResponse.json({ success: false, error: "Integração sem rotinas" }, { status: 404 })
    }
    try {
        const userId = (await requireAdminActor()).id
        const result = await runJobNow(jobId)

        await recordAudit({
            userId,
            entidade: INTEGRATION_AUDIT_ENTITY,
            entidadeId: "crons",
            acao: AcaoAuditoria.ATUALIZAR,
            depois: {
                execucaoManual: jobId,
                resultado: result.ok ? "ok" : "erro",
                mensagem: result.message.slice(0, 500),
                duracaoMs: result.durationMs,
            },
        })
        logger.info({ jobId, ok: result.ok, durationMs: result.durationMs }, "[scheduler] Rotina executada manualmente")

        return NextResponse.json({ success: true, data: result })
    } catch (error) {
        if (error instanceof CronJobRunError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status })
        }
        logApiError({ route: "/api/integrations/[id]/jobs/[jobId]/run", method: "POST", error })
        return NextResponse.json({ success: false, error: "Erro ao executar a rotina" }, { status: 500 })
    }
}
