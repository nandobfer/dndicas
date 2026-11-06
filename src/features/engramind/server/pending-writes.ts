import { Schema, model, models, type Model } from "mongoose"

/**
 * Fila temporária de gravações das memórias das campanhas (`engramind_pending_writes`). NÃO é fonte: só
 * guarda a gravação que o Engramind não aceitou por estar fora do ar (ou com o token recusado) até o cron
 * entregá-la — e apaga a entrada assim que ela chega. Nada no jogo lê esta fila (nem o Diário, nem a busca,
 * nem o prompt). Uma entrada por campanha + chave: a gravação mais nova substitui a pendente.
 */
export interface IPendingWrite {
    _id: string
    campaignId: string
    key: string
    channel: string
    /** Corpo de `create_memory` (com `key` e `upsert`). */
    body: Record<string, unknown>
    attempts: number
    lastError: string | null
    /** Recusa definitiva (validação): fica visível na aba Sincronização até ser descartada. */
    failed: boolean
    createdAt: Date
    updatedAt: Date
}

const schema = new Schema<IPendingWrite>(
    {
        _id: { type: String, required: true },
        campaignId: { type: String, required: true },
        key: { type: String, required: true },
        channel: { type: String, required: true },
        body: { type: Schema.Types.Mixed, required: true },
        attempts: { type: Number, default: 0 },
        lastError: { type: String, default: null },
        failed: { type: Boolean, default: false },
    },
    { collection: "engramind_pending_writes", timestamps: true, versionKey: false, minimize: false },
)
schema.index({ failed: 1, createdAt: 1 })

export const PendingWrite: Model<IPendingWrite> = (models.EngramindPendingWrite as Model<IPendingWrite>) ?? model<IPendingWrite>("EngramindPendingWrite", schema)

export const pendingWriteId = (campaignId: string, key: string) => `${campaignId}:${key}`
