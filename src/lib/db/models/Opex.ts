import { Schema, model, models, type Model, type Types } from "mongoose"
import type { OpexJobStatus, OpexJobUnit, OpexJobWhen } from "@/features/opex-agent/jobs"
import type { OpexConfirmationStatus, OpexMessageStatus, OpexPart, OpexSessionStatus, OpexUsageDto } from "@/features/opex-agent/types"

/**
 * Coleções do Agente Opex (`opex_sessions`, `opex_messages`, `opex_pending_actions`, `opex_files` e `opex_jobs`).
 * Ver `aicontext/modules/opex-agent.md`. Os índices são garantidos pela migração
 * `ensure-opex-indexes`.
 */

export interface IOpexSession {
    title: string
    summary: string
    titleSource: "auto" | "manual"
    status: OpexSessionStatus
    lastError: string | null
    archived: boolean
    messageCount: number
    /** Próximo número de ordem das mensagens. */
    nextSeq: number
    /** Usuário logado dono da sessão; `null` = sessão de visitante anônimo. */
    userId: string | null
    /** Visitante anônimo dono da sessão (cookie assinado); `null` = sessão de usuário. */
    anonymousId: string | null
    /** Sessões de visitantes expiram (TTL configurável); as de usuários ficam (`null`). */
    expiresAt: Date | null
    lastMessageAt: Date
    createdAt: Date
    updatedAt: Date
}

/** Metadados de um arquivo na mensagem do usuário (o binário fica no Storage S3). */
export interface IOpexFileRef {
    id: string
    name: string
    mediaType: string
    size: number
}

export interface IOpexMessage {
    sessionId: Types.ObjectId
    seq: number
    role: "user" | "assistant"
    kind: "message" | "confirmation" | "job"
    /** Mensagem disparada por um job agendado. */
    job?: { id: string; title: string } | null
    text: string
    files: IOpexFileRef[]
    parts: OpexPart[]
    /**
     * Mensagens no formato da AI SDK (`ModelMessage[]`) em JSON, reenviadas como histórico. Texto, não
     * objeto: resultados de ferramenta podem ter chaves que o MongoDB não aceita (`$`, `.`).
     */
    modelMessages: string
    status: OpexMessageStatus
    error: string | null
    usage: OpexUsageDto | null
    durationMs: number | null
    model: string | null
    createdAt: Date
}

/**
 * Arquivo do chat: só metadados. A reserva grava `uploadKey` (chave temporária do PUT assinado);
 * a confirmação confere o objeto e o promove para `key` (`ready: true`). `pending` = ainda não foi
 * numa mensagem; a rotina `opex-files-cleanup` remove os pendentes com mais de 24 h (S3 + registro).
 */
export interface IOpexFile {
    sessionId: Types.ObjectId
    /** Mensagem que usou o arquivo; `null` enquanto pendente. */
    messageId: Types.ObjectId | null
    pending: boolean
    /** Envio confirmado no storage (objeto promovido para `key`). */
    ready: boolean
    name: string
    mediaType: string
    size: number
    key: string
    uploadKey: string
    createdAt: Date
}

export interface IOpexPendingAction {
    sessionId: Types.ObjectId
    messageId: Types.ObjectId | null
    toolCallId: string
    toolName: string
    /** Entrada cifrada (`secretBox`): pode conter segredos; apagada depois da decisão. */
    input: unknown
    summary: string
    status: OpexConfirmationStatus
    /** Resultado da execução confirmada (JSON). */
    result: string | null
    error: string | null
    expiresAt: Date
    decidedAt: Date | null
    createdAt: Date
}

const OpexSessionSchema = new Schema<IOpexSession>(
    {
        title: { type: String, required: true },
        summary: { type: String, default: "" },
        titleSource: { type: String, enum: ["auto", "manual"], default: "auto" },
        status: { type: String, enum: ["idle", "running", "awaiting_confirmation", "error"], default: "idle" },
        lastError: { type: String, default: null },
        archived: { type: Boolean, default: false },
        messageCount: { type: Number, default: 0 },
        nextSeq: { type: Number, default: 1 },
        userId: { type: String, default: null },
        anonymousId: { type: String, default: null },
        expiresAt: { type: Date, default: null },
        lastMessageAt: { type: Date, default: () => new Date() },
    },
    { collection: "opex_sessions", versionKey: false, timestamps: true },
)
// Sessões privadas de cada usuário e de cada visitante; as de visitantes saem pelo TTL de `expiresAt`
// (as mensagens, ações e arquivos delas são apagados pela rotina de limpeza).
OpexSessionSchema.index({ userId: 1, archived: 1, lastMessageAt: -1 })
OpexSessionSchema.index({ anonymousId: 1, archived: 1, lastMessageAt: -1 })
OpexSessionSchema.index({ expiresAt: 1 })

