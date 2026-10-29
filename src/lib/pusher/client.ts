import Pusher from "pusher-js"
import type { Channel, Options } from "pusher-js"
import { withBasePath } from "@/lib/base-path"
import { parsePusherClientUrls, pickPusherClientEndpoint } from "./url"

let _client: Pusher | null = null

export interface PusherClientConfig {
    key?: string
    /** `host`: servidor próprio (ex.: Soketi) pela `url`; ausente ou `cluster`: Pusher na nuvem. */
    mode?: string
    cluster?: string
    url?: string
}

const AUTH_ENDPOINT = withBasePath("/api/pusher/auth")

/**
 * Configuração pública do cliente. Injetada em runtime pelo layout raiz a partir da integração
 * "Pusher" (nada vem do build: o `NEXT_PUBLIC_PUSHER_*` deixou de existir).
 */
let _config: PusherClientConfig = {}

function currentPage(): { hostname: string; protocol: string } | undefined {
    return typeof window === "undefined" ? undefined : window.location
}

/**
 * Opções do `pusher-js`. Modo `host`: WebSocket direto no host/porta (e caminho, via `wsPath`)
 * do endereço que combina com a página aberta (sem fallback HTTP nem estatísticas do Pusher).
 * `null` quando falta key, cluster ou URL válida.
 */
export function buildPusherClientOptions(
    config: PusherClientConfig,
    page: { hostname: string; protocol: string } | undefined = currentPage(),
): Options | null {
    if (!config.key) return null
    if (config.mode === "host") {
        const endpoint = pickPusherClientEndpoint(parsePusherClientUrls(config.url) ?? [], page)
        if (!endpoint) return null
        return {
            cluster: "",
            wsHost: endpoint.host,
            wsPort: endpoint.port,
            wssPort: endpoint.port,
            ...(endpoint.path ? { wsPath: endpoint.path } : {}),
            forceTLS: endpoint.useTLS,
            enabledTransports: ["ws", "wss"],
            disableStats: true,
            authEndpoint: AUTH_ENDPOINT,
        }
    }
    if (!config.cluster) return null
    return { cluster: config.cluster, authEndpoint: AUTH_ENDPOINT }
}

export function configurePusherClient(config: PusherClientConfig): void {
    const next: PusherClientConfig = {
        key: config.key?.trim() || _config.key,
        mode: config.mode?.trim() || _config.mode,
        cluster: config.cluster?.trim() || _config.cluster,
        url: config.url?.trim() || _config.url,
    }
    if (JSON.stringify(next) === JSON.stringify(_config)) return
    _config = next
    if (_client) {
        _client.disconnect()
        _client = null
    }
}

/** `false` quando a configuração pública está incompleta — telas caem no modo "Atualizar". */
export function isPusherClientAvailable(): boolean {
    return buildPusherClientOptions(_config) !== null
}

/**
 * Returns the singleton Pusher client for browser-side subscriptions.
 * Must only be called within client-side code (e.g., inside useEffect).
 */
export function getPusherClient(): Pusher {
    if (typeof window === "undefined") {
        throw new Error("getPusherClient() must only be called client-side")
    }
    if (!_client) {
        const options = buildPusherClientOptions(_config) ?? { cluster: _config.cluster ?? "", authEndpoint: AUTH_ENDPOINT }
        _client = new Pusher(_config.key ?? "", options)
    }
    return _client
}

/**
 * Contagem de referências por canal. O client Pusher é singleton e o pusher-js
 * dedup canais por nome (vários `subscribe("x")` → mesmo `Channel`), mas
 * `unsubscribe("x")` derruba o canal INTEIRO — todos os `bind` de todos os
 * consumidores. Quando dois hooks/serviços assinam o mesmo canal (ex.: o sidebar
 * via `useNegotiationsLiveUpdates` e o `BrowserNotificationService`), o cleanup de
 * um faria o outro parar de receber eventos. O ref-count abaixo garante que o
 * `unsubscribe` só aconteça quando o ÚLTIMO consumidor soltar o canal.
 */
const _channelRefCounts = new Map<string, number>()

/**
 * Assina o canal (idempotente) e incrementa a contagem de referências.
 * Use no mount; cada `acquireChannel` deve ter exatamente um `releaseChannel` no cleanup.
 * O consumidor continua responsável por `channel.bind`/`channel.unbind` do seu handler.
 */
export function acquireChannel(channelName: string): Channel {
    const channel = getPusherClient().subscribe(channelName)
    _channelRefCounts.set(channelName, (_channelRefCounts.get(channelName) ?? 0) + 1)
    return channel
}

/**
 * Libera uma referência do canal; só faz `unsubscribe` quando chega a zero
 * (último consumidor). Faça `channel.unbind(...)` do seu handler ANTES de chamar.
 */
export function releaseChannel(channelName: string): void {
    const next = (_channelRefCounts.get(channelName) ?? 1) - 1
    if (next <= 0) {
        _channelRefCounts.delete(channelName)
        getPusherClient().unsubscribe(channelName)
    } else {
        _channelRefCounts.set(channelName, next)
    }
}
