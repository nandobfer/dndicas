export interface PusherBrowserConfig {
    key: string
    wsHost: string
    wsPort: number
    wssPort: number
    forceTLS: boolean
    enabledTransports: Array<"ws" | "wss">
    cluster: string
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
