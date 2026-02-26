import mongoose, { Schema, Document, Model } from "mongoose"

export interface IFeedback extends Document {
    title: string
    description: string
    type: "bug" | "melhoria"
    status: "pendente" | "concluido" | "cancelado"
    priority?: "baixa" | "media" | "alta"
    createdBy: string // Clerk ID
    creatorName: string
    creatorEmail?: string
    createdAt: Date
    updatedAt: Date
}

const FeedbackSchema = new Schema<IFeedback>(
    {
        title: {
            type: String,
            required: true,
            maxlength: 200,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ["bug", "melhoria"],
            required: true,
        },
        status: {
            type: String,
            enum: ["pendente", "concluido", "cancelado"],
            default: "pendente",
        },
        priority: {
            type: String,
            enum: ["baixa", "media", "alta"],
        },
        createdBy: {
            type: String,
            required: true,
        },
        creatorName: {
            type: String,
            required: true,
        },
        creatorEmail: {
            type: String,
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
                }
                return result
            },
        },
        toObject: { virtuals: true },
    },
)

// Indexes for search
FeedbackSchema.index({ title: "text", description: "text" })
FeedbackSchema.index({ status: 1 })
FeedbackSchema.index({ createdBy: 1 })

export const FeedbackModel: Model<IFeedback> = mongoose.models.Feedback || mongoose.model<IFeedback>("Feedback", FeedbackSchema)
