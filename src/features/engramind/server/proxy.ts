import { createEngramindProxy, matchProxyRoute, proxySegments } from "@engramind/client/server"
import { withBasePath } from "@/lib/base-path"
import { DomainError } from "@/lib/api/route"
import { MEMORIES_EDIT_PERMISSION, MEMORIES_VIEW_PERMISSION } from "../constants"
import { proxyAccessOf, READ_ONLY_MESSAGE } from "../proxy-policy"
import { engramindAppClient } from "./client"
import { AcaoAuditoria, auditEngramind, engramindLog, messageOf } from "./shared"

/**
 * Proxy dos componentes da lib (`@engramind/client/react`) no modo `app`, com o token de app (que
 * nunca vai ao navegador). Antes de repassar: login + `memories.view` (leitura) ou `memories.edit`
 * (importação), conferidos no servidor, e a lista de permissão (`proxy-policy.ts`).
 */

export const PROXY_BASE_PATH = "/api/engramind"

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })

/** Prefixo do caminho recebido (com o subcaminho público quando a requisição chega com ele). */
function basePathOf(url: URL): string {
    const prefixed = withBasePath(PROXY_BASE_PATH)
    return url.pathname.startsWith(prefixed) ? prefixed : PROXY_BASE_PATH
}

function operationOf(request: Request): string | null {
    const url = new URL(request.url)
    const segments = proxySegments(url.pathname, basePathOf(url))
    return segments ? (matchProxyRoute(request.method, segments, "app")?.route.operation ?? null) : null
}

export async function handleProxy(request: Request): Promise<Response> {
    const operation = operationOf(request)
    const access = proxyAccessOf(operation)
    if (access === "blocked") return json(403, { success: false, error: READ_ONLY_MESSAGE, code: "ENGRAMIND_READ_ONLY" })
    let actorId: string
    try {
        const { requirePermissionActor } = await import("@/features/auth/server/actor")
        actorId = (await requirePermissionActor(access === "edit" ? MEMORIES_EDIT_PERMISSION : MEMORIES_VIEW_PERMISSION)).id
    } catch (error) {
        if (error instanceof DomainError) return json(error.status, { success: false, error: error.message, code: error.code })
        throw error
    }
    const basePath = basePathOf(new URL(request.url))
    const proxy = createEngramindProxy({
        client: engramindAppClient,
        mode: "app",
        basePath,
        onMutation: async (mutation) => {
            const body = (mutation.body && typeof mutation.body === "object" ? mutation.body : {}) as { channel?: unknown; memories?: unknown }
            await auditEngramind(actorId, mutation.operation, AcaoAuditoria.IMPORTAR, {
                canal: typeof body.channel === "string" ? body.channel : null,
                memorias: Array.isArray(body.memories) ? body.memories.length : null,
            })
        },
        onError: (error, route) => engramindLog.warn({ operation: route?.operation ?? null, err: messageOf(error) }, "[engramind] proxy da rede falhou"),
    })
    return proxy(request)
}
