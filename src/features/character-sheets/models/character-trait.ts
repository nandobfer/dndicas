import mongoose, { Schema, Document } from "mongoose"
import type { TraitOrigin } from "../types/character-sheet.types"

export interface ICharacterTrait extends Document {
    _id: mongoose.Types.ObjectId
    sheetId: mongoose.Types.ObjectId
    catalogTraitId: mongoose.Types.ObjectId | null
    name: string
    description: string
    origin: TraitOrigin
    createdAt: Date
}

const CharacterTraitSchema = new Schema<ICharacterTrait>(
    {
        sheetId: { type: Schema.Types.ObjectId, ref: "CharacterSheet", required: true, index: true },
        catalogTraitId: { type: Schema.Types.ObjectId, ref: "Trait", default: null },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, default: "" },
        origin: {
            type: String,
            enum: ["class", "race", "background", "manual"],
            required: true,
            default: "manual",
            index: true,
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
)

export const CharacterTrait = (mongoose.models.CharacterTrait as mongoose.Model<ICharacterTrait>) || mongoose.model<ICharacterTrait>("CharacterTrait", CharacterTraitSchema)
