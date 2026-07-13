import type { Types } from "mongoose"
import { FeedbackTimelineEventModel } from "../api/feedback-timeline-event.model"
import { shouldRefetchFeedbackForTimelineEvent } from "../realtime/feedback-pusher"
import { FeedbackPusherService } from "../realtime/feedback-pusher-service"
import type { FeedbackActorType, FeedbackTimelineEvent, FeedbackTimelineEventType, FeedbackTimelineVisibility } from "../types/feedback.types"

const MAX_TIMELINE_MESSAGE_LENGTH = Number(process.env.FEEDBACK_TIMELINE_MESSAGE_MAX_LENGTH ?? 12000)

export interface CreateFeedbackTimelineEventInput {
    feedbackId: string | Types.ObjectId
    type: FeedbackTimelineEventType
    actorType: FeedbackActorType
    actorId?: string
    actorName?: string
    message: string
    metadata?: Record<string, unknown>
    visibility?: FeedbackTimelineVisibility
}

function truncateText(value: string, maxLength: number) {
    if (value.length <= maxLength) return { value, truncated: false, originalLength: value.length }

    return {
        value: `${value.slice(0, maxLength)}\n\n[conteúdo truncado: ${value.length} caracteres no total]`,
        truncated: true,
        originalLength: value.length,
    }
}

function serializeTimelineEvent(event: { _id: unknown; feedbackId: unknown; type: FeedbackTimelineEventType; actorType: FeedbackActorType; actorId?: string; actorName?: string; message: string; metadata?: Record<string, unknown>; visibility: FeedbackTimelineVisibility; createdAt?: Date; updatedAt?: Date }): FeedbackTimelineEvent {
    return {
        id: String(event._id),
        feedbackId: String(event.feedbackId),
        type: event.type,
        actorType: event.actorType,
        actorId: event.actorId,
        actorName: event.actorName,
        message: event.message,
        metadata: event.metadata,
        visibility: event.visibility,
        createdAt: event.createdAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: event.updatedAt?.toISOString() ?? new Date().toISOString(),
    }
}

async function publishTimelineEvent(event: FeedbackTimelineEvent) {
    try {
        await FeedbackPusherService.getInstance().publishTimelineChanged({
            feedbackId: event.feedbackId,
            event,
            shouldRefetchFeedback: shouldRefetchFeedbackForTimelineEvent(event.type),
            serverTimestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.warn("[feedback-realtime] Falha ao publicar evento de timeline no Pusher.", {
            feedbackId: event.feedbackId,
            eventId: event.id,
            error,
        })
    }
}

export async function createFeedbackTimelineEvent(input: CreateFeedbackTimelineEventInput) {
    const sanitizedMessage = truncateText(input.message, MAX_TIMELINE_MESSAGE_LENGTH)
    const metadata = sanitizedMessage.truncated
        ? {
            ...(input.metadata ?? {}),
            messageTruncated: true,
            originalMessageLength: sanitizedMessage.originalLength,
        }
        : input.metadata

    const event = await FeedbackTimelineEventModel.create({
        ...input,
        message: sanitizedMessage.value,
        metadata,
        visibility: input.visibility ?? "public",
    })

    await publishTimelineEvent(serializeTimelineEvent(event))

    return event
}

export async function listFeedbackTimelineEvents(feedbackId: string, options?: { includeAdminEvents?: boolean }) {
    const events = await FeedbackTimelineEventModel.find(options?.includeAdminEvents ? { feedbackId } : { feedbackId, visibility: "public" })
        .sort({ createdAt: 1 })
        .lean()

    return events.map((event) => serializeTimelineEvent(event))
}
