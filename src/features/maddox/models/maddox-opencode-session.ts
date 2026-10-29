import mongoose, { Schema, type Model, type Types } from "mongoose"
import { MADDOX_SESSION_PURPOSES, MADDOX_SESSION_STATUSES, type MaddoxSessionPurpose, type MaddoxSessionStatus } from "../constants"

/**
 * Sessão do OpenCode mantida pelo Maddox — `maddox_opencode_sessions`. Uma ativa por campanha e
 * finalidade (e membro, nas entrevistas de personagem). Ao liberar, fica `pending-deletion` até a
 * exclusão no OpenCode dar certo (rotina `maddox-opencode-sessions-cleanup`).
 */
export interface IMaddoxOpencodeSession {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    purpose: MaddoxSessionPurpose
    memberId: Types.ObjectId | null
    sessionId: string
    directory: string | null
    status: MaddoxSessionStatus
    lastError: string | null
    lastUsedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const MaddoxOpencodeSessionSchema = new Schema<IMaddoxOpencodeSession>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        purpose: { type: String, enum: MADDOX_SESSION_PURPOSES, required: true },
        memberId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaignMember", default: null },
        sessionId: { type: String, required: true },
        directory: { type: String, default: null },
        status: { type: String, enum: MADDOX_SESSION_STATUSES, default: "active" },
        lastError: { type: String, default: null },
        lastUsedAt: { type: Date, default: null },
    },
    { collection: "maddox_opencode_sessions", timestamps: true, versionKey: false },
)

// No máximo uma sessão ativa por campanha, finalidade e membro (chamadas concorrentes não duplicam).
MaddoxOpencodeSessionSchema.index({ campaignId: 1, purpose: 1, memberId: 1 }, { unique: true, partialFilterExpression: { status: "active" } })
MaddoxOpencodeSessionSchema.index({ status: 1, updatedAt: 1 })
MaddoxOpencodeSessionSchema.index({ sessionId: 1 }, { unique: true })

export const MaddoxOpencodeSessionModel: Model<IMaddoxOpencodeSession> =
    (mongoose.models.MaddoxOpencodeSession as Model<IMaddoxOpencodeSession>) || mongoose.model<IMaddoxOpencodeSession>("MaddoxOpencodeSession", MaddoxOpencodeSessionSchema)
