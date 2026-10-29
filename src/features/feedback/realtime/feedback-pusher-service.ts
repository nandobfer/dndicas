import { pusher } from "@/lib/pusher/server"
import { FEEDBACK_PUSHER_EVENTS, getFeedbackChannelName, type FeedbackTimelineChangedPayload } from "./feedback-pusher"

/**
 * Publicação da linha do tempo dos feedbacks. A conexão é a da integração "Pusher" (Integrações ›
 * Pusher, banco → `.env` legado), resolvida a cada uso e recriada quando a configuração muda.
 */
export class FeedbackPusherService {
    private static instance: FeedbackPusherService | null = null

    static getInstance(): FeedbackPusherService {
        if (!FeedbackPusherService.instance) {
            FeedbackPusherService.instance = new FeedbackPusherService()
        }

        return FeedbackPusherService.instance
    }

    getChannelName(feedbackId: string) {
        return getFeedbackChannelName(feedbackId)
    }

    async publishTimelineChanged(payload: FeedbackTimelineChangedPayload) {
        await pusher.trigger(this.getChannelName(payload.feedbackId), FEEDBACK_PUSHER_EVENTS.timelineChanged, payload)
    }
}
