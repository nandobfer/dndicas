import mongoose, { Schema, Document, Model } from "mongoose"

export interface IReference extends Document {
    name: string
    description: string
    source: string
    status: "active" | "inactive"
    createdAt: Date
    updatedAt: Date
}

const ReferenceSchema = new Schema<IReference>(
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
            // Rich Text is stored as raw HTML string
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
                ret.id = String(ret._id)
                return ret
            },
        },
        toObject: { virtuals: true },
    },
)

// Indexes for common queries
ReferenceSchema.index({ name: "text", description: "text" })
ReferenceSchema.index({ status: 1 })

export const Reference: Model<IReference> = mongoose.models.Reference || mongoose.model<IReference>("Reference", ReferenceSchema)
