import mongoose, { Schema, type Document, type Model } from "mongoose"
import type { OpenCodeModelOption } from "../types/feedback.types"

export interface IFeedbackOpenCodeModelCache extends Document {
    key: "default"
    models: OpenCodeModelOption[]
    rawOutput?: string
    refreshedAt?: Date
    errorMessage?: string
    createdAt: Date
    updatedAt: Date
}

const OpenCodeModelOptionSchema = new Schema<OpenCodeModelOption>(
    {
        id: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        provider: { type: String, trim: true },
    },
    { _id: false },
)

const FeedbackOpenCodeModelCacheSchema = new Schema<IFeedbackOpenCodeModelCache>(
    {
        key: {
            type: String,
            enum: ["default"],
            default: "default",
            required: true,
            unique: true,
            index: true,
        },
        models: {
            type: [OpenCodeModelOptionSchema],
            default: [],
        },
        rawOutput: { type: String },
        refreshedAt: { type: Date },
        errorMessage: { type: String },
    },
    {
        timestamps: true,
        toJSON: {
            versionKey: false,
            transform: (_, ret) => ({
                ...ret,
                id: String(ret._id),
            }),
        },
    },
)

export const FeedbackOpenCodeModelCacheModel: Model<IFeedbackOpenCodeModelCache> =
    mongoose.models.FeedbackOpenCodeModelCache || mongoose.model<IFeedbackOpenCodeModelCache>("FeedbackOpenCodeModelCache", FeedbackOpenCodeModelCacheSchema)
