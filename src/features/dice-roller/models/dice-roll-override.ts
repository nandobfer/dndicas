import mongoose, { Document, Schema } from "mongoose"
import type { DiceType } from "../types"

export interface IDiceRollOverride extends Document {
    _id: mongoose.Types.ObjectId
    scope: "local" | "owlbear"
    targetId: string
    dice: DiceType
    min?: number
    max?: number
    exact?: number
    remainingUses: number
    createdAt: Date
    updatedAt: Date
}

const DiceRollOverrideSchema = new Schema<IDiceRollOverride>(
    {
        scope: { type: String, required: true, enum: ["local", "owlbear"], index: true },
        targetId: { type: String, required: true, trim: true, index: true },
        dice: { type: String, required: true, enum: ["d4", "d6", "d8", "d10", "d12", "d20", "d100"], index: true },
        min: { type: Number, required: false },
        max: { type: Number, required: false },
        exact: { type: Number, required: false },
        remainingUses: { type: Number, required: true, default: 1, min: 1 },
    },
    { timestamps: true, collection: "dice_roll_overrides" }
)

DiceRollOverrideSchema.index({ scope: 1, targetId: 1, dice: 1 }, { unique: true })

export const DiceRollOverride =
    (mongoose.models.DiceRollOverride as mongoose.Model<IDiceRollOverride>) ||
    mongoose.model<IDiceRollOverride>("DiceRollOverride", DiceRollOverrideSchema)
