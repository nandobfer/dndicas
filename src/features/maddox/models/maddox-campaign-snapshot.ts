import mongoose, { Schema, type Model, type Types } from "mongoose"
import type { MaddoxTurnPhase } from "../constants"

/**
 * Referência de um canal de memórias da campanha no Engramind (DND-44): os canais Jogadores e Mestre (token do Maddox), o
 * canal individual de um Personagem Opex (token dele) ou o de um NPC Opex (token dele).
 */
export type MaddoxMemoryChannelRef = { kind: "campaign" } | { kind: "opex-member"; memberId: string } | { kind: "opex-npc"; npcId: string }

/** Ficha D&D de um personagem com as coleções filhas, como estavam no retrato. */
export interface IMaddoxSheetSnapshot {
    sheetId: Types.ObjectId
    sheet: Record<string, unknown> | null
    items: Record<string, unknown>[]
    attacks: Record<string, unknown>[]
    traits: Record<string, unknown>[]
    feats: Record<string, unknown>[]
    spells: Record<string, unknown>[]
}

/**
 * Retrato da mesa (DND-44) — `maddox_campaign_snapshots`.
 *
 * - `turn`: tirado quando a vez dos jogadores do turno `turnNumber` abre (depois da narração do Maddox). É o ponto de
 *   retorno de "Voltar ao turno…": um por turno, só dos turnos jogados depois da entrada da funcionalidade.
 * - `start` (DND-50): cópia das fichas dos personagens tirada em "Iniciar campanha" (e atualizada quando alguém conclui a
 *   entrevista com a campanha em andamento). É para onde o reinício devolve as fichas; um por campanha, com `turnNumber` 0.
 * - `origin`: tirado na primeira volta de uma volta pendente, com o turno inteiro (fase, elegíveis, falha) e as memórias
 *   tocadas pela volta; é o que "Voltar ao turno atual (N)" devolve. Some na retomada ou na perda definitiva.
 *
 * `takenAt` (relógio do dndicas) marca a fronteira das memórias: cada gravação leva a tag `gravado:<ms>`; a revisão de
 * uma memória vale no retrato quando foi gravada até `takenAt`.
 */
export interface IMaddoxCampaignSnapshot {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    kind: "turn" | "origin" | "start"
    turnNumber: number
    /** Volta pendente dona do retrato de origem. */
    rewindId: string | null
    takenAt: Date
    /** Última mensagem da campanha no momento do retrato (as posteriores saem da mesa ao voltar). */
    boundaryMessageId: Types.ObjectId | null
    /** Primeiras palavras da narração do Maddox no turno (lista "Voltar ao turno…"). */
    excerpt: string
    state: Record<string, unknown> | null
    /** Origem: o `turn` inteiro da campanha; turno: só a vez do combate tático. */
    turn: Record<string, unknown> | null
    npcs: Record<string, unknown>[]
    characters: { _id: Types.ObjectId; currentState: string; currentStatePublic: boolean; status: string }[]
    sheets: IMaddoxSheetSnapshot[]
    /** Combates ativos (documentos inteiros) e os ids de todos os combates da campanha naquele momento. */
    combats: Record<string, unknown>[]
    combatIds: Types.ObjectId[]
    preps: Record<string, unknown>[]
    /** Mensagens anteriores à fronteira que ainda podiam mudar (testes, rolagens, reações, ações, lembranças). */
    messages: Record<string, unknown>[]
    opexRuns: { memberId: Types.ObjectId; run: unknown }[]
    /** Origem: memórias tocadas pela volta pendente (para a perda definitiva) e gravações guardadas da fila. */
    memories: { id: string; ref: MaddoxMemoryChannelRef }[]
    pendingWrites: Record<string, unknown>[]
    /** Origem: fase em que a mesa estava. */
    phase: MaddoxTurnPhase | null
    createdAt: Date
}

const SnapshotSchema = new Schema<IMaddoxCampaignSnapshot>(
    {
        campaignId: { type: Schema.Types.ObjectId, required: true },
        kind: { type: String, enum: ["turn", "origin", "start"], required: true },
        turnNumber: { type: Number, required: true },
        rewindId: { type: String, default: null },
        takenAt: { type: Date, required: true },
        boundaryMessageId: { type: Schema.Types.ObjectId, default: null },
        excerpt: { type: String, default: "" },
        state: { type: Schema.Types.Mixed, default: null },
        turn: { type: Schema.Types.Mixed, default: null },
        npcs: { type: Schema.Types.Mixed, default: () => [] },
        characters: { type: Schema.Types.Mixed, default: () => [] },
        sheets: { type: Schema.Types.Mixed, default: () => [] },
        combats: { type: Schema.Types.Mixed, default: () => [] },
        combatIds: { type: [Schema.Types.ObjectId], default: [] },
        preps: { type: Schema.Types.Mixed, default: () => [] },
        messages: { type: Schema.Types.Mixed, default: () => [] },
        opexRuns: { type: Schema.Types.Mixed, default: () => [] },
        memories: { type: Schema.Types.Mixed, default: () => [] },
        pendingWrites: { type: Schema.Types.Mixed, default: () => [] },
        phase: { type: String, default: null },
    },
    { collection: "maddox_campaign_snapshots", timestamps: { createdAt: true, updatedAt: false }, versionKey: false, minimize: false },
)

// Um retrato por turno jogado (a captura repetida substitui o anterior do mesmo turno).
SnapshotSchema.index({ campaignId: 1, turnNumber: -1 }, { unique: true, partialFilterExpression: { kind: "turn" }, name: "snapshot_turn_unique" })
SnapshotSchema.index({ campaignId: 1, kind: 1, rewindId: 1 })
// Uma cópia de início por campanha (DND-50).
SnapshotSchema.index({ campaignId: 1 }, { unique: true, partialFilterExpression: { kind: "start" }, name: "snapshot_start_unique" })

export const MaddoxCampaignSnapshotModel: Model<IMaddoxCampaignSnapshot> =
    (mongoose.models.MaddoxCampaignSnapshot as Model<IMaddoxCampaignSnapshot>) || mongoose.model<IMaddoxCampaignSnapshot>("MaddoxCampaignSnapshot", SnapshotSchema)
