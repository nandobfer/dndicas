import mongoose, { Schema, type Document, type Model, type Types } from "mongoose"
import type { FeedbackActorType, FeedbackTimelineEventType, FeedbackTimelineVisibility } from "../types/feedback.types"

export interface IFeedbackTimelineEvent extends Document {
    feedbackId: Types.ObjectId
    type: FeedbackTimelineEventType
    actorType: FeedbackActorType
    actorId?: string
    actorName?: string
    message: string
    metadata?: Record<string, unknown>
    visibility: FeedbackTimelineVisibility
    createdAt: Date
    updatedAt: Date
}

const FeedbackTimelineEventSchema = new Schema<IFeedbackTimelineEvent>(
    {
        feedbackId: {
            type: Schema.Types.ObjectId,
            ref: "Feedback",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ["feedback_created", "comment_created", "plan_requested", "plan_created", "implementation_requested", "agent_started", "agent_progress", "agent_completed", "agent_failed", "commit_created", "pull_request_created", "pull_request_updated", "deploy_started", "deploy_ready", "deploy_failed", "changes_requested", "approved", "merged", "cleanup_completed", "status_changed"],
            required: true,
        },
        actorType: {
            type: String,
            enum: ["user", "admin", "agent", "system"],
            required: true,
        },
        actorId: { type: String },
        actorName: { type: String },
        message: {
            type: String,
            required: true,
            maxlength: 50000,
        },
        metadata: { type: Schema.Types.Mixed },
        visibility: {
            type: String,
            enum: ["public", "admin"],
            default: "public",
            required: true,
        },
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

FeedbackTimelineEventSchema.index({ feedbackId: 1, createdAt: 1 })

export const FeedbackTimelineEventModel: Model<IFeedbackTimelineEvent> =
    mongoose.models.FeedbackTimelineEvent || mongoose.model<IFeedbackTimelineEvent>("FeedbackTimelineEvent", FeedbackTimelineEventSchema)
