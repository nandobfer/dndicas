import mongoose, { Schema, type Model, type Types } from "mongoose"
import { MADDOX_CAMPAIGN_MEMORY_KINDS, MADDOX_VISIBILITIES, type MaddoxCampaignMemoryKind, type MaddoxVisibility } from "../constants"

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
    text: string
    visibility: MaddoxVisibility
    tags: string[]
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
        text: { type: String, required: true },
        visibility: { type: String, enum: MADDOX_VISIBILITIES, default: "players" },
        tags: { type: [String], default: [] },
        origin: { type: String, enum: ["agent", "user"], default: "agent" },
        createdBy: { type: String, required: true },
    },
    { collection: "maddox_campaign_memories", timestamps: true, versionKey: false },
)

MaddoxCampaignMemorySchema.index({ campaignId: 1, kind: 1, createdAt: -1 })
// Busca por texto da campanha (Maddox 9).
MaddoxCampaignMemorySchema.index({ title: "text", text: "text", tags: "text" }, { default_language: "portuguese" })

export const MaddoxCampaignMemoryModel: Model<IMaddoxCampaignMemory> =
    (mongoose.models.MaddoxCampaignMemory as Model<IMaddoxCampaignMemory>) || mongoose.model<IMaddoxCampaignMemory>("MaddoxCampaignMemory", MaddoxCampaignMemorySchema)
