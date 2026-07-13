"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getPusherBrowserConfig } from "@/core/realtime/pusher-browser-config"
import { PusherBrowserService } from "@/core/realtime/pusher-browser-service"
import { FEEDBACK_PUSHER_EVENTS, getFeedbackChannelName, type FeedbackTimelineChangedPayload } from "../realtime/feedback-pusher"
import type { FeedbackTimelineEvent } from "../types/feedback.types"
import { feedbackKeys } from "./useFeedback"

function mergeTimelineEvent(currentEvents: FeedbackTimelineEvent[] | undefined, nextEvent: FeedbackTimelineEvent) {
    const events = currentEvents ?? []
    if (events.some((event) => event.id === nextEvent.id)) return events

    return [...events, nextEvent].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
}

export function useFeedbackRealtime(feedbackId: string) {
    const queryClient = useQueryClient()

    useEffect(() => {
        if (!feedbackId) return

        let disposed = false
        let channel: ReturnType<PusherBrowserService["subscribe"]> | null = null
        const channelName = getFeedbackChannelName(feedbackId)

        void (async () => {
            const browserConfig = await getPusherBrowserConfig()
            if (disposed || !browserConfig) return

            channel = PusherBrowserService.getInstance().subscribe(browserConfig, channelName)

            channel.bind("pusher:subscription_succeeded", () => {
                console.info("[feedback-realtime] Inscrição Pusher concluída.", { feedbackId, channelName })
            })

            channel.bind("pusher:subscription_error", (error: unknown) => {
                console.error("[feedback-realtime] Falha ao assinar canal Pusher.", { feedbackId, channelName, error })
            })

            channel.bind(FEEDBACK_PUSHER_EVENTS.timelineChanged, (payload: FeedbackTimelineChangedPayload) => {
                if (payload.feedbackId !== feedbackId) return

                queryClient.setQueryData<FeedbackTimelineEvent[]>(
                    feedbackKeys.timeline(feedbackId),
                    (currentEvents) => mergeTimelineEvent(currentEvents, payload.event),
                )

                if (payload.shouldRefetchFeedback) {
                    void queryClient.invalidateQueries({ queryKey: feedbackKeys.detail(feedbackId) })
                    void queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() })
                }
            })
        })()

        return () => {
            disposed = true
            if (!channel) return

            channel.unbind("pusher:subscription_succeeded")
            channel.unbind("pusher:subscription_error")
            channel.unbind(FEEDBACK_PUSHER_EVENTS.timelineChanged)
            PusherBrowserService.getInstance().unsubscribe(channelName)
        }
    }, [feedbackId, queryClient])
}
