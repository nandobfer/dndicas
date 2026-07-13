import { FeedbackAgentRunModel } from "../api/feedback-agent-run.model"
import { FeedbackModel } from "../api/feedback.model"
import type { FeedbackAgentRunKind, FeedbackDevelopmentStatus } from "../types/feedback.types"
import { createFeedbackTimelineEvent } from "./feedback-timeline-service"

export interface QueueFeedbackPlanInput {
    feedbackId: string
    model: string
    prompt: string
    actorId: string
    actorName: string
}

export interface QueueFeedbackAgentRunInput extends QueueFeedbackPlanInput {
    kind: Exclude<FeedbackAgentRunKind, "plan">
    nextStatus: FeedbackDevelopmentStatus
    eventMessage: string
    eventType: "implementation_requested" | "changes_requested" | "approved"
}

export async function hasActiveFeedbackAgentRun(feedbackId: string) {
    const activeRun = await FeedbackAgentRunModel.exists({
        feedbackId,
        status: { $in: ["queued", "running"] },
    })

    return Boolean(activeRun)
}

export async function queueFeedbackPlan(input: QueueFeedbackPlanInput) {
    const previousRuns = await FeedbackAgentRunModel.countDocuments({ feedbackId: input.feedbackId })
    const run = await FeedbackAgentRunModel.create({
        feedbackId: input.feedbackId,
        iteration: previousRuns + 1,
        kind: "plan",
        status: "queued",
        modelName: input.model,
        prompt: input.prompt,
    })

    await FeedbackModel.findByIdAndUpdate(input.feedbackId, {
        developmentStatus: "planejando",
        selectedModel: input.model,
        lastAgentRunId: String(run._id),
    })

    await createFeedbackTimelineEvent({
        feedbackId: input.feedbackId,
        type: "plan_requested",
        actorType: "admin",
        actorId: input.actorId,
        actorName: input.actorName,
        message: `Plano de implementação solicitado com o modelo ${input.model}.`,
        metadata: {
            runId: String(run._id),
            model: input.model,
        },
    })

    return run
}

export async function queueFeedbackAgentRun(input: QueueFeedbackAgentRunInput) {
    const previousRuns = await FeedbackAgentRunModel.countDocuments({ feedbackId: input.feedbackId })
    const run = await FeedbackAgentRunModel.create({
        feedbackId: input.feedbackId,
        iteration: previousRuns + 1,
        kind: input.kind,
        status: "queued",
        modelName: input.model,
        prompt: input.prompt,
    })

    await FeedbackModel.findByIdAndUpdate(input.feedbackId, {
        developmentStatus: input.nextStatus,
        selectedModel: input.model,
        lastAgentRunId: String(run._id),
    })

    await createFeedbackTimelineEvent({
        feedbackId: input.feedbackId,
        type: input.eventType,
        actorType: "admin",
        actorId: input.actorId,
        actorName: input.actorName,
        message: input.eventMessage,
        metadata: {
            runId: String(run._id),
            model: input.model,
            kind: input.kind,
        },
    })

    return run
}
