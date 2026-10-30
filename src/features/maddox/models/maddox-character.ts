import mongoose, { Schema, type Model, type Types } from "mongoose"
import { MADDOX_CHARACTER_STATUSES, MADDOX_INTERVIEW_STATUSES, type MaddoxCharacterStatus, type MaddoxInterviewStatus } from "../constants"

/**
 * Personagem jogável de uma campanha — `maddox_characters`. O perfil é narrativo (seções em Markdown,
 * como o `protagonista.md` do roleplay); no modo fiel ao D&D aponta para a ficha (`CharacterSheet`).
 */
export interface IMaddoxCharacter {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    memberId: Types.ObjectId
    userId: string
    name: string
    portraitUrl: string | null
    /** Seções narrativas (identidade, origem, personalidade, capacidades, equipamentos, relações, condição…). */
    profile: Record<string, string>
    sheetId: Types.ObjectId | null
    interview: { status: MaddoxInterviewStatus; scriptVersion: number | null }
    status: MaddoxCharacterStatus
    createdAt: Date
    updatedAt: Date
}

const MaddoxCharacterSchema = new Schema<IMaddoxCharacter>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        memberId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaignMember", required: true },
        userId: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        portraitUrl: { type: String, default: null },
        profile: { type: Map, of: String, default: {} },
        sheetId: { type: Schema.Types.ObjectId, ref: "CharacterSheet", default: null },
        interview: {
            status: { type: String, enum: MADDOX_INTERVIEW_STATUSES, default: "pending" },
            scriptVersion: { type: Number, default: null },
        },
        status: { type: String, enum: MADDOX_CHARACTER_STATUSES, default: "active" },
    },
    { collection: "maddox_characters", timestamps: true, versionKey: false },
)

MaddoxCharacterSchema.index({ campaignId: 1, status: 1 })
MaddoxCharacterSchema.index({ userId: 1 })

export const MaddoxCharacterModel: Model<IMaddoxCharacter> = (mongoose.models.MaddoxCharacter as Model<IMaddoxCharacter>) || mongoose.model<IMaddoxCharacter>("MaddoxCharacter", MaddoxCharacterSchema)
