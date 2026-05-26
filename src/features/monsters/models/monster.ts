import mongoose, { Schema, Document, Model } from "mongoose"
import type { Monster, NpcParam } from "../types/monsters.types"

export interface IMonster extends Omit<Monster, "_id" | "id" | "createdAt" | "updatedAt">, Document {
    _id: mongoose.Types.ObjectId
    createdAt: Date
    updatedAt: Date
}

const NpcParamSchema = new Schema<NpcParam>(
    {
        label: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, required: true, maxlength: 20000 },
        attackRoll: { type: Number },
        hitRoll: { type: String, trim: true, maxlength: 300 },
        usage: { type: String, trim: true, maxlength: 120 },
        recharge: { type: String, trim: true, maxlength: 80 },
    },
    { _id: true },
)

const AttributesSchema = new Schema(
    {
        strength: { type: Number, required: true, default: 10, min: 1, max: 30 },
        dexterity: { type: Number, required: true, default: 10, min: 1, max: 30 },
        constitution: { type: Number, required: true, default: 10, min: 1, max: 30 },
        intelligence: { type: Number, required: true, default: 10, min: 1, max: 30 },
        wisdom: { type: Number, required: true, default: 10, min: 1, max: 30 },
        charisma: { type: Number, required: true, default: 10, min: 1, max: 30 },
    },
    { _id: false },
)

const StateSchema = new Schema(
    {
        proficient: { type: Boolean, default: false },
        expertise: { type: Boolean, default: false },
        override: { type: Number },
    },
    { _id: false },
)

const SensesSchema = new Schema(
    {
        passivePerception: { type: Number },
        blindsight: { type: String, trim: true, maxlength: 80 },
        darkvision: { type: String, trim: true, maxlength: 80 },
        tremorsense: { type: String, trim: true, maxlength: 80 },
        truesight: { type: String, trim: true, maxlength: 80 },
        special: { type: String, trim: true, maxlength: 200 },
    },
    { _id: false },
)

const MonsterSchema = new Schema<IMonster>(
    {
        name: { type: String, required: [true, "Nome do monstro é obrigatório"], unique: true, trim: true, maxlength: 100 },
        originalName: { type: String, trim: true, maxlength: 100 },
        source: { type: String, required: [true, "Fonte é obrigatória"], trim: true, maxlength: 200 },
        description: { type: String, required: [true, "Descrição é obrigatória"], maxlength: 20000 },
        image: { type: String, default: "" },
        status: { type: String, enum: ["active", "inactive"], default: "active" },
        type: { type: String, required: true, enum: ["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"] },
        size: { type: String, required: true, enum: ["F", "D", "T", "S", "M", "L", "H", "G", "C", "V"] },
        alignment: { type: String, required: true, enum: ["LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE", "unaligned", "any"] },
        armorClass: { type: Number, required: true, min: 0, max: 50 },
        initiative: { type: Number },
        hitPointsFormula: { type: String, required: true, trim: true, maxlength: 80 },
        speed: { type: String, trim: true, maxlength: 80 },
        flySpeed: { type: String, trim: true, maxlength: 80 },
        swimSpeed: { type: String, trim: true, maxlength: 80 },
        climbSpeed: { type: String, trim: true, maxlength: 80 },
        attributes: { type: AttributesSchema, required: true, default: () => ({}) },
        savingThrows: { type: Map, of: StateSchema, default: {} },
        skills: { type: Map, of: StateSchema, default: {} },
        senses: { type: SensesSchema, default: () => ({}) },
        sensesAndLanguages: { type: [NpcParamSchema], default: [] },
        challengeRating: { type: String, required: true },
        experience: { type: Number },
        experienceOverride: { type: Number },
        proficiencyBonusOverride: { type: Number },
        languages: { type: String, default: "—", maxlength: 500 },
        damageVulnerabilities: { type: [String], default: [] },
        damageResistances: { type: [String], default: [] },
        damageImmunities: { type: [String], default: [] },
        conditionImmunities: { type: [String], default: [] },
        conditionImmunityNotes: { type: String, maxlength: 5000 },
        traits: { type: [NpcParamSchema], default: [] },
        actions: { type: [NpcParamSchema], default: [] },
        bonusActions: { type: [NpcParamSchema], default: [] },
        reactions: { type: [NpcParamSchema], default: [] },
        legendaryActions: { type: [NpcParamSchema], default: [] },
        legendaryActionUses: { type: Number },
        lairActions: { type: [NpcParamSchema], default: [] },
        lairActionInitiative: { type: Number },
        regionalEffects: { type: [NpcParamSchema], default: [] },
    },
    {
        timestamps: true,
        collection: "monsters",
        toJSON: {
            virtuals: true,
            versionKey: false,
            transform: (_, ret) => {
                const result = ret as Record<string, unknown>
                result.id = String(result._id)
                if (result.savingThrows instanceof Map) result.savingThrows = Object.fromEntries(result.savingThrows)
                if (result.skills instanceof Map) result.skills = Object.fromEntries(result.skills)
                return ret
            },
        },
        toObject: { virtuals: true },
    },
)

MonsterSchema.index({ name: "text", originalName: "text", description: "text", source: "text" })
MonsterSchema.index({ type: 1 })
MonsterSchema.index({ size: 1 })
MonsterSchema.index({ challengeRating: 1 })
MonsterSchema.index({ status: 1 })

export const MonsterModel: Model<IMonster> = (mongoose.models.Monster as Model<IMonster>) || mongoose.model<IMonster>("Monster", MonsterSchema)
