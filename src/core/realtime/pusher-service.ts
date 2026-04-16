import "server-only"

import Pusher from "pusher"

export interface PusherServerConfig {
    appId: string
    key: string
    secret: string
    host: string
    port: number
    scheme: "http" | "https"
    cluster: string
}

export interface PusherClientConfig {
    key: string
    wsHost: string
    wsPort: number
    wssPort: number
    forceTLS: boolean
    enabledTransports: Array<"ws" | "wss">
    cluster: string
}

/**
 * Centralises the server-side Pusher SDK configuration and publish API.
 *
 * The rest of the application depends on this class instead of constructing the
 * SDK ad hoc. That keeps env parsing, validation and publish semantics in one
 * place and makes future reuse straightforward.
 */
export class PusherService {
    private static instance: PusherService | null = null

    static getInstance(): PusherService {
        if (!PusherService.instance) {
            PusherService.instance = new PusherService()
        }

        return PusherService.instance
    }

    private readonly config: PusherServerConfig
    private readonly client: Pusher

    private constructor() {
        this.config = this.readConfigFromEnv()
        this.client = new Pusher({
            appId: this.config.appId,
            key: this.config.key,
            secret: this.config.secret,
            host: this.config.host,
            port: String(this.config.port),
            useTLS: this.config.scheme === "https",
            cluster: this.config.cluster,
        })
    }

    /**
     * Indicates whether realtime publishing is configured.
     *
     * The current implementation throws during construction when configuration
     * is invalid, so this mainly serves as a readable guard for callers.
     */
    isEnabled(): boolean {
        return true
    }

    /**
     * Returns the browser-safe subset of the Pusher configuration.
     */
    getClientConfig(): PusherClientConfig {
        const forceTLS = this.config.scheme === "https"
        return {
            key: this.config.key,
            wsHost: this.config.host,
            wsPort: this.config.port,
            wssPort: this.config.port,
            forceTLS,
            enabledTransports: forceTLS ? ["wss"] : ["ws"],
            cluster: this.config.cluster,
        }
    }

    /**
     * Publishes an event to a single channel.
     */
    async trigger<TPayload>(channel: string, event: string, payload: TPayload) {
        await this.client.trigger(channel, event, payload)
    }

    private readConfigFromEnv(): PusherServerConfig {
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
        if (!Number.isFinite(port)) {
            throw new Error("PUSHER_PORT deve ser um número válido.")
        }

        if (scheme !== "http" && scheme !== "https") {
            throw new Error("PUSHER_SCHEME deve ser 'http' ou 'https'.")
        }

        return {
            appId,
            key,
            secret,
            host,
            port,
            scheme,
            cluster,
        }
    }
}
