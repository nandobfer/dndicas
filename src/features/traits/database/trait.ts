import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITrait extends Document {
    name: string;
    description: string;
    source: string;
    status: "active" | "inactive";
    createdAt: Date;
    updatedAt: Date;
}

const TraitSchema = new Schema<ITrait>(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            maxlength: 100,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            // Rich Text is stored as raw HTML string with mentions and S3 images
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
