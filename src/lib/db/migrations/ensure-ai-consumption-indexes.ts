import { AiConsumption } from "@/lib/db/models/AiConsumption"

/** Models carregados antes da conexão podem não receber autoIndex. Idempotente em cada boot. */
export async function ensureAiConsumptionIndexes(): Promise<void> {
    await AiConsumption.createIndexes()
}
