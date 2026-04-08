import mongoose, { Schema, Document } from "mongoose"

export interface ICharacterItem extends Document {
    _id: mongoose.Types.ObjectId
    sheetId: mongoose.Types.ObjectId
    catalogItemId: mongoose.Types.ObjectId | null
    name: string
    image: string | null
    quantity: number
    notes: string
    createdAt: Date
}

const CharacterItemSchema = new Schema<ICharacterItem>(
    {
        sheetId: { type: Schema.Types.ObjectId, ref: "CharacterSheet", required: true, index: true },
        catalogItemId: { type: Schema.Types.ObjectId, ref: "Item", default: null },
        name: { type: String, required: true, trim: true, maxlength: 2000 },
        image: { type: String, default: null },
        quantity: { type: Number, default: 1, min: 0 },
        notes: { type: String, default: "" },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
)

export const CharacterItem = (mongoose.models.CharacterItem as mongoose.Model<ICharacterItem>) || mongoose.model<ICharacterItem>("CharacterItem", CharacterItemSchema)
