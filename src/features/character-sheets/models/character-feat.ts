import mongoose, { Schema, Document } from "mongoose"

export interface ICharacterFeat extends Document {
    _id: mongoose.Types.ObjectId
    sheetId: mongoose.Types.ObjectId
    catalogFeatId: mongoose.Types.ObjectId | null
    name: string
    description: string
    levelAcquired: number | null
    createdAt: Date
}

const CharacterFeatSchema = new Schema<ICharacterFeat>(
    {
        sheetId: { type: Schema.Types.ObjectId, ref: "CharacterSheet", required: true, index: true },
        catalogFeatId: { type: Schema.Types.ObjectId, ref: "Feat", default: null },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, default: "" },
        levelAcquired: { type: Number, default: null, min: 1, max: 20 },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
)

export const CharacterFeat = (mongoose.models.CharacterFeat as mongoose.Model<ICharacterFeat>) || mongoose.model<ICharacterFeat>("CharacterFeat", CharacterFeatSchema)
