import mongoose, { Schema, type Model, type Types } from "mongoose"
import {
    MADDOX_CAMPAIGN_STATUSES,
    MADDOX_COMBAT_DIFFICULTY_DEFAULT,
    MADDOX_COMBAT_DIFFICULTY_LEVELS,
    MADDOX_DEFAULT_DENSITY,
    MADDOX_DENSITY_LEVELS,
    MADDOX_RIGOR_LEVELS,
    MADDOX_SCENARIO_STATUSES,
    MADDOX_TURN_PHASES,
    type MaddoxCampaignStateField,
    type MaddoxCampaignStatus,
    type MaddoxCombatDifficultyLevel,
    type MaddoxDensityLevel,
    type MaddoxRigorLevel,
    type MaddoxScenarioStatus,
    type MaddoxTurnPhase,
} from "../constants"
import type { IMaddoxWorldCatalog } from "./maddox-interview"
import type { MaddoxMemoryChannelRef } from "./maddox-campaign-snapshot"

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
        /**
         * Trava do turno do mestre. `rewind` (DND-44) marca a trava tomada por uma volta a um turno (ou a retomada do turno
         * de origem): o turno do mestre não a retoma, e a trava velha refaz a mesma operação (idempotente).
         */
        generating: { token: string; startedAt: Date; rewind?: MaddoxRewindOp | null } | null
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
        /** Combate tático (DND-25): pausa de leitura entre dois blocos; a continuação só entra na fila depois disto. */
        pauseUntil?: Date | null
        /**
         * Personagens Opex (DND-26): depois que os humanos terminam o turno dos jogadores, cada Opex age um de cada vez.
         * `failedAt` + `error` = o Opex não conseguiu agir e a mesa espera o dono ("Tentar de novo" ou "Pular").
         */
        opexActor?: { memberId: Types.ObjectId; startedAt: Date; questions: number; failedAt: Date | null; error: string | null } | null
    }
    /**
     * Volta pendente (DND-44): a mesa foi levada ao turno `atTurn` a partir do turno de origem `originTurn`. Enquanto o Maddox
     * não narrar de novo, o dono anda entre os turnos já jogados ou retoma a origem (retrato `originSnapshotId`); a nova
     * narração apaga o trecho descartado de vez (`commitRewind`). `positionAt` = quando a mesa chegou ao turno atual
     * (as ações feitas depois disso são "declarações novas", apagadas ao trocar de turno).
     */
    rewind?: {
        id: string
        originTurn: number
        originPhase: MaddoxTurnPhase
        atTurn: number
        positionAt: Date
        startedAt: Date
        byUserId: string
        originSnapshotId: Types.ObjectId
    } | null
    /**
     * Memórias que ficaram pela metade numa volta que falhou (DND-44): antes da próxima volta, retomada ou narração, elas
     * são levadas ao alvo gravado (`asOf` nulo = o estado mais novo). A rotina de sincronização das memórias também tenta.
     */
    memoryRepair?: { asOf: number | null; keepAfter: number | null; known: { id: string; ref: MaddoxMemoryChannelRef }[]; at: Date } | null
    /** Mostra a CD dos testes aos jogadores (Maddox 5); padrão = secreta. */
    showCheckDc: boolean
    /** Imagens automáticas nas cenas (Maddox 10): o dono desliga na campanha; o pedido manual continua. */
    sceneImages: boolean
    /** Declarações dos outros jogadores ocultas no chat (DND-36): só na leitura; o texto fica salvo e o Maddox recebe tudo. */
    hidePlayerActions: boolean
    /** Densidade das narrações (DND-22): o dono muda a qualquer momento; vale a partir da próxima narração. */
    density: MaddoxDensityLevel
    /** Dificuldade dos combates (DND-42): só vale nos graus táticos; o dono muda a qualquer momento, vale a partir do próximo combate. */
    combatDifficulty: MaddoxCombatDifficultyLevel
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

/** Operação da volta em andamento (gravada na trava para a retomada depois de um reinício). */
export interface MaddoxRewindOp {
    kind: "goto" | "resume"
    target: number | null
    userId: string
    /** Turno e fase de antes da operação (a trava devolve a mesa a eles quando a rede de memórias falha). */
    before: { number: number; phase: MaddoxTurnPhase; failedAt: Date | null }
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
            generating: { type: new Schema({ token: String, startedAt: Date, rewind: { type: Schema.Types.Mixed, default: null } }, { _id: false }), default: null },
            failedAt: { type: Date, default: null },
            checkRound: { type: Number, default: 0 },
            awaitingChecks: { type: Boolean, default: false },
            combatActor: { type: new Schema({ combatId: Schema.Types.ObjectId, actorKey: String, memberId: Schema.Types.ObjectId, offlineSince: { type: Date, default: null } }, { _id: false }), default: null },
            pauseUntil: { type: Date, default: null },
            opexActor: {
                type: new Schema({ memberId: Schema.Types.ObjectId, startedAt: Date, questions: { type: Number, default: 0 }, failedAt: { type: Date, default: null }, error: { type: String, default: null } }, { _id: false }),
                default: null,
            },
        },
        rewind: {
            type: new Schema(
                {
                    id: { type: String, required: true },
                    originTurn: { type: Number, required: true },
                    originPhase: { type: String, enum: MADDOX_TURN_PHASES, required: true },
                    atTurn: { type: Number, required: true },
                    positionAt: { type: Date, required: true },
                    startedAt: { type: Date, required: true },
                    byUserId: { type: String, required: true },
                    originSnapshotId: { type: Schema.Types.ObjectId, required: true },
                },
                { _id: false },
            ),
            default: null,
        },
        memoryRepair: { type: Schema.Types.Mixed, default: null },
        showCheckDc: { type: Boolean, default: false },
        sceneImages: { type: Boolean, default: true },
        hidePlayerActions: { type: Boolean, default: false },
        density: { type: String, enum: MADDOX_DENSITY_LEVELS, default: MADDOX_DEFAULT_DENSITY },
        combatDifficulty: { type: String, enum: MADDOX_COMBAT_DIFFICULTY_LEVELS, default: MADDOX_COMBAT_DIFFICULTY_DEFAULT },
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
