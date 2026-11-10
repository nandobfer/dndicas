import mongoose, { Schema, type Model, type Types } from "mongoose"
import type { MaddoxMemoryChannelRef } from "./maddox-campaign-snapshot"

/**
 * Exclusão de memória pendente da perda definitiva de uma volta (DND-44) — `maddox_memory_repairs`.
 *
 * Quando o Maddox narra de novo depois de voltar a um turno, as memórias criadas no trecho descartado são excluídas do
 * Engramind. Se a rede falhar, a narração não para: a exclusão fica aqui e a rotina de sincronização das memórias
 * (`syncCampaignMemories`, a cada 15 min) tenta de novo. Uma entrada por memória.
 */
export interface IMaddoxMemoryRepair {
    _id: string
    campaignId: Types.ObjectId
    memoryId: string
    ref: MaddoxMemoryChannelRef
    /** Token cifrado do NPC Opex que deixou de existir na mesa (sem ele, o canal do NPC não é alcançável). */
    tokenBox: unknown
    /** Trecho descartado: só a memória nascida depois de `after` e até `upTo` é excluída. */
    window: { after: Date; upTo: Date }
    attempts: number
    lastError: string | null
    createdAt: Date
    updatedAt: Date
}

const RepairSchema = new Schema<IMaddoxMemoryRepair>(
    {
        _id: { type: String, required: true },
        campaignId: { type: Schema.Types.ObjectId, required: true, index: true },
        memoryId: { type: String, required: true },
        ref: { type: Schema.Types.Mixed, required: true },
        tokenBox: { type: Schema.Types.Mixed, default: null },
        window: { after: { type: Date, required: true }, upTo: { type: Date, required: true } },
        attempts: { type: Number, default: 0 },
        lastError: { type: String, default: null },
    },
    { collection: "maddox_memory_repairs", timestamps: true, versionKey: false, minimize: false },
)

export const MaddoxMemoryRepairModel: Model<IMaddoxMemoryRepair> =
    (mongoose.models.MaddoxMemoryRepair as Model<IMaddoxMemoryRepair>) || mongoose.model<IMaddoxMemoryRepair>("MaddoxMemoryRepair", RepairSchema)
