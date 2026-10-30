import mongoose, { Schema, type Model, type Types } from "mongoose"
import { MADDOX_MEMBER_ROLES, MADDOX_MEMBER_STATUSES, type MaddoxMemberRole, type MaddoxMemberStatus } from "../constants"

/** Membro de uma campanha (dono ou jogador convidado) — `maddox_campaign_members`. */
export interface IMaddoxCampaignMember {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    userId: string
    role: MaddoxMemberRole
    status: MaddoxMemberStatus
    invitedBy: string | null
    joinedAt: Date | null
    characterId: Types.ObjectId | null
    createdAt: Date
    updatedAt: Date
}

const MaddoxCampaignMemberSchema = new Schema<IMaddoxCampaignMember>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        userId: { type: String, required: true },
        role: { type: String, enum: MADDOX_MEMBER_ROLES, default: "player" },
        status: { type: String, enum: MADDOX_MEMBER_STATUSES, default: "invited" },
        invitedBy: { type: String, default: null },
        joinedAt: { type: Date, default: null },
        characterId: { type: Schema.Types.ObjectId, ref: "MaddoxCharacter", default: null },
    },
    { collection: "maddox_campaign_members", timestamps: true, versionKey: false },
)

MaddoxCampaignMemberSchema.index({ campaignId: 1, userId: 1 }, { unique: true })
// Lista "campanhas em que sou dono ou participante".
MaddoxCampaignMemberSchema.index({ userId: 1, status: 1 })

export const MaddoxCampaignMemberModel: Model<IMaddoxCampaignMember> =
    (mongoose.models.MaddoxCampaignMember as Model<IMaddoxCampaignMember>) || mongoose.model<IMaddoxCampaignMember>("MaddoxCampaignMember", MaddoxCampaignMemberSchema)
