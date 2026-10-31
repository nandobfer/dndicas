import mongoose, { Schema, type Model, type Types } from "mongoose"
import type { CalcPart } from "@/features/character-sheets/utils/dnd-calculations"
import type { AttributeType, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import {
    MADDOX_CHECK_KINDS,
    MADDOX_CHECK_MODES,
    MADDOX_CHECK_STATUSES,
    MADDOX_GAME_MESSAGE_KINDS,
    MADDOX_TURN_PHASES,
    type MaddoxCheckKind,
    type MaddoxCheckMode,
    type MaddoxCheckStatus,
    type MaddoxGameMessageKind,
    type MaddoxTurnPhase,
} from "../constants"

/**
 * Teste pedido pelo Maddox (Maddox 5) para o personagem da mensagem (`memberId`/`characterId`). A CD é sempre gravada
 * (o Maddox a recebe na continuação); a tela só a mostra se a campanha a deixar visível.
 */
export interface IMaddoxCheck {
    round: number
    status: MaddoxCheckStatus
    kind: MaddoxCheckKind
    ability: AttributeType
    skill: SkillName | null
    dc: number
    mode: MaddoxCheckMode
    /** Motivo público, curto ("Esgueirar-se entre os guardas"). */
    reason: string
    sheetId: Types.ObjectId | null
    /** Resultado oficial do motor de dados (`rollGeneralDice`). */
    roll: DiceRollResponse | null
    /** Partes do modificador usado na rolagem (calculado da ficha no servidor). */
    modifierParts: CalcPart[]
    /** Quem rolou (o jogador ou o dono, no lugar dele). */
    rolledBy: string | null
    rolledAt: Date | null
    /** Motivo do cancelamento (o jogador saiu da campanha). */
    cancelReason: string | null
}

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
    /** Resposta do mestre que falhou (Maddox 4): o texto de aviso vai em `error`, `content` fica vazio. */
    error: string | null
    /** Narração: rodada de testes do turno do mestre (0 = narração das declarações; Maddox 5). */
    segment: number
    /** Teste pedido pelo Maddox (`kind: "check"`). */
    check: IMaddoxCheck | null
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
        error: { type: String, default: null },
        segment: { type: Number, default: 0 },
        check: {
            type: new Schema<IMaddoxCheck>(
                {
                    round: { type: Number, required: true },
                    status: { type: String, enum: MADDOX_CHECK_STATUSES, default: "pending" },
                    kind: { type: String, enum: MADDOX_CHECK_KINDS, required: true },
                    ability: { type: String, required: true },
                    skill: { type: String, default: null },
                    dc: { type: Number, required: true },
                    mode: { type: String, enum: MADDOX_CHECK_MODES, default: "normal" },
                    reason: { type: String, default: "" },
                    sheetId: { type: Schema.Types.ObjectId, ref: "CharacterSheet", default: null },
                    roll: { type: Schema.Types.Mixed, default: null },
                    modifierParts: { type: Schema.Types.Mixed, default: () => [] },
                    rolledBy: { type: String, default: null },
                    rolledAt: { type: Date, default: null },
                    cancelReason: { type: String, default: null },
                },
                { _id: false },
            ),
            default: null,
        },
    },
    { collection: "maddox_campaign_messages", timestamps: true, versionKey: false },
)

// Paginação da mesa (mais recentes primeiro, `_id` como cursor).
MaddoxCampaignMessageSchema.index({ campaignId: 1, _id: -1 })
// Uma declaração (ou "não fazer nada") por membro em cada turno: resolve envios simultâneos.
MaddoxCampaignMessageSchema.index({ campaignId: 1, turnNumber: 1, memberId: 1 }, { unique: true, partialFilterExpression: { turnAction: true } })

// Um teste por personagem em cada rodada do turno do mestre (Maddox 5).
MaddoxCampaignMessageSchema.index({ campaignId: 1, turnNumber: 1, "check.round": 1, memberId: 1 }, { unique: true, partialFilterExpression: { kind: "check" } })

export const MaddoxCampaignMessageModel: Model<IMaddoxCampaignMessage> =
    (mongoose.models.MaddoxCampaignMessage as Model<IMaddoxCampaignMessage>) || mongoose.model<IMaddoxCampaignMessage>("MaddoxCampaignMessage", MaddoxCampaignMessageSchema)
