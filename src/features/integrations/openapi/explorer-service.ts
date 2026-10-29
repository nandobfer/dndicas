import { recordAudit, AcaoAuditoria } from "@/lib/db"
import { getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import { getIntegration } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { maskSensitive } from "@/lib/integrations/log-format"
import { INTEGRATION_AUDIT_ENTITY } from "../services/integration-service"
import { resolveExplorerTarget } from "./adapters"
import { fetchWithTimeout, isTimeoutError, readLimitedText } from "./http"
import { loadOpenApiSpec } from "./spec-source"
import {
    isMutatingMethod,
    type ExplorerExecuteInput,
    type ExplorerExecuteResult,
    type ExplorerOperation,
    type ExplorerSpecDto,
} from "./types"

/**
 * Explorador da documentação Swagger (OpenAPI 3.x) de uma integração.
 *
 * Segurança:
 * - Só executa operações que EXISTEM na especificação carregada; o caminho é montado a partir
 *   do template da operação com os parâmetros codificados — nada de URL livre.
 * - A URL base vem do campo configurado no catálogo (adaptador) ou, sem adaptador, do primeiro
 *   `servers` da especificação (resolvido contra a URL da documentação).
 * - As credenciais só vão quando o destino tem a mesma origem da URL base do adaptador; o
 *   cliente não sobrescreve `Authorization`, `Host`, `Cookie` nem os cabeçalhos do adaptador —
 *   exceto o `Authorization` quando o adaptador declara `clientAuthorization` (API interna).
 * - Métodos que alteram dados geram auditoria (operação, status, usuário — sem o corpo).
 */

export const EXPLORE_TIMEOUT_MS = 30_000
export const EXPLORE_MAX_RESPONSE_BYTES = 1024 * 1024
const DEBUG_BODY_PREVIEW = 4000

/** Cabeçalhos que o cliente nunca define. */
const FORBIDDEN_HEADERS = new Set([
    "authorization",
    "proxy-authorization",
    "cookie",
    "host",
    "content-length",
    "connection",
    "transfer-encoding",
    "x-sap-authorization",
])

/** Cabeçalhos de resposta devolvidos ao cliente. */
const EXPOSED_RESPONSE_HEADERS = ["content-type", "content-length", "date", "location", "x-request-id", "retry-after", "etag", "cache-control"]

export class ExplorerError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 404 | 409 | 502 | 504 = 400,
    ) {
        super(message)
        this.name = "ExplorerError"
    }
}

async function requireSwaggerUrl(id: IntegrationId): Promise<string> {
    const resolved = await getIntegration(id)
    if (!resolved.swaggerUrl) throw new ExplorerError("Cadastre a Documentação Swagger (OpenAPI) da integração para explorar", 409)
    return resolved.swaggerUrl
}

/** Base efetiva das execuções: adaptador → `servers[0]` → origem da documentação. */
function effectiveBaseUrl(adapterBase: string | null, servers: string[], specUrl: string): string {
    if (adapterBase) return adapterBase
    const server = servers.find((s) => !s.includes("{"))
    try {
        if (server) return new URL(server, specUrl).toString().replace(/\/+$/, "")
        return new URL(specUrl).origin
    } catch {
        return new URL(specUrl).origin
    }
}

export async function getExplorerSpec(id: IntegrationId, options: { refresh?: boolean } = {}): Promise<ExplorerSpecDto> {
    const swaggerUrl = await requireSwaggerUrl(id)
    const loaded = await loadOpenApiSpec(swaggerUrl, options)
    const resolved = await getIntegration(id)
    const target = await resolveExplorerTarget(id, resolved.values)
    return {
        spec: loaded.spec,
        specUrl: loaded.specUrl,
        baseUrl: effectiveBaseUrl(target.baseUrl, loaded.spec.servers, loaded.specUrl),
        auth: target.hasAdapter ? (getIntegrationDef(id).explorer?.authLabel ?? null) : null,
        authReady: target.authReady,
        clientAuthorization: target.clientAuthorization,
        fetchedAt: loaded.fetchedAt,
    }
}

/** Monta o caminho da operação: `{param}` obrigatório e codificado; sobras são recusadas. */
export function buildOperationPath(operation: ExplorerOperation, values: Record<string, string> = {}): string {
    const path = operation.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
        const value = values[name]
        if (value === undefined || value === "") throw new ExplorerError(`Informe o parâmetro de caminho "${name}"`)
        return encodeURIComponent(value)
    })
    return path
}

export function buildTargetUrl(baseUrl: string, path: string, query: ExplorerExecuteInput["query"] = {}): URL {
    const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
    // Caminho da operação é relativo à base (inclusive quando a base tem prefixo, ex.: /api).
    const url = new URL(path.replace(/^\/+/, ""), base)
    for (const [key, value] of Object.entries(query)) {
        for (const item of Array.isArray(value) ? value : [value]) {
            if (item !== undefined && item !== "") url.searchParams.append(key, item)
        }
    }
    return url
}

