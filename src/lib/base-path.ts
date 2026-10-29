/**
 * Subcaminho público do app (`basePath` do Next), ex.: `/dev_automacao/tarefas-fernando` quando
 * publicado atrás de um proxy com prefixo. Vem de `NEXT_PUBLIC_BASE_PATH` e entra no bundle no
 * build: mudar exige novo build. Vazio = app na raiz. Módulo PURO (servidor, navegador e
 * `next.config.ts`).
 *
 * O Next prefixa sozinho `Link`, `router` e `redirect`; caminhos montados à mão (axios, `fetch`,
 * Pusher, chamadas do servidor a si mesmo) passam por `withBasePath`.
 */

/** `""` ou `/segmento[/segmento...]` (com barra inicial, sem barra final). */
export function normalizeBasePath(raw: string | undefined | null): string {
    const value = raw?.trim().replace(/^\/+|\/+$/g, "") ?? ""
    return value ? `/${value}` : ""
}

export const BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH)

/** Caminho absoluto do app (`/api/...`) com o subcaminho público na frente. */
export function withBasePath(path: string, basePath: string = BASE_PATH): string {
    return `${basePath}${path.startsWith("/") ? path : `/${path}`}`
}

/** Acrescenta o subcaminho a uma URL absoluta (`http://host:porta`), sem duplicar quando ela já termina nele. */
export function appendBasePath(url: string, basePath: string = BASE_PATH): string {
    const trimmed = url.replace(/\/+$/, "")
    if (!basePath || trimmed.endsWith(basePath)) return trimmed
    return `${trimmed}${basePath}`
}
