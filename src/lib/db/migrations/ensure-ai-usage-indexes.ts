import { AiUsageLog } from "@/lib/db/models/Ai"

/** Models carregados antes da conexão podem não receber autoIndex. Idempotente em cada boot. */
export async function ensureAiUsageIndexes(): Promise<void> {
    await AiUsageLog.createIndexes()
}
