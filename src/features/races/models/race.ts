import mongoose, { Schema, Document } from "mongoose"
import type { Race, RaceTrait, SizeCategory } from "../types/races.types"

const SIZES: SizeCategory[] = ["Pequeno", "Médio", "Grande"]

const RaceTraitSchema = new Schema(
    {
        name: {
            type: String,
            required: [true, "Nome da característica é obrigatório"],
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
            maxlength: [10000, "Habilidade deve ter no máximo 10000 caracteres"],
        },
    },
    { _id: true },
)

const RaceVariationSchema = new Schema(
    {
        name: {
            type: String,
            required: [true, "Nome da variação é obrigatório"],
            trim: true,
        },
        description: {
            type: String,
            default: "",
        },
        source: {
            type: String,
        },
        image: {
            type: String,
            default: "",
        },
        color: {
            type: String,
        },
        traits: {
            type: [RaceTraitSchema],
            default: [],
        },
        spells: [Schema.Types.Mixed],
        size: {
            type: String,
            enum: SIZES,
        },
        speed: {
            type: String,
        },
    },
    { _id: true },
)

export interface IRace extends Omit<Race, "_id">, Document {
    _id: mongoose.Types.ObjectId
}

const RaceSchema = new Schema<IRace>(
    {
        name: {
            type: String,
            required: [true, "Nome da raça é obrigatório"],
            trim: true,
            unique: true,
            minlength: [2, "Nome deve ter pelo menos 2 caracteres"],
            maxlength: [100, "Nome deve ter no máximo 100 caracteres"],
        },
        originalName: {
            type: String,
            required: false,
            trim: true,
            maxlength: [100, "Nome original deve ter no máximo 100 caracteres"],
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
        size: {
            type: String,
            enum: SIZES,
            default: "Médio",
            required: [true, "Tamanho é obrigatório"],
        },
        speed: {
            type: String,
            required: [true, "Deslocamento é obrigatório"],
            default: "9 metros",
        },
        traits: {
            type: [RaceTraitSchema],
            default: [],
        },
        spells: [Schema.Types.Mixed],
        variations: {
            type: [RaceVariationSchema],
            default: [],
        },
    },
    {
        timestamps: true,
        collection: "races",
    },
)

// Add compound text index for search
RaceSchema.index({
    name: "text",
    description: "text",
    source: "text",
})

// Correct model caching for Next.js hot-reloading
export const RaceModel = (mongoose.models.Race as mongoose.Model<IRace>) || mongoose.model<IRace>("Race", RaceSchema)
