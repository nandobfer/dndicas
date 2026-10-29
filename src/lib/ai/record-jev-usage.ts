import { dbConnect } from "@/lib/db"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { AcaoAuditoria, recordAudit } from "@/lib/audit/record"
import { SYSTEM_ACTOR } from "@/features/auth/server/actor"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { JEV_USAGE_UPDATED_EVENT, normalizeJevUsage } from "./jev-usage"

export interface JevUsageContext {
    feature: string
    subject: string | null
}

interface JevUsageRecord extends JevUsageContext {
    model: string
    ok: boolean
    error: string | null
    durationMs: number
    usage?: { input_tokens?: number; output_tokens?: number }
}

/** Uma linha por requisição, antes do processamento de negócio. Falhas de telemetria não quebram IA. */
export async function recordJevUsage(input: JevUsageRecord): Promise<void> {
    try {
        await dbConnect()
        const { usage, ...context } = input
        const metrics = normalizeJevUsage(usage)
        const log = await AiUsageLog.create({ ...context, provider: "jev", ...metrics })
        await recordAudit({
            userId: SYSTEM_ACTOR.id,
            entidade: "UsoIA",
            entidadeId: String(log._id),
            acao: AcaoAuditoria.CRIAR,
            depois: { provider: "jev", feature: input.feature, model: input.model, ...metrics },
        })
        await publishAppEvent(JEV_USAGE_UPDATED_EVENT, { provider: "jev" })
    } catch (error) {
        loggerFor({ module: "ai", provider: "jev" }).warn({ err: error }, "Falha ao registrar uso do JEV")
    }
}
