import type { FeedbackTimelineEvent, FeedbackTimelineEventType } from "../types/feedback.types"

export const FEEDBACK_PUSHER_EVENTS = {
    timelineChanged: "feedback.timeline.changed",
} as const

export interface FeedbackTimelineChangedPayload {
    feedbackId: string
    event: FeedbackTimelineEvent
    shouldRefetchFeedback: boolean
    serverTimestamp: string
}

const FEEDBACK_EVENTS_THAT_REFETCH_DETAIL = new Set<FeedbackTimelineEventType>([
    "plan_requested",
    "plan_created",
    "implementation_requested",
    "agent_completed",
    "agent_failed",
    "pull_request_created",
    "pull_request_updated",
    "deploy_ready",
    "deploy_failed",
    "approved",
    "merged",
    "cleanup_completed",
    "status_changed",
])

export function getFeedbackChannelName(feedbackId: string) {
    return `feedback.${feedbackId}`
}

export function shouldRefetchFeedbackForTimelineEvent(type: FeedbackTimelineEventType) {
    return FEEDBACK_EVENTS_THAT_REFETCH_DETAIL.has(type)
}
