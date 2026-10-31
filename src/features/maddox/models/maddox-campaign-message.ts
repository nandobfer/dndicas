import mongoose, { Schema, type Model, type Types } from "mongoose"
import { MADDOX_GAME_MESSAGE_KINDS, MADDOX_TURN_PHASES, type MaddoxGameMessageKind, type MaddoxTurnPhase } from "../constants"

/**
 * Mensagem da mesa (Maddox 3) — `maddox_campaign_messages`. Um documento por mensagem (o histórico cresce
 * sem limite). Declaração e "não fazer nada" (`turnAction: true`) são únicas por membro e turno.
 */
export interface IMaddoxCampaignMessage {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    turnNumber: number
    phase: MaddoxTurnPhase
    kind: MaddoxGameMessageKind
    /** Autor jogador (`null` nas falas do Maddox). */
    memberId: Types.ObjectId | null
    userId: string | null
    characterId: Types.ObjectId | null
    /** Nome do personagem no momento da mensagem. */
    characterName: string | null
    content: string
    /** Resposta do mestre → pergunta respondida. */
    replyToId: Types.ObjectId | null
    /** Dono que registrou o "não fez nada" no lugar do jogador ("Pular jogador"). */
    skippedBy: string | null
    /** Declaração ou "não fazer nada": conta para fechar o turno (única por membro e turno). */
    turnAction: boolean
    createdAt: Date
    updatedAt: Date
}

const MaddoxCampaignMessageSchema = new Schema<IMaddoxCampaignMessage>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        turnNumber: { type: Number, required: true },
        phase: { type: String, enum: MADDOX_TURN_PHASES, required: true },
        kind: { type: String, enum: MADDOX_GAME_MESSAGE_KINDS, required: true },
        memberId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaignMember", default: null },
        userId: { type: String, default: null },
        characterId: { type: Schema.Types.ObjectId, ref: "MaddoxCharacter", default: null },
        characterName: { type: String, default: null },
        content: { type: String, default: "" },
        replyToId: { type: Schema.Types.ObjectId, default: null },
        skippedBy: { type: String, default: null },
        turnAction: { type: Boolean, default: false },
    },
    { collection: "maddox_campaign_messages", timestamps: true, versionKey: false },
)

// Paginação da mesa (mais recentes primeiro, `_id` como cursor).
MaddoxCampaignMessageSchema.index({ campaignId: 1, _id: -1 })
// Uma declaração (ou "não fazer nada") por membro em cada turno: resolve envios simultâneos.
MaddoxCampaignMessageSchema.index({ campaignId: 1, turnNumber: 1, memberId: 1 }, { unique: true, partialFilterExpression: { turnAction: true } })

export const MaddoxCampaignMessageModel: Model<IMaddoxCampaignMessage> =
    (mongoose.models.MaddoxCampaignMessage as Model<IMaddoxCampaignMessage>) || mongoose.model<IMaddoxCampaignMessage>("MaddoxCampaignMessage", MaddoxCampaignMessageSchema)
