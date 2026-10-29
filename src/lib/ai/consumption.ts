import { dbConnect } from "@/lib/db"
import { AiConsumption } from "@/lib/db/models/AiConsumption"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { AI_CONSUMPTION_UPDATED_EVENT } from "./consumption-events"

/**
 * Registro do **consumo de IA prospectivo** (painel de consumo dos provedores). Uma linha por etapa/
 * geração, identificada por `dedupKey` — reenvios e reconexões não contam duas vezes. Nunca lança:
 * falha de telemetria não pode interromper a geração do agente.
 */

export { AI_CONSUMPTION_UPDATED_EVENT } from "./consumption-events"

export interface AiConsumptionInput {
    /** Identidade estável da medição (ver `AiConsumption`). */
    dedupKey: string
    provider: string
    origin: string
    subject?: string | null
    model: string
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
}

export async function recordAiConsumption(input: AiConsumptionInput): Promise<void> {
    try {
        await dbConnect()
        const result = await AiConsumption.updateOne(
            { dedupKey: input.dedupKey },
            {
                $setOnInsert: {
                    provider: input.provider,
                    origin: input.origin,
                    subject: input.subject ?? null,
                    model: input.model,
                    inputTokens: input.inputTokens,
                    outputTokens: input.outputTokens,
                    totalTokens: input.totalTokens,
                    costUsd: input.costUsd,
                    createdAt: new Date(),
                },
            },
            { upsert: true },
        )
        if (result.upsertedCount > 0) {
            await publishAppEvent(AI_CONSUMPTION_UPDATED_EVENT, { provider: input.provider, origin: input.origin })
        }
    } catch (error) {
        loggerFor({ module: "ai", feature: "consumption" }).warn({ err: error }, "Falha ao registrar consumo de IA")
    }
}
