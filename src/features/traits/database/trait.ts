import mongoose, { Schema, Document, Model } from "mongoose";
import type { TraitCharges, TraitChargesByLevelRow } from "../types/traits.types";

export interface ITrait extends Document {
    name: string;
    originalName?: string;
    description: string;
    charges?: TraitCharges;
    source: string;
    status: "active" | "inactive";
    createdAt: Date;
    updatedAt: Date;
}

const TraitChargeByLevelRowSchema = new Schema<TraitChargesByLevelRow>(
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

const TraitChargesSchema = new Schema(
    {
        mode: {
            type: String,
            enum: ["fixed", "byLevel"],
            required: true,
        },
        value: {
            type: String,
            required: false,
        },
        values: {
            type: [TraitChargeByLevelRowSchema],
            required: false,
            default: undefined,
        },
    },
    { _id: false },
)

const TraitSchema = new Schema<ITrait>(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            maxlength: 100,
            trim: true,
        },
        originalName: {
            type: String,
            required: false,
            maxlength: 100,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            // Rich Text is stored as raw HTML string with mentions and S3 images
        },
        charges: {
            type: TraitChargesSchema,
            required: false,
            default: undefined,
        },
        source: {
            type: String,
            required: true,
            maxlength: 200,
            trim: true,
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            versionKey: false,
            transform: (_, ret) => {
                const result = {
                    ...ret,
                    id: String(ret._id),
                };
                return result;
            },
        },
        toObject: { virtuals: true },
    },
);

// Indexes for common queries
TraitSchema.index({ name: "text", description: "text" });
TraitSchema.index({ status: 1 });

export const Trait: Model<ITrait> =
    mongoose.models.Trait || mongoose.model<ITrait>("Trait", TraitSchema);
