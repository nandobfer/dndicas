import { Schema } from "mongoose"

export const ChargeByLevelRowSchema = new Schema(
    {
        level: {
            type: Number,
            required: true,
            min: 1,
            max: 20,
        },
        value: {
            type: String,
            required: true,
        },
    },
    { _id: false },
)

export const ChargesSchema = new Schema(
    {
        mode: {
            type: String,
            enum: ["fixed", "proficiency", "attribute", "byLevel"],
            required: true,
        },
        attribute: {
            type: String,
            enum: ["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"],
            required: false,
        },
        value: {
            type: String,
            required: false,
        },
        values: {
            type: [ChargeByLevelRowSchema],
            required: false,
            default: undefined,
        },
    },
    { _id: false },
)
