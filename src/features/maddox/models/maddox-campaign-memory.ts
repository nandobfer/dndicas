import mongoose, { Schema, type Model, type Types } from "mongoose"
import { MADDOX_CAMPAIGN_MEMORY_KINDS, MADDOX_QUEST_STATUSES, MADDOX_VISIBILITIES, type MaddoxCampaignMemoryKind, type MaddoxQuestStatus, type MaddoxVisibility } from "../constants"

/**
 * Memória de uma campanha (fatos, eventos, locais, missões, relações) — `maddox_campaign_memories`.
 * Diferente das memórias de administrador do agente (`agent_memories`, lista `maddox`): estas são da
 * história de uma campanha e, quando `visibility = players`, os jogadores podem consultá-las e buscá-las.
 */
export interface IMaddoxCampaignMemory {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    kind: MaddoxCampaignMemoryKind
    title: string
    /** Título normalizado (sem acento e sem caixa) para a gravação por título. */
    titleKey: string
    text: string
    visibility: MaddoxVisibility
    tags: string[]
    /** Só no tipo `missao` (Maddox 4): ativa, concluída, falhou ou abandonada. */
    status: MaddoxQuestStatus | null
    /** Turno em que o Maddox gravou ou atualizou por último (Maddox 4). */
    turnNumber: number | null
    /** Marco de um combate (Maddox 6): uma memória por combate, mesmo com títulos repetidos. */
    combatId?: Types.ObjectId | null
    origin: "agent" | "user"
    createdBy: string
    createdAt: Date
    updatedAt: Date
}

const MaddoxCampaignMemorySchema = new Schema<IMaddoxCampaignMemory>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        kind: { type: String, enum: MADDOX_CAMPAIGN_MEMORY_KINDS, default: "fato" },
        title: { type: String, required: true, trim: true },
        titleKey: { type: String, default: "" },
        text: { type: String, required: true },
        visibility: { type: String, enum: MADDOX_VISIBILITIES, default: "players" },
        tags: { type: [String], default: [] },
        status: { type: String, enum: MADDOX_QUEST_STATUSES, default: null },
        turnNumber: { type: Number, default: null },
        combatId: { type: Schema.Types.ObjectId, ref: "MaddoxCombat", default: null },
        origin: { type: String, enum: ["agent", "user"], default: "agent" },
        createdBy: { type: String, required: true },
    },
    { collection: "maddox_campaign_memories", timestamps: true, versionKey: false },
)

MaddoxCampaignMemorySchema.index({ campaignId: 1, kind: 1, createdAt: -1 })
// Gravação por tipo + título (as ferramentas do narrador atualizam em vez de duplicar).
MaddoxCampaignMemorySchema.index({ campaignId: 1, kind: 1, titleKey: 1 })
// Diário da campanha (Maddox 9): memórias públicas por tipo, da mais recente (cursor `_id`).
MaddoxCampaignMemorySchema.index({ campaignId: 1, visibility: 1, kind: 1, _id: -1 })
// Índice de texto legado; a busca do Diário (Maddox 9) usa regex sem acento filtrado pela campanha.
MaddoxCampaignMemorySchema.index({ title: "text", text: "text", tags: "text" }, { default_language: "portuguese" })

export const MaddoxCampaignMemoryModel: Model<IMaddoxCampaignMemory> =
    (mongoose.models.MaddoxCampaignMemory as Model<IMaddoxCampaignMemory>) || mongoose.model<IMaddoxCampaignMemory>("MaddoxCampaignMemory", MaddoxCampaignMemorySchema)
