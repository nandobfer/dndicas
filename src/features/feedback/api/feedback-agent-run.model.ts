import mongoose, { Schema, type Document, type Model, type Types } from "mongoose"
import type { FeedbackAgentRunKind, FeedbackAgentRunStatus } from "../types/feedback.types"

export interface IFeedbackAgentRun extends Document {
    feedbackId: Types.ObjectId
    iteration: number
    kind: FeedbackAgentRunKind
    status: FeedbackAgentRunStatus
    opencodeSessionId?: string
    modelName: string
    prompt: string
    startedAt?: Date
    finishedAt?: Date
    exitCode?: number
    errorMessage?: string
    worktreePath?: string
    branchName?: string
    commitSha?: string
    pullRequestUrl?: string
    createdAt: Date
    updatedAt: Date
}

const FeedbackAgentRunSchema = new Schema<IFeedbackAgentRun>(
    {
        feedbackId: {
            type: Schema.Types.ObjectId,
            ref: "Feedback",
            required: true,
            index: true,
        },
        iteration: {
            type: Number,
            required: true,
            min: 1,
        },
        kind: {
            type: String,
            enum: ["plan", "implement", "iterate", "merge"],
            required: true,
        },
        status: {
            type: String,
            enum: ["queued", "running", "succeeded", "failed", "cancelled"],
            default: "queued",
            required: true,
            index: true,
        },
        opencodeSessionId: { type: String },
        modelName: {
            type: String,
            required: true,
        },
        prompt: {
            type: String,
            required: true,
            maxlength: 100000,
        },
        startedAt: { type: Date },
        finishedAt: { type: Date },
        exitCode: { type: Number },
        errorMessage: { type: String },
        worktreePath: { type: String },
        branchName: { type: String },
        commitSha: { type: String },
        pullRequestUrl: { type: String },
    },
    {
        timestamps: true,
        toJSON: {
            versionKey: false,
            transform: (_, ret) => ({
                ...ret,
                id: String(ret._id),
                feedbackId: String(ret.feedbackId),
            }),
        },
    },
)

FeedbackAgentRunSchema.index({ feedbackId: 1, iteration: 1 })
FeedbackAgentRunSchema.index({ feedbackId: 1, status: 1 })

export const FeedbackAgentRunModel: Model<IFeedbackAgentRun> =
    mongoose.models.FeedbackAgentRun || mongoose.model<IFeedbackAgentRun>("FeedbackAgentRun", FeedbackAgentRunSchema)
