import { Schema, model, models, type Document, type Model } from "mongoose"
import type { IntegrationLogLevel } from "@/lib/integrations/log-format"

/** Retenção dos logs de debug das integrações. */
export const INTEGRATION_LOG_TTL_SECONDS = 48 * 60 * 60

export interface IIntegrationLog extends Document {
    integrationId: string
    level: IntegrationLogLevel
    message: string
    data?: unknown
    ts: Date
    instance?: string
}

const IntegrationLogSchema = new Schema(
    {
        integrationId: { type: String, required: true },
        level: { type: String, required: true },
        message: { type: String, required: true },
        data: { type: Schema.Types.Mixed },
        ts: { type: Date, required: true, default: Date.now },
        instance: { type: String },
    },
    { collection: "integration_logs", versionKey: false },
)

IntegrationLogSchema.index({ ts: 1 }, { expireAfterSeconds: INTEGRATION_LOG_TTL_SECONDS })
IntegrationLogSchema.index({ integrationId: 1, ts: -1 })

if (process.env.NODE_ENV === "development") {
    delete models.IntegrationLog
}

export const IntegrationLog: Model<IIntegrationLog> =
    (models.IntegrationLog as Model<IIntegrationLog>) || model<IIntegrationLog>("IntegrationLog", IntegrationLogSchema)

export default IntegrationLog
