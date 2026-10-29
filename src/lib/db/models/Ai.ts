import { Schema, model, models, type Model } from "mongoose"

/**
 * Provedores de IA:
 * - `ai_feature_settings`: configuração de cada feature que usa IA (provedor, modelo, prompt…),
 *   validada pelo schema Zod da feature;
 * - `ai_usage_logs`: uma linha por geração (tokens, custo, duração, resultado), retida 90 dias.
 */

export interface IAiFeatureSetting {
    feature: string
    settings: Record<string, unknown>
    updatedAt: Date
    updatedBy: string
}

const AiFeatureSettingSchema = new Schema<IAiFeatureSetting>(
    {
        feature: { type: String, required: true, unique: true },
        settings: { type: Schema.Types.Mixed, default: {} },
        updatedAt: { type: Date, default: () => new Date() },
        updatedBy: { type: String, required: true },
    },
    { collection: "ai_feature_settings", versionKey: false, minimize: false },
)

export interface IAiUsageLog {
    feature: string
    provider: string
    model: string
    /** Referência do que foi processado (ex.: entidade ou sessão). */
    subject: string | null
    ok: boolean
    error: string | null
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    costUsd: number | null
    usageSource: "api" | "historical-allocation" | null
    inputPricePerMillionUsd: number | null
    reconciliationBatch: string | null
    reconciledAt: Date | null
    durationMs: number
    createdAt: Date
}

const AiUsageLogSchema = new Schema<IAiUsageLog>(
    {
        feature: { type: String, required: true, index: true },
        provider: { type: String, required: true },
        model: { type: String, required: true },
        subject: { type: String, default: null },
        ok: { type: Boolean, required: true },
        error: { type: String, default: null },
        inputTokens: { type: Number, default: null },
        outputTokens: { type: Number, default: null },
        totalTokens: { type: Number, default: null },
        costUsd: { type: Number, default: null },
        usageSource: { type: String, enum: ["api", "historical-allocation", null], default: null },
        inputPricePerMillionUsd: { type: Number, default: null },
        reconciliationBatch: { type: String, default: null },
        reconciledAt: { type: Date, default: null },
        durationMs: { type: Number, required: true },
        createdAt: { type: Date, default: () => new Date(), expires: 60 * 60 * 24 * 90 },
    },
    { collection: "ai_usage_logs", versionKey: false },
)

AiUsageLogSchema.index({ provider: 1, createdAt: -1 })

if (process.env.NODE_ENV === "development") {
    delete models.AiFeatureSetting
    delete models.AiUsageLog
}

export const AiFeatureSetting: Model<IAiFeatureSetting> =
    (models.AiFeatureSetting as Model<IAiFeatureSetting>) || model<IAiFeatureSetting>("AiFeatureSetting", AiFeatureSettingSchema)
export const AiUsageLog: Model<IAiUsageLog> = (models.AiUsageLog as Model<IAiUsageLog>) || model<IAiUsageLog>("AiUsageLog", AiUsageLogSchema)
