import mongoose, { Schema, type Model, type Types } from "mongoose"
import {
    MADDOX_CAMPAIGN_STATUSES,
    MADDOX_DEFAULT_DENSITY,
    MADDOX_DENSITY_LEVELS,
    MADDOX_RIGOR_LEVELS,
    MADDOX_SCENARIO_STATUSES,
    MADDOX_TURN_PHASES,
    type MaddoxCampaignStateField,
    type MaddoxCampaignStatus,
    type MaddoxDensityLevel,
    type MaddoxRigorLevel,
    type MaddoxScenarioStatus,
    type MaddoxTurnPhase,
} from "../constants"
import type { IMaddoxWorldCatalog } from "./maddox-interview"

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
        /** Última falha do turno do mestre: a retomada espera `MADDOX_MASTER_RETRY_MS` desde ela. */
        failedAt: Date | null
        /** Rodada de testes do turno do mestre (Maddox 5): 0 = narração das declarações; cada continuação soma 1. */
        checkRound: number
        /** O turno do mestre espera as rolagens dos testes pedidos na rodada atual (sem geração em andamento). */
        awaitingChecks: boolean
        /**
         * Combate tático (Maddox 7): a vez do personagem neste turno dos jogadores (só o membro dele é elegível).
         * `offlineSince` marca quando o jogador da vez foi visto offline (a vez passa depois da carência).
         */
        combatActor?: { combatId: Types.ObjectId; actorKey: string; memberId: Types.ObjectId; offlineSince: Date | null } | null
    }
    /** Mostra a CD dos testes aos jogadores (Maddox 5); padrão = secreta. */
    showCheckDc: boolean
    /** Imagens automáticas nas cenas (Maddox 10): o dono desliga na campanha; o pedido manual continua. */
    sceneImages: boolean
    /** Densidade das narrações (DND-22): o dono muda a qualquer momento; vale a partir da próxima narração. */
    density: MaddoxDensityLevel
    /** Nível inicial da mesa (graus com ficha), definido na entrevista de cenário; `null` = cada personagem informa. */
    startingLevel?: number | null
    /** Estágio de experiência inicial (graus narrativos), adaptado ao cenário. */
    startingStage?: string
    /**
     * Povos e classes do mundo (Maddox 8, Fiel ao D&D), gravados na conclusão do cenário: só entidades do catálogo.
     * Listas vazias = todo o catálogo.
     */
    worldCatalog?: IMaddoxWorldCatalog | null
    /**
     * Estado atual da história (Maddox 4), o "checkpoint" mantido pelo narrador: cena, local, situação e a
     * decisão aguardada. Relido a cada turno.
     */
    state: {
        scene: string
        location: string
        situation: string
        pendingDecision: string
        updatedTurn: number | null
        updatedAt: Date | null
        /**
         * Campos regravados pelo Maddox desde o Maddox 9, quando o estado passou a aparecer no Diário da campanha (o prompt
         * avisa que ele é público). Só esses chegam aos jogadores: o que foi gravado antes, como rascunho interno, fica oculto.
         */
        publicFields?: MaddoxCampaignStateField[]
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
            failedAt: { type: Date, default: null },
            checkRound: { type: Number, default: 0 },
            awaitingChecks: { type: Boolean, default: false },
            combatActor: { type: new Schema({ combatId: Schema.Types.ObjectId, actorKey: String, memberId: Schema.Types.ObjectId, offlineSince: { type: Date, default: null } }, { _id: false }), default: null },
        },
        showCheckDc: { type: Boolean, default: false },
        sceneImages: { type: Boolean, default: true },
        density: { type: String, enum: MADDOX_DENSITY_LEVELS, default: MADDOX_DEFAULT_DENSITY },
        startingLevel: { type: Number, default: null, min: 1, max: 20 },
        startingStage: { type: String, default: "" },
        worldCatalog: { type: Schema.Types.Mixed, default: null },
        state: {
            scene: { type: String, default: "" },
            location: { type: String, default: "" },
            situation: { type: String, default: "" },
            pendingDecision: { type: String, default: "" },
            updatedTurn: { type: Number, default: null },
            updatedAt: { type: Date, default: null },
            publicFields: { type: [String], default: [] },
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
