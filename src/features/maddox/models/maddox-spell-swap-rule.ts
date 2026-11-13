import mongoose, { Schema, type Model, type Types } from "mongoose"

/**
 * Decisão do Maddox sobre a troca de magia ao subir de nível (DND-56) — `maddox_spell_swap_rules`. Uma por classe ou
 * subclasse e pelo texto dos traços de conjuração (`key` inclui o hash): o texto mudou no catálogo, decide de novo.
 */
export interface IMaddoxSpellSwapRule {
    _id: Types.ObjectId
    key: string
    allowed: boolean
    source: string | null
    createdAt: Date
}

const MaddoxSpellSwapRuleSchema = new Schema<IMaddoxSpellSwapRule>(
    {
        key: { type: String, required: true, unique: true },
        allowed: { type: Boolean, required: true },
        source: { type: String, default: null },
    },
    { collection: "maddox_spell_swap_rules", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)

export const MaddoxSpellSwapRuleModel: Model<IMaddoxSpellSwapRule> = (mongoose.models.MaddoxSpellSwapRule as Model<IMaddoxSpellSwapRule>) || mongoose.model<IMaddoxSpellSwapRule>("MaddoxSpellSwapRule", MaddoxSpellSwapRuleSchema)
