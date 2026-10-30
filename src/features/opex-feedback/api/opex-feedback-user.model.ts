import { Schema, model, models, type Model } from "mongoose"

export interface OpexFeedbackUser {
    dndicasUserId: string
    opexOrigin: string
    opexClientId: string
    opexUserId: string
    username: string
    email: string | null
}
const schema = new Schema<OpexFeedbackUser>({
    dndicasUserId: { type: String, required: true },
    opexOrigin: { type: String, required: true },
    opexClientId: { type: String, required: true },
    opexUserId: { type: String, required: true },
    username: { type: String, required: true },
    email: { type: String, default: null },
}, { collection: "opex_feedback_users", timestamps: true })
schema.index({ dndicasUserId: 1, opexOrigin: 1, opexClientId: 1 }, { unique: true })
schema.index({ opexOrigin: 1, opexClientId: 1, opexUserId: 1 }, { unique: true })
export const OpexFeedbackUserModel = (models.OpexFeedbackUser as Model<OpexFeedbackUser>) || model<OpexFeedbackUser>("OpexFeedbackUser", schema)