function sanitizeClientHeaders(headers: Record<string, string> = {}, allowAuthorization = false): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(headers)) {
        const lower = name.trim().toLowerCase()
        if (!lower || /[\r\n]/.test(value)) continue
        if (FORBIDDEN_HEADERS.has(lower) && !(allowAuthorization && lower === "authorization")) continue
        out[name.trim()] = value
    }
    return out
}

function preview(text: string): string {
    return text.length > DEBUG_BODY_PREVIEW ? `${text.slice(0, DEBUG_BODY_PREVIEW)}… (${text.length} caracteres)` : text
}

export async function executeExplorerOperation(
    id: IntegrationId,
    input: ExplorerExecuteInput,
    actorId: string,
    signal?: AbortSignal,
): Promise<ExplorerExecuteResult> {
    const swaggerUrl = await requireSwaggerUrl(id)
    const loaded = await loadOpenApiSpec(swaggerUrl)
    const operation = loaded.spec.operations.find((op) => op.key === input.operation)
    if (!operation) throw new ExplorerError("Operação não encontrada na especificação. Recarregue a documentação.", 404)

    const resolved = await getIntegration(id)
    const target = await resolveExplorerTarget(id, resolved.values)
    const baseUrl = effectiveBaseUrl(target.baseUrl, loaded.spec.servers, loaded.specUrl)
    const url = buildTargetUrl(baseUrl, buildOperationPath(operation, input.path), input.query)

    // Credenciais só para a origem configurada no adaptador.
    const sameOrigin = target.baseUrl !== null && new URL(target.baseUrl).origin === url.origin
    const headers: Record<string, string> = {
        Accept: "application/json, */*;q=0.8",
        // `Authorization` do cliente só quando o adaptador permite (API interna, sem credencial injetada).
        ...sanitizeClientHeaders(input.headers, sameOrigin && target.clientAuthorization),
        ...(sameOrigin ? target.authHeaders : {}),
    }
    const hasBody = input.body !== undefined && input.body !== "" && operation.method !== "get" && operation.method !== "head"
    if (hasBody) headers["Content-Type"] = operation.requestBody?.contentType ?? "application/json"

    const dbg = integrationDebug(id)
    const method = operation.method.toUpperCase()
    const secrets = Object.values(target.authHeaders)
    dbg.request(`[explorar] ${method} ${url.pathname}${url.search}`, {
        operation: operation.operationId ?? operation.key,
        headers: maskSensitive(headers, secrets),
        ...(hasBody ? { body: preview(input.body!) } : {}),
    })

    const startedAt = Date.now()
    let response: Response
    try {
        response = await fetchWithTimeout(
            url.toString(),
            { method, headers, body: hasBody ? input.body : undefined, redirect: "manual" },
            EXPLORE_TIMEOUT_MS,
            signal,
        )
    } catch (error) {
        const latencyMs = Date.now() - startedAt
        if (isTimeoutError(error) && !signal?.aborted) {
            dbg.error(`[explorar] ${method} ${url.pathname} → sem resposta em ${EXPLORE_TIMEOUT_MS / 1000}s`)
            throw new ExplorerError(`A integração não respondeu em ${EXPLORE_TIMEOUT_MS / 1000} segundos`, 504)
        }
        dbg.error(`[explorar] ${method} ${url.pathname} → falha de rede após ${latencyMs} ms`, error)
        throw new ExplorerError("Não foi possível conectar à integração", 502)
    }

    const { text, truncated } = await readLimitedText(response, EXPLORE_MAX_RESPONSE_BYTES)
    const latencyMs = Date.now() - startedAt
    const responseHeaders: Record<string, string> = {}
    for (const name of EXPOSED_RESPONSE_HEADERS) {
        const value = response.headers.get(name)
        if (value) responseHeaders[name] = value
    }
    const body = String(maskSensitive(text, secrets))

    const level = response.status >= 400 ? "warn" : "response"
    dbg[level](`[explorar] ${method} ${url.pathname} → ${response.status} (${latencyMs} ms)`, {
        status: response.status,
        body: preview(body),
        ...(truncated ? { truncated: true } : {}),
    })

    if (isMutatingMethod(operation.method)) {
        await recordAudit({
            userId: actorId,
            entidade: INTEGRATION_AUDIT_ENTITY,
            entidadeId: id,
            acao: AcaoAuditoria.ATUALIZAR,
            depois: {
                explorador: `${method} ${operation.path}`,
                operacao: operation.operationId ?? operation.key,
                status: response.status,
            },
        })
    }

    return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        contentType: response.headers.get("content-type"),
        body,
        truncated,
        latencyMs,
        url: `${url.origin}${url.pathname}${url.search}`,
    }
}
