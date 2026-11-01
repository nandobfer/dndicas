import mongoose, { Schema, type Model, type Types } from "mongoose"
import {
    MADDOX_COMBAT_IMAGE_STATUSES,
    MADDOX_COMBAT_OUTCOMES,
    MADDOX_COMBAT_REWARD_KINDS,
    MADDOX_COMBAT_STATUSES,
    MADDOX_COMBATANT_OUTCOMES,
    MADDOX_COMBATANT_SIDES,
    type MaddoxCoinKey,
    type MaddoxCombatImageStatus,
    type MaddoxCombatOutcome,
    type MaddoxCombatRewardKind,
    type MaddoxCombatStatus,
    type MaddoxCombatantOutcome,
    type MaddoxCombatantSide,
} from "../constants"

/** Adversário ou aliado do combate (os personagens dos jogadores não entram aqui). */
export interface IMaddoxCombatant {
    name: string
    nameKey: string
    side: MaddoxCombatantSide
    quantity: number
    description: string
    /** Condição atual na luta ("ferido no ombro", "recuando"). */
    condition: string
    /** NPC ligado (nome próprio já registrado ou `registrarNpc`). */
    npcId: Types.ObjectId | null
    outcome: MaddoxCombatantOutcome | null
}

/** Recompensa do combate. No Equilibrado, moedas e itens entram na ficha do personagem (`applied`). */
export interface IMaddoxCombatReward {
    kind: MaddoxCombatRewardKind
    description: string
    characterId: Types.ObjectId | null
    characterName: string | null
    coins: Partial<Record<MaddoxCoinKey, number>> | null
    item: { catalogItemId: Types.ObjectId | null; name: string; quantity: number } | null
    /** Aplicada na ficha (troca condicional: uma retomada nunca aplica duas vezes). */
    applied: boolean
    sheetId: Types.ObjectId | null
    /** Aviso público (ex.: item fora do catálogo gravado como item próprio). */
    warning: string | null
}

/**
 * Combate narrativo (Maddox 6) — `maddox_combats`. Um documento por encontro; no máximo um `active` por campanha (índice
 * único parcial). Aberto e encerrado pelas ferramentas do narrador (`start_combat`/`end_combat`), aplicadas depois que a
 * narração é gerada. `masterNotes` e `finalScene` nunca chegam aos jogadores.
 */
export interface IMaddoxCombat {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    status: MaddoxCombatStatus
    title: string
    location: string
    startedTurn: number
    endedTurn: number | null
    /** Narrações do turno do mestre feitas com o combate ativo. */
    masterTurns: number
    combatants: IMaddoxCombatant[]
    outcome: MaddoxCombatOutcome | null
    summary: string
    masterNotes: string
    rewards: IMaddoxCombatReward[]
    characterOutcomes: { characterId: Types.ObjectId; characterName: string; condition: string }[]
    /** Descrição visual da cena final (para a imagem de fim de batalha do Maddox 10). */
    finalScene: string
    image: { status: MaddoxCombatImageStatus; requestedAt: Date | null } | null
    /** Efeitos do fim (NPCs, personagens, memória, recompensas, imagem) já disparados — rodam depois de gravar os cards. */
    effectsApplied: boolean
    endedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const CombatantSchema = new Schema<IMaddoxCombatant>(
    {
        name: { type: String, required: true },
        nameKey: { type: String, required: true },
        side: { type: String, enum: MADDOX_COMBATANT_SIDES, default: "inimigo" },
        quantity: { type: Number, default: 1, min: 1 },
        description: { type: String, default: "" },
        condition: { type: String, default: "" },
        npcId: { type: Schema.Types.ObjectId, ref: "MaddoxNpc", default: null },
        outcome: { type: String, enum: [...MADDOX_COMBATANT_OUTCOMES, null], default: null },
    },
    { _id: false },
)

const RewardSchema = new Schema<IMaddoxCombatReward>(
    {
        kind: { type: String, enum: MADDOX_COMBAT_REWARD_KINDS, required: true },
        description: { type: String, default: "" },
        characterId: { type: Schema.Types.ObjectId, ref: "MaddoxCharacter", default: null },
        characterName: { type: String, default: null },
        coins: { type: Schema.Types.Mixed, default: null },
        item: { type: new Schema({ catalogItemId: { type: Schema.Types.ObjectId, default: null }, name: String, quantity: Number }, { _id: false }), default: null },
        applied: { type: Boolean, default: false },
        sheetId: { type: Schema.Types.ObjectId, default: null },
        warning: { type: String, default: null },
    },
    { _id: false },
)

const MaddoxCombatSchema = new Schema<IMaddoxCombat>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        status: { type: String, enum: MADDOX_COMBAT_STATUSES, default: "active" },
        title: { type: String, required: true, trim: true },
        location: { type: String, default: "" },
        startedTurn: { type: Number, required: true },
        endedTurn: { type: Number, default: null },
        masterTurns: { type: Number, default: 0 },
        combatants: { type: [CombatantSchema], default: [] },
        outcome: { type: String, enum: [...MADDOX_COMBAT_OUTCOMES, null], default: null },
        summary: { type: String, default: "" },
        masterNotes: { type: String, default: "" },
        rewards: { type: [RewardSchema], default: [] },
        characterOutcomes: {
            type: [new Schema({ characterId: { type: Schema.Types.ObjectId, required: true }, characterName: String, condition: String }, { _id: false })],
            default: [],
        },
        finalScene: { type: String, default: "" },
        image: { type: new Schema({ status: { type: String, enum: MADDOX_COMBAT_IMAGE_STATUSES }, requestedAt: Date }, { _id: false }), default: null },
        effectsApplied: { type: Boolean, default: false },
        endedAt: { type: Date, default: null },
    },
    { collection: "maddox_combats", timestamps: true, versionKey: false },
)

// No máximo um combate ativo por campanha: dois `start_combat` concorrentes abrem um só.
MaddoxCombatSchema.index({ campaignId: 1 }, { unique: true, partialFilterExpression: { status: "active" }, name: "campaignId_active_unique" })
MaddoxCombatSchema.index({ campaignId: 1, startedTurn: -1 })

export const MaddoxCombatModel: Model<IMaddoxCombat> = (mongoose.models.MaddoxCombat as Model<IMaddoxCombat>) || mongoose.model<IMaddoxCombat>("MaddoxCombat", MaddoxCombatSchema)
