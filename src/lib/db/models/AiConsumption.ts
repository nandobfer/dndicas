import { Schema, model, models, type Model } from "mongoose"

/**
 * Consumo de IA dO Opex, uma linha por **etapa/geração** (prospectivo). É a fonte do painel de
 * consumo da página de cada provedor — separado dos acumuladores das features (`ai_usage_logs`),
 * das mesas (`agentic_workbenches.usage` + `time_logs`) e dos refinamentos (`task_refinements.usage`),
 * para nunca somar duas vezes o mesmo gasto.
 *
 * `dedupKey` é a identidade estável da medição (ex.: `session:{origem}:{execução}:{stepId}` ou
 * `stream:{uuid}`): uma reconexão que reenvie o mesmo passo não duplica o registro. Métricas
 * ausentes ficam `null` (desconhecidas), nunca zero.
 */
export interface IAiConsumption {
    dedupKey: string
    /** Provedor medido (hoje `opencode`). */
    provider: string
    /** Origem do uso: id do agente de IA (ex.: `image-generator`, `opex-agent`). */
    origin: string
    /** Referência do que foi processado (ex.: sessão do agente ou entidade), quando houver. */
    subject: string | null
    model: string
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
    createdAt: Date
}

const AiConsumptionSchema = new Schema<IAiConsumption>(
    {
        dedupKey: { type: String, required: true, unique: true },
        provider: { type: String, required: true },
        origin: { type: String, required: true },
        subject: { type: String, default: null },
        model: { type: String, required: true },
        inputTokens: { type: Number, default: null },
        outputTokens: { type: Number, default: null },
        totalTokens: { type: Number, default: null },
        costUsd: { type: Number, default: null },
        createdAt: { type: Date, default: () => new Date() },
    },
    { collection: "ai_consumption_logs", versionKey: false },
)

AiConsumptionSchema.index({ provider: 1, createdAt: -1 })
AiConsumptionSchema.index({ provider: 1, origin: 1, createdAt: -1 })

if (process.env.NODE_ENV === "development") {
    delete models.AiConsumption
}

export const AiConsumption: Model<IAiConsumption> =
    (models.AiConsumption as Model<IAiConsumption>) || model<IAiConsumption>("AiConsumption", AiConsumptionSchema)
