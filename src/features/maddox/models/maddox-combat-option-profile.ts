import mongoose, { Schema, type Model, type Types } from "mongoose"
import { MADDOX_COMBAT_COSTS, MADDOX_COMBAT_RESOLUTIONS, MADDOX_REACTION_TRIGGERS, type MaddoxCombatCost, type MaddoxCombatResolution, type MaddoxReactionTrigger } from "../constants"

/**
 * Cache do classificador de custo do combate tático (Maddox 7) — `maddox_combat_option_profiles`. Uma linha por
 * habilidade, talento ou magia (`entityType` + `entityId`, ou só o hash do texto para entradas fora do catálogo) e
 * versão do texto (`textHash`): o JEV classifica uma vez e a tela passa a mostrar a opção na Ação certa.
 */
export interface IMaddoxCombatOptionProfile {
    _id: Types.ObjectId
    entityType: string
    entityId: string
    textHash: string
    name: string
    cost: MaddoxCombatCost
    trigger: MaddoxReactionTrigger | null
    resolution: MaddoxCombatResolution | null
    halfOnSave: boolean
    source: "text" | "jev"
    createdAt: Date
    updatedAt: Date
}

const ProfileSchema = new Schema<IMaddoxCombatOptionProfile>(
    {
        entityType: { type: String, required: true },
        entityId: { type: String, required: true },
        textHash: { type: String, required: true },
        name: { type: String, default: "" },
        cost: { type: String, enum: MADDOX_COMBAT_COSTS, required: true },
        trigger: { type: String, enum: [...MADDOX_REACTION_TRIGGERS, null], default: null },
        resolution: { type: String, enum: [...MADDOX_COMBAT_RESOLUTIONS, null], default: null },
        halfOnSave: { type: Boolean, default: false },
        source: { type: String, enum: ["text", "jev"], default: "jev" },
    },
    { collection: "maddox_combat_option_profiles", timestamps: true, versionKey: false },
)

ProfileSchema.index({ entityType: 1, entityId: 1, textHash: 1 }, { unique: true, name: "entity_text_unique" })

export const MaddoxCombatOptionProfileModel: Model<IMaddoxCombatOptionProfile> =
    (mongoose.models.MaddoxCombatOptionProfile as Model<IMaddoxCombatOptionProfile>) || mongoose.model<IMaddoxCombatOptionProfile>("MaddoxCombatOptionProfile", ProfileSchema)
