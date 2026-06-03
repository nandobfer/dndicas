import mongoose, { Schema, Document, Model } from "mongoose"
import type { Monster } from "../types/monsters.types"
import { NpcParamSchema, AttributesSchema, StateSchema, SensesSchema } from "./monster"

export interface IUserNpc extends Omit<Monster, "_id" | "id" | "createdAt" | "updatedAt">, Document {
    _id: mongoose.Types.ObjectId
    userId: string
    createdAt: Date
    updatedAt: Date
}

const UserNpcSchema = new Schema<IUserNpc>(
    {
        userId: { type: String, required: true, index: true },
        name: { type: String, required: [true, "Nome do NPC é obrigatório"], trim: true, maxlength: 100 },
        originalName: { type: String, trim: true, maxlength: 100 },
        source: { type: String, required: [true, "Fonte é obrigatória"], trim: true, maxlength: 200 },
        description: { type: String, required: [true, "Descrição é obrigatória"], maxlength: 20000 },
        image: { type: String, default: "" },
        status: { type: String, enum: ["active", "inactive"], default: "active" },
        type: { type: String, required: true, enum: ["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"] },
        size: { type: String, required: true, enum: ["F", "D", "T", "S", "M", "L", "H", "G", "C", "V"] },
        alignment: { type: String, required: true, enum: ["LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE", "unaligned", "any"] },
        armorClass: { type: String, required: true, trim: true, maxlength: 120 },
        initiative: { type: Number },
        hitPointsFormula: { type: String, required: true, trim: true, maxlength: 160 },
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
        collection: "user_npcs",
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

UserNpcSchema.index({ userId: 1, name: 1 }, { unique: true })
UserNpcSchema.index({ type: 1 })
UserNpcSchema.index({ size: 1 })
UserNpcSchema.index({ challengeRating: 1 })
UserNpcSchema.index({ status: 1 })

export const UserNpcModel: Model<IUserNpc> = (mongoose.models.UserNpc as Model<IUserNpc>) || mongoose.model<IUserNpc>("UserNpc", UserNpcSchema)
