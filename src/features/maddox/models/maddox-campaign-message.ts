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
    type MaddoxReminderStatus,
    type MaddoxTurnPhase,
} from "../constants"
import type { CombatPrepChange, IMaddoxCombatAction, IMaddoxCombatReaction, IMaddoxCombatRoll } from "../combat-types"

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

export interface IMaddoxReminder {
    status: MaddoxReminderStatus
    jobId: string | null
    claimedAt: Date | null
    resolvedAt: Date | null
    memoryKind: string | null
    memoryTitle: string | null
    visibility: "players" | "master" | null
}

/** Sugestões de ação de um personagem numa narração (DND-30). */
export interface IMaddoxActionOptions {
    memberId: Types.ObjectId
    characterId: Types.ObjectId
    characterName: string
    options: string[]
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
    /** Card de início ou fim de combate (`kind: "combat"`, Maddox 6). */
    combat: { event: "start" | "end" | "order"; combatId: Types.ObjectId } | null
    /** Combate tático (Maddox 7): ação de um combatente, rolagem avulsa e janela de reação. */
    combatAction: IMaddoxCombatAction | null
    combatRoll: IMaddoxCombatRoll | null
    combatReaction: IMaddoxCombatReaction | null
    /** "Não fez nada" registrado porque o jogador estava offline na própria vez (combate tático). */
    offlineSkip: boolean
    /** Declaração que é o resumo da vez no combate tático ("Encerrar turno", DND-36): nunca fica oculta para os outros. */
    combatTurn: boolean
    /**
     * Lembrança injetada (`kind: "reminder"`, DND-25): `jobId` = geração do Maddox que a considerou (reivindicada no começo
     * da narração; volta a `null` se a geração falhar); `status` muda depois de a narração ser gravada.
     */
    reminder: IMaddoxReminder | null
    /**
     * Sugestões de ação pedidas pelo Maddox na narração (`suggest_actions`, DND-30), por personagem. Cada jogador só recebe
     * a lista do próprio personagem.
     */
    actionOptions: IMaddoxActionOptions[] | null
    /**
     * Card privado "Sua mesa está pronta" (`kind: "combat-prep"`, DND-41): só o dono do personagem (`memberId`) o recebe.
     * `content` fica vazio (fora da transcrição do narrador e do Diário).
     */
    combatPrep: { combatId: Types.ObjectId; actorKey: string; characterName: string; changes: CombatPrepChange[] } | null
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
        combat: {
            type: new Schema({ event: { type: String, enum: ["start", "end", "order"], required: true }, combatId: { type: Schema.Types.ObjectId, ref: "MaddoxCombat", required: true } }, { _id: false }),
            default: null,
        },
        combatAction: { type: Schema.Types.Mixed, default: null },
        combatRoll: { type: Schema.Types.Mixed, default: null },
        combatReaction: { type: Schema.Types.Mixed, default: null },
        offlineSkip: { type: Boolean, default: false },
        combatTurn: { type: Boolean, default: false },
        reminder: { type: Schema.Types.Mixed, default: null },
        combatPrep: { type: Schema.Types.Mixed, default: null },
        actionOptions: {
            type: [
                new Schema<IMaddoxActionOptions>(
                    {
                        memberId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaignMember", required: true },
                        characterId: { type: Schema.Types.ObjectId, ref: "MaddoxCharacter", required: true },
                        characterName: { type: String, required: true },
                        options: { type: [String], default: () => [] },
                    },
                    { _id: false },
                ),
            ],
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

// Combate tático (Maddox 7): uma janela de reação pendente por personagem; a lista das pendências da espera.
MaddoxCampaignMessageSchema.index({ campaignId: 1, memberId: 1 }, { unique: true, partialFilterExpression: { kind: "combat-reaction", "combatReaction.status": "pending" }, name: "combat_reaction_pending_unique" })
MaddoxCampaignMessageSchema.index({ campaignId: 1, turnNumber: 1, kind: 1 })

export const MaddoxCampaignMessageModel: Model<IMaddoxCampaignMessage> =
    (mongoose.models.MaddoxCampaignMessage as Model<IMaddoxCampaignMessage>) || mongoose.model<IMaddoxCampaignMessage>("MaddoxCampaignMessage", MaddoxCampaignMessageSchema)
