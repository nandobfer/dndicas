import "server-only"

import { pusher as integrationPusher } from "@/lib/pusher/server"
import { getPusherPublicConfig } from "@/lib/pusher/public-config"
import { buildPusherClientOptions } from "@/lib/pusher/client"
import type { PusherBrowserConfig } from "./pusher-config"

/**
 * Centralises the server-side Pusher publish API.
 *
 * A configuração não vem mais do `.env`: é a integração "Pusher" (Integrações › Pusher, banco →
 * `.env` legado), resolvida a cada uso — o cliente do SDK é recriado quando a configuração muda
 * (`src/lib/pusher/server.ts`). A API pública desta classe continua a mesma para os consumidores.
 */
export class PusherService {
    private static instance: PusherService | null = null

    static getInstance(): PusherService {
        if (!PusherService.instance) {
            PusherService.instance = new PusherService()
        }

        return PusherService.instance
    }

    private constructor() {}

    /** Mantido por compatibilidade: a publicação falha com mensagem acionável quando não configurado. */
    isEnabled(): boolean {
        return true
    }

    /**
     * Returns the browser-safe subset of the Pusher configuration, já escolhendo o endereço público
     * que combina com a página (`page`) quando a integração usa host próprio com vários endereços.
     */
    async getClientConfig(page?: { hostname: string; protocol: string }): Promise<PusherBrowserConfig> {
        const publicConfig = await getPusherPublicConfig()
        const options = buildPusherClientOptions(publicConfig, page)
        if (!options || !publicConfig.key) {
            throw new Error("Pusher não configurado: revise Integrações › Pusher.")
        }
        return buildPusherBrowserConfig(publicConfig.key, options)
    }

    /**
     * Publishes an event to a single channel.
     */
    async trigger<TPayload>(channel: string, event: string, payload: TPayload) {
        await integrationPusher.trigger(channel, event, payload)
    }
}

type ClientOptions = NonNullable<ReturnType<typeof buildPusherClientOptions>>

export function buildPusherBrowserConfig(key: string, options: ClientOptions): PusherBrowserConfig {
    if (!options.wsHost) {
        // Pusher na nuvem (cluster): o pusher-js resolve host e porta pelo cluster.
        return {
            key,
            wsHost: `ws-${options.cluster}.pusher.com`,
            wsPort: 80,
            wssPort: 443,
            forceTLS: true,
            enabledTransports: ["ws", "wss"],
            cluster: options.cluster,
            authEndpoint: options.authEndpoint,
        }
    }
    return {
        key,
        wsHost: options.wsHost,
        wsPort: options.wsPort ?? 80,
        wssPort: options.wssPort ?? 443,
        ...(options.wsPath ? { wsPath: options.wsPath } : {}),
        forceTLS: options.forceTLS ?? false,
        enabledTransports: ["ws"],
        cluster: options.cluster || "mt1",
        authEndpoint: options.authEndpoint,
    }
}
