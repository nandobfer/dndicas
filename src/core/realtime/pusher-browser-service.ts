"use client"

import Pusher, { type Channel } from "pusher-js"

export interface PusherBrowserConfig {
    key: string
    cluster: string
    wsHost: string
    wsPort: number
    wssPort: number
    forceTLS: boolean
    enabledTransports: Array<"ws" | "wss">
}

/**
 * Centralises the browser-side Pusher client lifecycle.
 *
 * Keeping this as a small class avoids scattering connection setup and teardown
 * across hooks, which makes it easier to reuse the same realtime transport in
 * future screens.
 */
export class PusherBrowserService {
    private static instance: PusherBrowserService | null = null
    private client: Pusher | null = null
    private configKey: string | null = null

    static getInstance(): PusherBrowserService {
        if (!PusherBrowserService.instance) {
            PusherBrowserService.instance = new PusherBrowserService()
        }

        return PusherBrowserService.instance
    }

    /**
     * Returns a shared Pusher client instance configured for the current app.
     */
    getClient(config: PusherBrowserConfig): Pusher {
        const nextConfigKey = JSON.stringify(config)
        if (!this.client || this.configKey !== nextConfigKey) {
            this.client?.disconnect()
            this.client = new Pusher(config.key, {
                cluster: config.cluster,
                wsHost: config.wsHost,
                wsPort: config.wsPort,
                wssPort: config.wssPort,
                forceTLS: config.forceTLS,
                enabledTransports: config.enabledTransports,
                disableStats: true,
            })
            this.configKey = nextConfigKey
        }

        return this.client
    }

    /**
     * Subscribes to a channel using the shared client instance.
     */
    subscribe(config: PusherBrowserConfig, channelName: string): Channel {
        return this.getClient(config).subscribe(channelName)
    }

    /**
     * Removes a channel subscription without closing the shared socket.
     */
    unsubscribe(channelName: string) {
        this.client?.unsubscribe(channelName)
    }

    /**
     * Fully disconnects the underlying socket when the app no longer needs it.
     */
    disconnect() {
        this.client?.disconnect()
        this.client = null
        this.configKey = null
    }
}
