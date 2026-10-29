/**
 * GET/POST /api/routines/scheduler-tick
 *
 * Um tick do agendador de rotinas disparado de fora do processo (ex.: cron do sistema), com o
 * MESMO motor do `setInterval` do `instrumentation.ts`. Rotinas, horários e liga/desliga continuam
 * em Integrações › Crons, e o lease no Mongo garante no máximo uma execução.
 *
 * Autenticação: `Authorization: Bearer <CRON_SECRET do ambiente OU cron secret da integração>`.
 */

import { NextResponse, type NextRequest } from "next/server"
import { registerBuiltInJobs, runSchedulerTick } from "@/features/integrations/scheduler/cron-scheduler"
import { verifySchedulerTickToken } from "@/features/routines/utils/cron-auth"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

async function handleTick(req: NextRequest) {
    if (!(await verifySchedulerTickToken(req))) {
        return NextResponse.json({ success: false, error: "Não autorizado" }, { status: 401 })
    }

    try {
        registerBuiltInJobs()
        const tick = await runSchedulerTick()
        return NextResponse.json({
            success: true,
            executed: tick.executed,
            ...(tick.skipped ? { skipped: tick.skipped } : {}),
        })
    } catch (error) {
        logger.error({ err: error }, "[scheduler-tick] Falha no tick do agendador")
        return NextResponse.json({ success: false, error: "Erro ao executar o tick do agendador" }, { status: 500 })
    }
}

export async function GET(req: NextRequest) {
    return handleTick(req)
}

export async function POST(req: NextRequest) {
    return handleTick(req)
}
