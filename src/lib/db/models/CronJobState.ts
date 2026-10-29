import { Schema, model, models, type Document, type Model } from "mongoose"

/**
 * Estado de execução de cada rotina do agendador interno.
 *
 * `lockedUntil` é o lease: só a instância que o reivindica atomicamente executa a rotina,
 * mesmo com vários processos disparando o tick no mesmo minuto. `scheduleSignature`
 * detecta edição do agendamento para recalcular `nextRunAt`.
 */
export interface ICronJobState extends Document {
    jobId: string
    scheduleSignature: string
    nextRunAt: Date
    lockedUntil?: Date | null
    lockedBy?: string | null
    lastRunAt?: Date | null
    lastFinishedAt?: Date | null
    lastStatus?: "ok" | "error" | null
    lastError?: string | null
    lastDurationMs?: number | null
}

const CronJobStateSchema = new Schema(
    {
        jobId: { type: String, required: true, unique: true, index: true },
        scheduleSignature: { type: String, required: true },
        nextRunAt: { type: Date, required: true, index: true },
        lockedUntil: { type: Date, default: null },
        lockedBy: { type: String, default: null },
        lastRunAt: { type: Date, default: null },
        lastFinishedAt: { type: Date, default: null },
        lastStatus: { type: String, enum: ["ok", "error", null], default: null },
        lastError: { type: String, default: null },
        lastDurationMs: { type: Number, default: null },
    },
    { collection: "integration_cron_jobs", versionKey: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.CronJobState
}

export const CronJobState: Model<ICronJobState> =
    (models.CronJobState as Model<ICronJobState>) || model<ICronJobState>("CronJobState", CronJobStateSchema)

export default CronJobState
