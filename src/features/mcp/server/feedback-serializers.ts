import type { FeedbackTimelineEvent } from "@/features/feedback/types/feedback.types"

type FeedbackLike = {
    _id?: unknown
    id?: unknown
    title?: string
    description?: string
    type?: string
    status?: string
    priority?: string
    developmentStatus?: string
    createdBy?: string
    creatorName?: string
    pullRequestNumber?: number
    pullRequestUrl?: string
    previewUrl?: string
    previewSlug?: string
    selectedModel?: string
    branchName?: string
    lastAgentRunId?: string
    approvedBy?: string
    approvedAt?: Date | string
    completedAt?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
}

function serializeDate(value: Date | string | undefined) {
    if (!value) return undefined
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toPlainFeedback(feedback: FeedbackLike | { toObject(): FeedbackLike }): FeedbackLike {
    const maybeDocument = feedback as { toObject?: () => FeedbackLike }
    if (typeof maybeDocument.toObject === "function") {
        return maybeDocument.toObject()
    }
    return feedback as FeedbackLike
}

export function serializePublicFeedback(feedback: FeedbackLike | { toObject(): FeedbackLike }) {
    const data = toPlainFeedback(feedback)

    return {
        id: String(data._id ?? data.id),
        title: data.title,
        description: data.description,
        type: data.type,
        status: data.status,
        priority: data.priority,
        developmentStatus: data.developmentStatus,
        creatorName: data.creatorName,
        createdAt: serializeDate(data.createdAt),
        updatedAt: serializeDate(data.updatedAt),
        pullRequestUrl: data.pullRequestUrl,
        previewUrl: data.previewUrl,
    }
}

export function serializeAuthenticatedFeedback(feedback: FeedbackLike | { toObject(): FeedbackLike }, options: { includeAdminFields?: boolean } = {}) {
    const data = toPlainFeedback(feedback)
    const publicData = serializePublicFeedback(data)

    return {
        ...publicData,
        createdBy: data.createdBy,
        ...(options.includeAdminFields ? {
            selectedModel: data.selectedModel,
            branchName: data.branchName,
            pullRequestNumber: data.pullRequestNumber,
            previewSlug: data.previewSlug,
            lastAgentRunId: data.lastAgentRunId,
            approvedBy: data.approvedBy,
            approvedAt: serializeDate(data.approvedAt),
            completedAt: serializeDate(data.completedAt),
        } : {}),
    }
}

export function serializeTimelineEvent(event: FeedbackTimelineEvent) {
    return {
        id: event.id,
        feedbackId: event.feedbackId,
        type: event.type,
        actorType: event.actorType,
        actorId: event.actorId,
        actorName: event.actorName,
        message: event.message,
        metadata: event.metadata,
        visibility: event.visibility,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
    }
}

export function serializeAgentRun(run: { _id?: unknown; id?: unknown; feedbackId?: unknown; iteration?: number; kind?: string; status?: string; modelName?: string; createdAt?: Date | string; updatedAt?: Date | string }) {
    return {
        id: String(run._id ?? run.id),
        feedbackId: run.feedbackId ? String(run.feedbackId) : undefined,
        iteration: run.iteration,
        kind: run.kind,
        status: run.status,
        modelName: run.modelName,
        createdAt: serializeDate(run.createdAt),
        updatedAt: serializeDate(run.updatedAt),
    }
}
