import mongoose, { Schema, type Model, type Types } from "mongoose"
import {
    MADDOX_CAMPAIGN_STATUSES,
    MADDOX_COMBAT_DIFFICULTY_DEFAULT,
    MADDOX_COMBAT_DIFFICULTY_LEVELS,
    MADDOX_DEFAULT_DENSITY,
    MADDOX_DENSITY_LEVELS,
    MADDOX_LEVEL_UP_STATUSES,
    MADDOX_PROGRESSION_MODES,
    MADDOX_RIGOR_LEVELS,
    MADDOX_SCENARIO_STATUSES,
    MADDOX_TURN_PHASES,
    type MaddoxCampaignStateField,
    type MaddoxCampaignStatus,
    type MaddoxCombatDifficultyLevel,
    type MaddoxDensityLevel,
    type MaddoxLevelUpStatus,
    type MaddoxMilestoneTrigger,
    type MaddoxProgressionMode,
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
    /**
     * Reinício da campanha (DND-50): a campanha voltou ao lobby do fim das entrevistas. `cleaning` = a limpeza da partida
     * ainda roda (ou parou num reinício do processo e é retomada); `memories: "pending"` = as memórias da partida anterior
     * ainda não foram apagadas no Engramind (a rotina e o próximo início tentam de novo). `npcTokenBoxes` guarda os tokens
     * cifrados dos NPCs Opex apagados, para limpar os canais deles depois. Some quando a campanha é iniciada de novo.
     */
    reset?: MaddoxCampaignReset | null
    /** Mostra a CD dos testes aos jogadores (Maddox 5); padrão = secreta. */
    showCheckDc: boolean
    /** Imagens automáticas nas cenas (Maddox 10): o dono desliga na campanha; o pedido manual continua. */
    sceneImages: boolean
    /** Declarações dos outros jogadores ocultas no chat (DND-36): só na leitura; o texto fica salvo e o Maddox recebe tudo. */
    hidePlayerActions: boolean
    /** PV dos inimigos no combate tático (DND-53): `false` = só a faixa de estado (padrão); `true` = números atual/máximo. */
    showEnemyHp: boolean
    /** PV dos aliados NPC no combate tático (DND-53): `false` = só a faixa de estado (padrão); `true` = números. */
    showAllyHp: boolean
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
    /**
     * Progressão de nível (DND-56, graus com ficha). `mode` é escolhido na criação (ausente = "marco"); `declared` guarda
     * os níveis já declarados no modo Marco (não abrem duas vezes); `pendingMilestone` é o marco positivo que o Maddox
     * ainda não declarou (vai como orientação para a próxima narração).
     */
    progression?: { mode?: MaddoxProgressionMode | null; declared?: IMaddoxLevelDeclaration[]; pendingMilestone?: IMaddoxPendingMilestone | null } | null
    /** Degraus de subida de nível (um por personagem e por nível), concluídos em ordem (DND-56). */
    levelUps?: IMaddoxLevelUp[]
    /** Capítulos encerrados pelo Maddox (DND-56), no Diário. */
    chapters?: IMaddoxChapter[]
    /** Quando o dono iniciou a campanha (Maddox 3). */
    startedAt: Date | null
    /** Link de convite (Maddox 1). `select: false`: só o dono o recebe; gerar outro invalida o anterior. */
    invite: { token: string | null; rotatedAt: Date | null }
    createdAt: Date
    updatedAt: Date
}

export interface IMaddoxLevelDeclaration {
    id: string
    level: number
    reason: string
    trigger: MaddoxMilestoneTrigger | "manual"
    /** Declarado sem marco positivo (recompensa narrativa). */
    offMilestone: boolean
    turnNumber: number
    messageId: Types.ObjectId | null
    at: Date
}

export interface IMaddoxPendingMilestone {
    trigger: MaddoxMilestoneTrigger
    reason: string
    turnNumber: number
    at: Date
}

export interface IMaddoxLevelUp {
    _id: Types.ObjectId
    characterId: Types.ObjectId
    memberId: Types.ObjectId
    characterName: string
    kind: "human" | "opex"
    fromLevel: number
    toLevel: number
    source: MaddoxProgressionMode
    declarationId: string | null
    status: MaddoxLevelUpStatus
    /** Ganhos aplicados na ficha (`LevelUpGains`). */
    gains: Record<string, unknown> | null
    /** Motivo da falha do Opex em linguagem de mesa (só o dono vê). */
    error: string | null
    /** Erro técnico da falha (log e diagnóstico; nunca vai ao DTO). */
    errorDetail?: string | null
    /** Card "Subida de nível" do chat. */
    messageId: Types.ObjectId | null
    /** O Maddox já narrou a subida (modo Experiência). */
    narrated: boolean
    createdAt: Date
    doneAt: Date | null
    doneBy: string | null
    /** Quando o Personagem Opex começou a decidir (DND-56): sem execução em andamento, o degrau é retomado. */
    decidingAt?: Date | null
}

export interface IMaddoxChapter {
    _id: Types.ObjectId
    title: string
    summary: string
    turnNumber: number
    createdAt: Date
}

export interface MaddoxCampaignReset {
    id: string
    status: "cleaning" | "done"
    previousStatus: MaddoxCampaignStatus
    /** Turno em que a mesa estava (auditoria). */
    previousTurn?: number
    byUserId: string
    startedAt: Date
    completedAt: Date | null
    memories: "pending" | "done"
    npcTokenBoxes: Record<string, unknown>
    lastError: string | null
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
        reset: { type: Schema.Types.Mixed, default: null },
        showCheckDc: { type: Boolean, default: false },
        sceneImages: { type: Boolean, default: true },
        hidePlayerActions: { type: Boolean, default: false },
        showEnemyHp: { type: Boolean, default: false },
        showAllyHp: { type: Boolean, default: false },
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
        progression: {
            type: new Schema(
                {
                    mode: { type: String, enum: MADDOX_PROGRESSION_MODES, default: "marco" },
                    declared: { type: [Schema.Types.Mixed], default: [] },
                    pendingMilestone: { type: Schema.Types.Mixed, default: null },
                },
                { _id: false },
            ),
            default: null,
        },
        levelUps: {
            type: [
                new Schema(
                    {
                        characterId: { type: Schema.Types.ObjectId, required: true },
                        memberId: { type: Schema.Types.ObjectId, required: true },
                        characterName: { type: String, default: "" },
                        kind: { type: String, enum: ["human", "opex"], default: "human" },
                        fromLevel: { type: Number, required: true },
                        toLevel: { type: Number, required: true },
                        source: { type: String, enum: MADDOX_PROGRESSION_MODES, required: true },
                        declarationId: { type: String, default: null },
                        status: { type: String, enum: MADDOX_LEVEL_UP_STATUSES, default: "pending" },
                        gains: { type: Schema.Types.Mixed, default: null },
                        error: { type: String, default: null },
                        errorDetail: { type: String, default: null },
                        messageId: { type: Schema.Types.ObjectId, default: null },
                        narrated: { type: Boolean, default: false },
                        createdAt: { type: Date, default: Date.now },
                        doneAt: { type: Date, default: null },
                        doneBy: { type: String, default: null },
                        decidingAt: { type: Date, default: null },
                    },
                    { _id: true },
                ),
            ],
            default: [],
        },
        chapters: {
            type: [new Schema({ title: { type: String, required: true }, summary: { type: String, default: "" }, turnNumber: { type: Number, default: 0 }, createdAt: { type: Date, default: Date.now } }, { _id: true })],
            default: [],
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
