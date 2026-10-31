import mongoose, { Schema, type Model, type Types } from "mongoose"
import { MADDOX_NPC_STATUSES, MADDOX_VISIBILITIES, type MaddoxNpcStatus, type MaddoxVisibility } from "../constants"

/** NPC de uma campanha — `maddox_npcs`. `masterNotes` é conhecimento exclusivo do Maddox. */
export interface IMaddoxNpc {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    name: string
    /** Nome normalizado (sem acento e sem caixa) para a gravação pelo nome (Maddox 4). */
    nameKey: string
    portraitUrl: string | null
    publicDescription: string
    masterNotes: string
    visibility: MaddoxVisibility
    status: MaddoxNpcStatus
    createdAt: Date
    updatedAt: Date
}

const MaddoxNpcSchema = new Schema<IMaddoxNpc>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        name: { type: String, required: true, trim: true },
        nameKey: { type: String, default: "" },
        portraitUrl: { type: String, default: null },
        publicDescription: { type: String, default: "" },
        masterNotes: { type: String, default: "" },
        visibility: { type: String, enum: MADDOX_VISIBILITIES, default: "players" },
        status: { type: String, enum: MADDOX_NPC_STATUSES, default: "active" },
    },
    { collection: "maddox_npcs", timestamps: true, versionKey: false },
)

MaddoxNpcSchema.index({ campaignId: 1, name: 1 })
MaddoxNpcSchema.index({ campaignId: 1, nameKey: 1 })

export const MaddoxNpcModel: Model<IMaddoxNpc> = (mongoose.models.MaddoxNpc as Model<IMaddoxNpc>) || mongoose.model<IMaddoxNpc>("MaddoxNpc", MaddoxNpcSchema)
