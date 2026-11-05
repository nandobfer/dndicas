import { Schema, model, models, type Model } from "mongoose"

/**
 * Coleções do Engramind no dndicas (DND-21):
 * - `engramind_state` (singleton `global`): último bootstrap (passos, sem segredos), saúde do contexto,
 *   estado da sincronização das campanhas e o que o Engramind ainda não aceita para o token de app.
 * - `engramind_context_cache`: último bloco de contexto por agente + canais (`_id` = sha256), usado
 *   quando o Engramind cai.
 * - `engramind_webhook_events`: ids dos eventos recebidos (TTL 24 h), para descartar repetidos.
 */

export type BootstrapStepStatus = "ok" | "skipped" | "warn" | "error" | "pending"

export interface BootstrapStepRecord {
    id: string
    label: string
    status: BootstrapStepStatus
    message: string
    at: Date
}

export interface CampaignSyncRecord {
    lastRunAt: Date | null
    lastOkAt: Date | null
    /** Maior `updated_at` lido nas listagens (a próxima busca parte daqui). */
    cursor: string | null
    lastError: string | null
    lastResult: { pushed: number; pulled: number; removed: number; failed: number; channels: number } | null
}

export interface IEngramindState {
    _id: string
    bootstrap: { ranAt: Date; ok: boolean; steps: BootstrapStepRecord[] } | null
    /** Id (não o segredo) do token em uso de cada agente. */
    agentTokenIds: Record<string, string>
    /** Registro do webhook começado e não concluído (segredo local e remoto podem divergir): impede o pulo do passo. */
    webhookPending: boolean
    memoryContext: { lastOkAt: Date | null; unavailableSince: Date | null; lastError: string | null } | null
    campaignSync: CampaignSyncRecord | null
    /** Categorias que não puderam ser criadas (conflito ou lista cheia). */
    categoryWarnings: string[]
    /** O Engramind aceita `redator.rewrite_text` por canal para o token de app? `null` = ainda não conferido. */
    channelSettings: { supported: boolean | null; checkedAt: Date | null; message: string | null } | null
}

export interface IEngramindContextCache {
    _id: string
    identity: string
    channels: string[]
    content: string
    version: string
    dirty: boolean
    fetchedAt: Date
}

export interface IEngramindWebhookEvent {
    _id: string
    type: string
    receivedAt: Date
}

const stateSchema = new Schema<IEngramindState>(
    {
        _id: { type: String, required: true },
        bootstrap: { type: Schema.Types.Mixed, default: null },
        agentTokenIds: { type: Schema.Types.Mixed, default: () => ({}) },
        webhookPending: { type: Boolean, default: false },
        memoryContext: { type: Schema.Types.Mixed, default: null },
        campaignSync: { type: Schema.Types.Mixed, default: null },
        categoryWarnings: { type: [String], default: [] },
        channelSettings: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "engramind_state", versionKey: false, minimize: false },
)

const contextSchema = new Schema<IEngramindContextCache>(
    {
        _id: { type: String, required: true },
        identity: String,
        channels: [String],
        content: String,
        version: String,
        dirty: { type: Boolean, default: false },
        fetchedAt: Date,
    },
    { collection: "engramind_context_cache", versionKey: false },
)
contextSchema.index({ channels: 1 })

const webhookSchema = new Schema<IEngramindWebhookEvent>(
    { _id: { type: String, required: true }, type: String, receivedAt: { type: Date, default: Date.now, expires: 24 * 60 * 60 } },
    { collection: "engramind_webhook_events", versionKey: false },
)

export const ENGRAMIND_STATE_ID = "global"

export const EngramindState: Model<IEngramindState> = (models.EngramindState as Model<IEngramindState>) ?? model<IEngramindState>("EngramindState", stateSchema)
export const EngramindContextCache: Model<IEngramindContextCache> =
    (models.EngramindContextCache as Model<IEngramindContextCache>) ?? model<IEngramindContextCache>("EngramindContextCache", contextSchema)
export const EngramindWebhookEvent: Model<IEngramindWebhookEvent> =
    (models.EngramindWebhookEvent as Model<IEngramindWebhookEvent>) ?? model<IEngramindWebhookEvent>("EngramindWebhookEvent", webhookSchema)
