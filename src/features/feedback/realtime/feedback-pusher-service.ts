import Pusher from "pusher"
import { FEEDBACK_PUSHER_EVENTS, getFeedbackChannelName, type FeedbackTimelineChangedPayload } from "./feedback-pusher"

interface FeedbackPusherServerConfig {
    appId: string
    key: string
    secret: string
    host: string
    port: number
    scheme: "http" | "https"
    cluster: string
}

function readPusherConfig(): FeedbackPusherServerConfig {
    const appId = process.env.PUSHER_APP_ID?.trim()
    const key = process.env.PUSHER_APP_KEY?.trim()
    const secret = process.env.PUSHER_APP_SECRET?.trim()
    const host = process.env.PUSHER_HOST?.trim()
    const portRaw = process.env.PUSHER_PORT?.trim()
    const scheme = (process.env.PUSHER_SCHEME?.trim() || "http") as "http" | "https"
    const cluster = process.env.PUSHER_CLUSTER?.trim() || "mt1"

    if (!appId || !key || !secret || !host || !portRaw) {
        throw new Error("PUSHER_APP_ID, PUSHER_APP_KEY, PUSHER_APP_SECRET, PUSHER_HOST e PUSHER_PORT devem estar definidos.")
    }

    const port = Number.parseInt(portRaw, 10)
    if (!Number.isFinite(port)) throw new Error("PUSHER_PORT deve ser um número válido.")
    if (scheme !== "http" && scheme !== "https") throw new Error("PUSHER_SCHEME deve ser 'http' ou 'https'.")

    return { appId, key, secret, host, port, scheme, cluster }
}

export class FeedbackPusherService {
    private static instance: FeedbackPusherService | null = null

    static getInstance(): FeedbackPusherService {
        if (!FeedbackPusherService.instance) {
            FeedbackPusherService.instance = new FeedbackPusherService()
        }

        return FeedbackPusherService.instance
    }

    private client: Pusher | null = null

    private getClient() {
        if (!this.client) {
            const config = readPusherConfig()
            this.client = new Pusher({
                appId: config.appId,
                key: config.key,
                secret: config.secret,
                host: config.host,
                port: String(config.port),
                useTLS: config.scheme === "https",
                cluster: config.cluster,
            })
        }

        return this.client
    }

    getChannelName(feedbackId: string) {
        return getFeedbackChannelName(feedbackId)
    }

    async publishTimelineChanged(payload: FeedbackTimelineChangedPayload) {
        await this.getClient().trigger(
            this.getChannelName(payload.feedbackId),
            FEEDBACK_PUSHER_EVENTS.timelineChanged,
            payload,
        )
    }
}
