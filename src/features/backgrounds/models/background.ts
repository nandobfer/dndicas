import mongoose, { Schema, Document } from "mongoose"
import type { Background, BackgroundTrait } from "../types/backgrounds.types"

// Reuse skill and attribute enums where possible or redefine for strictness
const ATTRIBUTES = ["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"] as const
const SKILLS = [
    "Acrobacia",
    "Arcanismo",
    "Atletismo",
    "Atuação",
    "Enganação",
    "Furtividade",
    "História",
    "Intimidação",
    "Intuição",
    "Investigação",
    "Lidar com Animais",
    "Medicina",
    "Natureza",
    "Percepção",
    "Persuasão",
    "Prestidigitação",
    "Religião",
    "Sobrevivência",
] as const

const BackgroundTraitSchema = new Schema(
    {
        name: {
            type: String,
            required: false,
            trim: true,
            maxlength: [100, "Nome deve ter no máximo 100 caracteres"],
        },
        level: {
            type: Number,
            required: false,
            default: 1,
        },
        description: {
            type: String,
            required: [true, "Habilidade é obrigatória"],
            maxlength: [5000, "Habilidade deve ter no máximo 5000 caracteres"],
        },
    },
    { _id: true },
)

export interface IBackground extends Omit<Background, "_id">, Document {
    _id: mongoose.Types.ObjectId
}

const BackgroundSchema = new Schema<IBackground>(
    {
        name: {
            type: String,
            required: [true, "Nome da origem é obrigatório"],
            trim: true,
            unique: true,
            minlength: [2, "Nome deve ter pelo menos 2 caracteres"],
            maxlength: [100, "Nome deve ter no máximo 100 caracteres"],
        },
        image: {
            type: String,
            required: false,
            default: "",
        },
        description: {
            type: String,
            required: [true, "Descrição é obrigatória"],
            trim: true,
            maxlength: [20000, "Descrição deve ter no máximo 20000 caracteres"],
        },
        source: {
            type: String,
            required: [true, "Fonte é obrigatória"],
            default: "Manual do Jogador",
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },
        skillProficiencies: {
            type: [String],
            enum: SKILLS,
            default: [],
        },
        suggestedAttributes: {
            type: [String],
            enum: ATTRIBUTES,
            default: [],
        },
        featId: {
            type: String,
            required: false,
        },
        equipment: {
            type: String,
            required: false,
            default: "Itens iniciais não definidos.",
        },
        traits: {
            type: [BackgroundTraitSchema],
            default: [],
        },
    },
    {
        timestamps: true,
        collection: "backgrounds",
    },
)

// Add compound text index for search
BackgroundSchema.index({
    name: "text",
    description: "text",
    source: "text",
})

// Correct model caching for Next.js hot-reloading
export const BackgroundModel = (mongoose.models.Background as mongoose.Model<IBackground>) || mongoose.model<IBackground>("Background", BackgroundSchema)
