import mongoose, { Schema, type Model, type Types } from "mongoose"
import type { CombatPrepAdjustment, CombatPrepChange, CombatPrepOverlay, CombatPrepRider, CombatPrepStatus } from "../combat-types"

/**
 * Preparação da mesa de combate (DND-41) — `maddox_combat_preps`. Um documento por personagem em cada combate tático
 * (`combatId` + `actorKey`, único). Fica fora do `maddox_combats` para a gravação da preparação não disputar a versão
 * (`rev`) do combate com os jogadores. Guarda o estado da preparação, o que o Maddox mudou nas opções (`overlay`), os
 * danos adicionais (`riders`), as mudanças para o card privado e os pedidos de ajuste da vez.
 */
export interface IMaddoxCombatPrep {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    combatId: Types.ObjectId
    actorKey: string
    characterId: Types.ObjectId
    memberId: Types.ObjectId
    userId: string
    sheetId: Types.ObjectId | null
    characterName: string
    /** Turno do mestre e rodada de espera em que a iniciativa foi aberta (para fechar a ordem ao terminar). */
    turnNumber: number
    waitRound: number
    status: CombatPrepStatus
    attempts: number
    jobId: string | null
    /** Motivo da falha (log completo; no DTO só para o dono da campanha). */
    error: string | null
    startedAt: Date | null
    finishedAt: Date | null
    overlay: CombatPrepOverlay
    riders: CombatPrepRider[]
    changes: CombatPrepChange[]
    adjustments: CombatPrepAdjustment[]
    /** DND-49: entidades do catálogo lidas por ferramenta na preparação (`Tipo:id`). */
    catalogRefs: string[]
    /** DND-49: alterações de regra descartadas por falta de fonte confirmada no catálogo. */
    droppedWithoutSource: number
    /** DND-49: checagem de quem está a 0 PV ao abrir o combate já feita (uma vez por preparação). */
    downedCheckedAt: Date | null
    /** Mensagem privada "Sua mesa está pronta". */
    messageId: Types.ObjectId | null
    createdAt: Date
    updatedAt: Date
}

const PrepSchema = new Schema<IMaddoxCombatPrep>(
    {
        campaignId: { type: Schema.Types.ObjectId, required: true, index: true },
        combatId: { type: Schema.Types.ObjectId, required: true },
        actorKey: { type: String, required: true },
        characterId: { type: Schema.Types.ObjectId, required: true },
        memberId: { type: Schema.Types.ObjectId, required: true },
        userId: { type: String, required: true },
        sheetId: { type: Schema.Types.ObjectId, default: null },
        characterName: { type: String, default: "" },
        turnNumber: { type: Number, default: 0 },
        waitRound: { type: Number, default: 0 },
        status: { type: String, enum: ["pending", "running", "ready", "failed", "skipped", "discarded"], default: "pending" },
        attempts: { type: Number, default: 0 },
        jobId: { type: String, default: null },
        error: { type: String, default: null },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        overlay: { type: Schema.Types.Mixed, default: () => ({ modify: [], remove: [], add: [], suppress: [] }) },
        riders: { type: Schema.Types.Mixed, default: () => [] },
        changes: { type: Schema.Types.Mixed, default: () => [] },
        adjustments: { type: Schema.Types.Mixed, default: () => [] },
        catalogRefs: { type: [String], default: () => [] },
        droppedWithoutSource: { type: Number, default: 0 },
        downedCheckedAt: { type: Date, default: null },
        messageId: { type: Schema.Types.ObjectId, default: null },
    },
    { collection: "maddox_combat_preps", timestamps: true, versionKey: false, minimize: false },
)

PrepSchema.index({ combatId: 1, actorKey: 1 }, { unique: true, name: "combat_actor_unique" })

export const MaddoxCombatPrepModel: Model<IMaddoxCombatPrep> = (mongoose.models.MaddoxCombatPrep as Model<IMaddoxCombatPrep>) || mongoose.model<IMaddoxCombatPrep>("MaddoxCombatPrep", PrepSchema)
