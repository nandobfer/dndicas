import mongoose, { Schema, type Model, type Types } from "mongoose"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import { MADDOX_INTERVIEW_RUN_STATUSES, MADDOX_SCRIPT_KINDS, type MaddoxAbilityMethod, type MaddoxInterviewRunStatus, type MaddoxScriptKind } from "../constants"

/**
 * Entrevista do Maddox (Maddox 2) — `maddox_interviews`. Uma de cenário por campanha (com o dono) e uma
 * de personagem por membro. Guarda a conversa inteira (as respostas), a versão do roteiro com que
 * começou e o resultado consolidado ao concluir.
 */
export type MaddoxAbilityScores = Record<AttributeType, number>

/** Bônus do antecedente aplicado pelo Maddox (`parts`: +1/+2 por atributo, soma 3). */
export interface IMaddoxAbilityBonus {
    background: string
    parts: Partial<Record<AttributeType, number>>
}

/**
 * Card de atributos (Maddox 5) aberto pelo Maddox numa fala da entrevista. `pending` = aguardando o jogador;
 * `submitted` = enviado (travado); `superseded` = o Maddox reabriu num card mais novo. O valor final é sempre
 * derivado (`base` + `bonus`), nunca gravado.
 */
export interface IMaddoxAbilityScoresCard {
    status: "pending" | "submitted" | "superseded"
    method: MaddoxAbilityMethod | null
    base: MaddoxAbilityScores | null
    /** Valores do último envio quando o Maddox reabre o card. */
    prefill: { method: MaddoxAbilityMethod; base: MaddoxAbilityScores } | null
    bonus: IMaddoxAbilityBonus | null
    reason: string | null
    submittedAt: Date | null
}

/** Rolagens do método de rolagem (pertencem à entrevista: reabrir o card mantém os mesmos dados). */
export interface IMaddoxAbilityRolls {
    rolls: { dice: number[]; score: number; rollId: string }[]
    sixth: number | null
    /** A sexta pontuação ficou fora de 3–18: só "Reiniciar" continua. */
    invalid: boolean
}

export interface IMaddoxInterviewMessage {
    id: string
    role: "maddox" | "user"
    content: string
    /** Mensagem do Maddox com a síntese final, aguardando "Confirmar e concluir". */
    proposal: boolean
    /** Falha do provedor ao gerar esta resposta ("Tentar de novo"). */
    error: string | null
    /** Fala do sistema (ex.: atributos enviados): vai ao modelo, nunca à tela. */
    internal?: boolean
    abilityScores?: IMaddoxAbilityScoresCard | null
    createdAt: Date
}

export interface IMaddoxInterview {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    kind: MaddoxScriptKind
    /** Membro entrevistado (personagem); `null` no cenário. */
    memberId: Types.ObjectId | null
    userId: string
    characterId: Types.ObjectId | null
    scriptVersion: number
    status: MaddoxInterviewRunStatus
    messages: IMaddoxInterviewMessage[]
    /** Trava de uma geração por vez (`token` de quem gera). */
    generating: { token: string; startedAt: Date } | null
    /** JSON consolidado gravado ao concluir (cenário ou perfil/ficha). */
    result: unknown
    abilityRolls?: IMaddoxAbilityRolls | null
    completedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const MessageSchema = new Schema<IMaddoxInterviewMessage>(
    {
        id: { type: String, required: true },
        role: { type: String, enum: ["maddox", "user"], required: true },
        content: { type: String, default: "" },
        proposal: { type: Boolean, default: false },
        error: { type: String, default: null },
        internal: { type: Boolean, default: undefined },
        abilityScores: { type: Schema.Types.Mixed, default: undefined },
        createdAt: { type: Date, default: () => new Date() },
    },
    { _id: false },
)

const MaddoxInterviewSchema = new Schema<IMaddoxInterview>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        kind: { type: String, enum: MADDOX_SCRIPT_KINDS, required: true },
        memberId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaignMember", default: null },
        userId: { type: String, required: true },
        characterId: { type: Schema.Types.ObjectId, ref: "MaddoxCharacter", default: null },
        scriptVersion: { type: Number, required: true },
        status: { type: String, enum: MADDOX_INTERVIEW_RUN_STATUSES, default: "in-progress" },
        messages: { type: [MessageSchema], default: [] },
        generating: { type: new Schema({ token: String, startedAt: Date }, { _id: false }), default: null },
        result: { type: Schema.Types.Mixed, default: null },
        abilityRolls: { type: Schema.Types.Mixed, default: null },
        completedAt: { type: Date, default: null },
    },
    { collection: "maddox_interviews", timestamps: true, versionKey: false },
)

// Uma entrevista de cenário por campanha (memberId null) e uma de personagem por membro.
MaddoxInterviewSchema.index({ campaignId: 1, kind: 1, memberId: 1 }, { unique: true })

export const MaddoxInterviewModel: Model<IMaddoxInterview> = (mongoose.models.MaddoxInterview as Model<IMaddoxInterview>) || mongoose.model<IMaddoxInterview>("MaddoxInterview", MaddoxInterviewSchema)
