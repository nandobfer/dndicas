import mongoose, { Schema, type Model, type Types } from "mongoose"
import { MADDOX_CAMPAIGN_STATUSES, MADDOX_RIGOR_LEVELS, MADDOX_TURN_PHASES, type MaddoxCampaignStatus, type MaddoxRigorLevel, type MaddoxTurnPhase } from "../constants"

/**
 * Campanha Maddox — `maddox_campaigns`. Nasce no lobby (Maddox 1), passa pela entrevista de cenário
 * (Maddox 2) e segue em turnos do mestre e dos jogadores (Maddox 3+).
 */
export interface IMaddoxCampaign {
    _id: Types.ObjectId
    name: string
    ownerId: string
    rigor: MaddoxRigorLevel
    status: MaddoxCampaignStatus
    coverUrl: string | null
    /** Cenário consolidado ao fim da entrevista de cenário (Markdown). */
    setting: string
    /** Versões dos roteiros com que as entrevistas desta campanha começaram. */
    scriptVersions: { scenario: number | null; character: number | null }
    turn: { number: number; phase: MaddoxTurnPhase }
    /** Link de convite (Maddox 1). `select: false`: só o dono o recebe; gerar outro invalida o anterior. */
    invite: { token: string | null; rotatedAt: Date | null }
    createdAt: Date
    updatedAt: Date
}

const MaddoxCampaignSchema = new Schema<IMaddoxCampaign>(
    {
        name: { type: String, required: true, trim: true },
        ownerId: { type: String, required: true },
        rigor: { type: String, enum: MADDOX_RIGOR_LEVELS, required: true },
        status: { type: String, enum: MADDOX_CAMPAIGN_STATUSES, default: "lobby" },
        coverUrl: { type: String, default: null },
        setting: { type: String, default: "" },
        scriptVersions: {
            scenario: { type: Number, default: null },
            character: { type: Number, default: null },
        },
        turn: {
            number: { type: Number, default: 0 },
            phase: { type: String, enum: MADDOX_TURN_PHASES, default: "master" },
        },
        invite: {
            token: { type: String, default: null, select: false },
            rotatedAt: { type: Date, default: null },
        },
    },
    { collection: "maddox_campaigns", timestamps: true, versionKey: false },
)

MaddoxCampaignSchema.index({ ownerId: 1, updatedAt: -1 })
MaddoxCampaignSchema.index({ status: 1 })
MaddoxCampaignSchema.index({ "invite.token": 1 }, { unique: true, partialFilterExpression: { "invite.token": { $type: "string" } } })

export const MaddoxCampaignModel: Model<IMaddoxCampaign> = (mongoose.models.MaddoxCampaign as Model<IMaddoxCampaign>) || mongoose.model<IMaddoxCampaign>("MaddoxCampaign", MaddoxCampaignSchema)
