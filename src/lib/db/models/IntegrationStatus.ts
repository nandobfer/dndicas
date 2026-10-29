import { Schema, model, models, type Document, type Model } from "mongoose"

/** `warn`: acessível com restrição (ex.: fonte em manutenção programada) — não é defeito. */
export type IntegrationHealthStatus = "ok" | "warn" | "error" | "unknown"

/**
 * Último resultado do teste de conexão de cada integração.
 *
 * Separado de `Integration` de propósito: o health check roda a cada poucos minutos e não
 * pode reescrever `updatedBy/updatedAt` da configuração nem gerar ruído de auditoria.
 */
export interface IIntegrationStatus extends Document {
    integrationId: string
    status: IntegrationHealthStatus
    latencyMs?: number
    message?: string
    checkedAt: Date
    source: "manual" | "scheduler"
    /** Início do teste em andamento; removido ao terminar. Sem `status` enquanto nunca terminou. */
    runningSince?: Date | null
}

const IntegrationStatusSchema = new Schema(
    {
        integrationId: { type: String, required: true, unique: true, index: true },
        status: { type: String, enum: ["ok", "warn", "error", "unknown"], required: true },
        latencyMs: { type: Number },
        message: { type: String },
        checkedAt: { type: Date, required: true },
        source: { type: String, enum: ["manual", "scheduler"], required: true },
        runningSince: { type: Date, default: null },
    },
    { collection: "integration_statuses", versionKey: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.IntegrationStatus
}

export const IntegrationStatus: Model<IIntegrationStatus> =
    (models.IntegrationStatus as Model<IIntegrationStatus>) ||
    model<IIntegrationStatus>("IntegrationStatus", IntegrationStatusSchema)

export default IntegrationStatus
