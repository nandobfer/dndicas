export interface PusherBrowserConfig {
    key: string
    wsHost: string
    wsPort: number
    wssPort: number
    forceTLS: boolean
    enabledTransports: Array<"ws" | "wss">
    cluster: string
    /** Caminho do proxy (`wsPath` do pusher-js), quando a URL pública do cliente tem prefixo. */
    wsPath?: string
    /** Rota que autoriza canais privados (`/api/pusher/auth`). */
    authEndpoint?: string
}

export interface PusherPublicConfig {
    key: string
    host: string
    port: number
    scheme: "http" | "https"
    cluster: string
}

export interface PusherBrowserConfigErrorResponse {
    error: string
}
