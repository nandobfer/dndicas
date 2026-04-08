import mongoose, { Schema, Document } from "mongoose"

export interface ICharacterAttack extends Document {
    _id: mongoose.Types.ObjectId
    sheetId: mongoose.Types.ObjectId
    name: string
    attackBonus: number
    damageType: string
    notes: string
    createdAt: Date
}

const CharacterAttackSchema = new Schema<ICharacterAttack>(
    {
        sheetId: { type: Schema.Types.ObjectId, ref: "CharacterSheet", required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 500 },
        attackBonus: { type: Number, default: 0 },
        damageType: { type: String, default: "", maxlength: 500 },
        notes: { type: String, default: "" },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
)

export const CharacterAttack = (mongoose.models.CharacterAttack as mongoose.Model<ICharacterAttack>) || mongoose.model<ICharacterAttack>("CharacterAttack", CharacterAttackSchema)
