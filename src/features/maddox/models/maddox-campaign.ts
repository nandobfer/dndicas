import mongoose, { Schema, type Model, type Types } from "mongoose"
import {
    MADDOX_CAMPAIGN_STATUSES,
    MADDOX_RIGOR_LEVELS,
    MADDOX_SCENARIO_STATUSES,
    MADDOX_TURN_PHASES,
    type MaddoxCampaignStatus,
    type MaddoxRigorLevel,
    type MaddoxScenarioStatus,
    type MaddoxTurnPhase,
} from "../constants"

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
    /** Situação inicial combinada na entrevista de cenário (Markdown). */
    openingSituation: string
    /** Entrevista de cenário (Maddox 2): começar trava o rigor; concluir grava `setting`. */
    scenarioInterview: { status: MaddoxScenarioStatus; completedAt: Date | null }
    /** Versões dos roteiros com que as entrevistas desta campanha começaram. */
    scriptVersions: { scenario: number | null; character: number | null }
    /**
     * Turno (Maddox 3). `number` sobe a cada turno do mestre (1 = abertura); o turno dos jogadores é do mesmo
     * número. `eligibleMemberIds` é fixada ao abrir o turno dos jogadores (membros ativos prontos): quem fica
     * pronto depois entra no próximo. Fecha quando todos os elegíveis ONLINE declararam. `generating` é a
     * trava do turno do mestre (token de quem gera).
     */
    turn: {
        number: number
        phase: MaddoxTurnPhase
        startedAt: Date | null
        eligibleMemberIds: Types.ObjectId[]
        declaredMemberIds: Types.ObjectId[]
        generating: { token: string; startedAt: Date } | null
    }
    /** Quando o dono iniciou a campanha (Maddox 3). */
    startedAt: Date | null
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
        openingSituation: { type: String, default: "" },
        scenarioInterview: {
            status: { type: String, enum: MADDOX_SCENARIO_STATUSES, default: "pending" },
            completedAt: { type: Date, default: null },
        },
        scriptVersions: {
            scenario: { type: Number, default: null },
            character: { type: Number, default: null },
        },
        turn: {
            number: { type: Number, default: 0 },
            phase: { type: String, enum: MADDOX_TURN_PHASES, default: "master" },
            startedAt: { type: Date, default: null },
            eligibleMemberIds: { type: [Schema.Types.ObjectId], default: [] },
            declaredMemberIds: { type: [Schema.Types.ObjectId], default: [] },
            generating: { type: new Schema({ token: String, startedAt: Date }, { _id: false }), default: null },
        },
        startedAt: { type: Date, default: null },
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
