/**
 * URL de um servidor compatível com o protocolo do Pusher (ex.: Soketi) — módulo PURO,
 * usado pelo servidor, pelo navegador e pela validação do formulário.
 *
 * `http`/`ws` = sem TLS; `https`/`wss` = com TLS. Sem porta explícita, usa 80/443. Só a
 * origem é aceita: caminho, query ou fragmento tornam a URL inválida.
 */

export interface PusherEndpoint {
    host: string
    port: number
    useTLS: boolean
}

const TLS_PROTOCOLS = new Set(["https:", "wss:"])
const PLAIN_PROTOCOLS = new Set(["http:", "ws:"])

/** `null` quando a URL está vazia ou não é uma origem http(s)/ws(s) válida. */
export function parsePusherUrl(raw: string | undefined | null): PusherEndpoint | null {
    const value = raw?.trim()
    if (!value) return null
    let url: URL
    try {
        url = new URL(value)
    } catch {
        return null
    }
    const useTLS = TLS_PROTOCOLS.has(url.protocol)
    if (!useTLS && !PLAIN_PROTOCOLS.has(url.protocol)) return null
    if (!url.hostname || url.username || url.password) return null
    if ((url.pathname !== "" && url.pathname !== "/") || url.search || url.hash) return null
    const port = url.port ? Number(url.port) : useTLS ? 443 : 80
    return { host: url.hostname, port, useTLS }
}

export function isValidPusherUrl(raw: string | undefined | null): boolean {
    return parsePusherUrl(raw) !== null
}

/** Endereço do navegador: além da origem, aceita caminho (proxy com prefixo → `wsPath`). */
export interface PusherClientEndpoint extends PusherEndpoint {
    /** `""` ou `/segmento[/...]`, sem barra final. */
    path: string
}

function parsePusherClientUrl(value: string): PusherClientEndpoint | null {
    let url: URL
    try {
        url = new URL(value)
    } catch {
        return null
    }
    if (url.search || url.hash) return null
    const origin = parsePusherUrl(`${url.protocol}//${url.host}`)
    if (!origin || url.username || url.password) return null
    return { ...origin, path: url.pathname.replace(/\/+$/, "") }
}

/**
 * "URL pública do cliente": um ou mais endereços separados por vírgula ou espaço, cada um com
 * caminho opcional (ex.: `ws://192.168.0.64:6001, wss://reserva.exemplo.com.br/dev/soketi`).
 * `null` quando vazio ou quando algum endereço é inválido.
 */
export function parsePusherClientUrls(raw: string | undefined | null): PusherClientEndpoint[] | null {
    const parts = (raw ?? "").split(/[\s,]+/).filter(Boolean)
    if (parts.length === 0) return null
    const endpoints: PusherClientEndpoint[] = []
    for (const part of parts) {
        const endpoint = parsePusherClientUrl(part)
        if (!endpoint) return null
        endpoints.push(endpoint)
    }
    return endpoints
}

export function isValidPusherClientUrls(raw: string | undefined | null): boolean {
    return parsePusherClientUrls(raw) !== null
}

/**
 * Endereço para a página aberta: o de mesmo host; senão o de mesmo TLS (página `https` só
 * conecta em `wss`); senão o primeiro.
 */
export function pickPusherClientEndpoint(
    endpoints: PusherClientEndpoint[],
    page?: { hostname: string; protocol: string },
): PusherClientEndpoint | null {
    if (endpoints.length === 0) return null
    if (!page) return endpoints[0]
    const pageTLS = page.protocol === "https:"
    return (
        endpoints.find((e) => e.host === page.hostname && e.useTLS === pageTLS) ??
        endpoints.find((e) => e.host === page.hostname) ??
        endpoints.find((e) => e.useTLS === pageTLS) ??
        endpoints[0]
    )
}