const OpexMessageSchema = new Schema<IOpexMessage>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true },
        seq: { type: Number, required: true },
        role: { type: String, enum: ["user", "assistant"], required: true },
        kind: { type: String, enum: ["message", "confirmation", "job"], default: "message" },
        job: { type: Schema.Types.Mixed, default: undefined },
        text: { type: String, default: "" },
        files: { type: Schema.Types.Mixed, default: [] },
        parts: { type: Schema.Types.Mixed, default: [] },
        modelMessages: { type: String, default: "[]" },
        status: { type: String, enum: ["complete", "interrupted", "error"], default: "complete" },
        error: { type: String, default: null },
        usage: { type: Schema.Types.Mixed, default: null },
        durationMs: { type: Number, default: null },
        model: { type: String, default: null },
    },
    { collection: "opex_messages", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)
OpexMessageSchema.index({ sessionId: 1, seq: 1 }, { unique: true })

const OpexPendingActionSchema = new Schema<IOpexPendingAction>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true, index: true },
        messageId: { type: Schema.Types.ObjectId, default: null },
        toolCallId: { type: String, required: true },
        toolName: { type: String, required: true },
        input: { type: Schema.Types.Mixed, default: null },
        summary: { type: String, required: true },
        status: { type: String, enum: ["pending", "confirmed", "cancelled", "failed", "expired"], default: "pending" },
        result: { type: String, default: null },
        error: { type: String, default: null },
        expiresAt: { type: Date, required: true },
        decidedAt: { type: Date, default: null },
    },
    { collection: "opex_pending_actions", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)

const OpexFileSchema = new Schema<IOpexFile>(
    {
        sessionId: { type: Schema.Types.ObjectId, required: true, index: true },
        messageId: { type: Schema.Types.ObjectId, default: null },
        pending: { type: Boolean, default: true },
        ready: { type: Boolean, default: false },
        name: { type: String, required: true },
        mediaType: { type: String, required: true },
        size: { type: Number, required: true },
        key: { type: String, required: true },
        uploadKey: { type: String, required: true },
    },
    { collection: "opex_files", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)
OpexFileSchema.index({ pending: 1, createdAt: 1 })

/**
 * Job (prompt agendado do agente) — `opex_jobs`. Sempre de um usuário logado (`userId`, o mesmo da
 * sessão); visitantes não agendam jobs. Terminado, sai pelo TTL de `purgeAt`.
 */
export interface IOpexJob {
    _id: Types.ObjectId
    title: string
    prompt: string
    sessionId: Types.ObjectId | null
    resultSessionId: Types.ObjectId | null
    schedule: { when: OpexJobWhen; amount: number | null; unit: OpexJobUnit | null; date: string | null; time: string | null }
    runAt: Date
    status: OpexJobStatus
    startedAt: Date | null
    finishedAt: Date | null
    delayMs: number | null
    error: string | null
    createdBy: "user" | "agent"
    originSessionId: Types.ObjectId | null
    sourceJobId: Types.ObjectId | null
    /** Usuário dono do job. */
    userId: string
    purgeAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const OpexJobSchema = new Schema<IOpexJob>(
    {
        title: { type: String, required: true },
        prompt: { type: String, required: true },
        sessionId: { type: Schema.Types.ObjectId, default: null },
        resultSessionId: { type: Schema.Types.ObjectId, default: null },
        schedule: { type: Schema.Types.Mixed, required: true },
        runAt: { type: Date, required: true },
        status: { type: String, enum: ["scheduled", "running", "done", "error", "awaiting_confirmation", "canceled"], default: "scheduled" },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        delayMs: { type: Number, default: null },
        error: { type: String, default: null },
        createdBy: { type: String, enum: ["user", "agent"], default: "user" },
        originSessionId: { type: Schema.Types.ObjectId, default: null },
        sourceJobId: { type: Schema.Types.ObjectId, default: null },
        userId: { type: String, required: true },
        purgeAt: { type: Date, default: null },
    },
    { collection: "opex_jobs", versionKey: false, timestamps: true },
)
OpexJobSchema.index({ status: 1, runAt: 1 })
OpexJobSchema.index({ createdAt: -1 })
OpexJobSchema.index({ userId: 1, runAt: -1 })
OpexJobSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: "purge_ttl" })

if (process.env.NODE_ENV === "development") {
    delete models.OpexJob
    delete models.OpexFile
    delete models.OpexSession
    delete models.OpexMessage
    delete models.OpexPendingAction
}

export const OpexSession: Model<IOpexSession> = (models.OpexSession as Model<IOpexSession>) || model<IOpexSession>("OpexSession", OpexSessionSchema)
export const OpexMessage: Model<IOpexMessage> = (models.OpexMessage as Model<IOpexMessage>) || model<IOpexMessage>("OpexMessage", OpexMessageSchema)
export const OpexFile: Model<IOpexFile> = (models.OpexFile as Model<IOpexFile>) || model<IOpexFile>("OpexFile", OpexFileSchema)
export const OpexJob: Model<IOpexJob> = (models.OpexJob as Model<IOpexJob>) || model<IOpexJob>("OpexJob", OpexJobSchema)
export const OpexPendingAction: Model<IOpexPendingAction> =
    (models.OpexPendingAction as Model<IOpexPendingAction>) || model<IOpexPendingAction>("OpexPendingAction", OpexPendingActionSchema)
