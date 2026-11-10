import { createHash, randomUUID } from "node:crypto"
import { createOpenAICompatible, type MetadataExtractor, type OpenAICompatibleProvider } from "@ai-sdk/openai-compatible"
import { APP_VERSION } from "@/lib/config/version"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import type { AiModelDto } from "./providers"
import { AiProviderError } from "./errors"

/**
 * OpenCode Go — SOMENTE servidor. Gateway de inferência da assinatura Go (chave `oc_sk_…`), pela API
 * OpenAI-compatível: gera texto sem abrir sessão no servidor OpenCode do host. Lista de modelos pela
 * REST `/models`; geração pelo `@ai-sdk/openai-compatible`.
 *
 * O Go pede um `x-opencode-session` estável por conversa (roteamento e cache de prompt) e um
 * `User-Agent` próprio. A resposta traz o custo e o allowance da assinatura, que viram
 * `providerMetadata["opencode-go"]` no `finish-step`.
 */

export const OPENCODE_GO_API_URL = "https://opencode.ai/inference/go/openai/v1"
export const OPENCODE_GO_USER_AGENT = `dndicas/${APP_VERSION}`
/** Chave de `providerMetadata` com o custo/allowance informados pelo Go. */
export const OPENCODE_GO_METADATA_KEY = "opencode-go"

async function getOpencodeGoApiKey(): Promise<string> {
    const { apiKey } = await getIntegrationConfig("ai_opencode_go")
    if (!apiKey) throw new AiProviderError("OpenCode Go sem API key: configure em Integrações › Provedores de IA › OpenCode Go")
    return apiKey
}

/** Modelos `*-free` só funcionam dentro do OpenCode (fora dele o Go responde 403). */
export function isOpencodeGoFreeModel(id: string): boolean {
    return /-free$/i.test(id)
}

export function toOpencodeGoModel(raw: { id: string }): AiModelDto {
    const family = raw.id.split(/[-/]/)[0]
    return {
        id: raw.id,
        name: raw.id,
        variants: [],
        group: family || null,
        contextWindow: null,
        free: isOpencodeGoFreeModel(raw.id),
    }
}

export async function listOpencodeGoModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    const apiKey = await getOpencodeGoApiKey()
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_opencode_go"), "OpenCode Go", `${OPENCODE_GO_API_URL}/models`, {
            headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": OPENCODE_GO_USER_AGENT },
            cache: "no-store",
            signal,
        })
    } catch (error) {
        throw new AiProviderError(`Não foi possível conectar ao OpenCode Go: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (res.status === 401 || res.status === 403) throw new AiProviderError(`O OpenCode Go recusou a API key (HTTP ${res.status}): confira a chave oc_sk_… da assinatura Go`)
    if (!res.ok) throw new AiProviderError(`O OpenCode Go respondeu HTTP ${res.status}`)
    const body = (await res.json()) as { data?: { id: string }[] }
    return (body.data ?? []).filter((item) => typeof item?.id === "string").map(toOpencodeGoModel).sort((a, b) => a.id.localeCompare(b.id))
}

/** Id do `x-opencode-session`: estável para a mesma chave de conversa (sem expor ids internos); sem chave, um por geração. */
export function opencodeGoSessionId(sessionKey?: string | null): string {
    if (!sessionKey) return `dndicas-${randomUUID()}`
    return `dndicas-${createHash("sha256").update(sessionKey).digest("hex").slice(0, 32)}`
}

/**
 * Cobrança informada pelo Go (`providerMetadata["opencode-go"]`). No plano Go o `cost` cobrado vem 0 e o
 * gasto real sai do `allowance` (USD descontados dos limites da assinatura); no Extra Usage vem em `cost`.
 * `costUsd` é a soma dos dois: o valor registrado no painel de consumo.
 */
export interface OpencodeGoBilling {
    cost: number | null
    allowance: number | null
    listCost: number | null
    billingSource: string | null
    costUsd: number | null
}

function finite(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
    return null
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * Lê a cobrança de um corpo ou chunk: `cost` e `opencode.{billing_source, allowance, list_cost}`, na raiz
 * ou dentro de `usage` (no stream, o chunk final de uso traz `usage.cost` e `usage.opencode`).
 */
export function readOpencodeGoBilling(body: unknown): Partial<OpencodeGoBilling> {
    const root = record(body)
    if (!root) return {}
    const usage = record(root.usage)
    const opencode = record(root.opencode) ?? record(usage?.opencode)
    const out: Partial<OpencodeGoBilling> = {}
    const cost = finite(root.cost) ?? finite(usage?.cost) ?? finite(opencode?.cost)
    if (cost !== null) out.cost = cost
    const allowance = finite(opencode?.allowance)
    if (allowance !== null) out.allowance = allowance
    const listCost = finite(opencode?.list_cost)
    if (listCost !== null) out.listCost = listCost
    if (typeof opencode?.billing_source === "string") out.billingSource = opencode.billing_source
    return out
}

type ProviderMetadata = NonNullable<ReturnType<ReturnType<MetadataExtractor["createStreamExtractor"]>["buildMetadata"]>>

function toMetadata(billing: Partial<OpencodeGoBilling>): ProviderMetadata | undefined {
    const cost = billing.cost ?? null
    const allowance = billing.allowance ?? null
    const listCost = billing.listCost ?? null
    const billingSource = billing.billingSource ?? null
    if (cost === null && allowance === null && listCost === null && billingSource === null) return undefined
    const costUsd = cost === null && allowance === null ? null : (cost ?? 0) + (allowance ?? 0)
    return { [OPENCODE_GO_METADATA_KEY]: { cost, allowance, listCost, billingSource, costUsd } }
}

export const opencodeGoMetadataExtractor: MetadataExtractor = {
    extractMetadata: async ({ parsedBody }) => toMetadata(readOpencodeGoBilling(parsedBody)),
    createStreamExtractor: () => {
        const billing: Partial<OpencodeGoBilling> = {}
        return {
            processChunk(parsedChunk) {
                Object.assign(billing, readOpencodeGoBilling(parsedChunk))
            },
            buildMetadata: () => toMetadata(billing),
        }
    },
}

/** `fetch` que fixa o `User-Agent` próprio (o Go recusa o nome genérico da SDK). */
export const opencodeGoFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set("User-Agent", OPENCODE_GO_USER_AGENT)
    return fetch(input, { ...init, headers })
}

export async function createOpencodeGoProvider(options: { sessionKey?: string | null } = {}): Promise<OpenAICompatibleProvider> {
    return createOpenAICompatible({
        name: OPENCODE_GO_METADATA_KEY,
        baseURL: OPENCODE_GO_API_URL,
        apiKey: await getOpencodeGoApiKey(),
        headers: { "x-opencode-session": opencodeGoSessionId(options.sessionKey) },
        includeUsage: true,
        metadataExtractor: opencodeGoMetadataExtractor,
        fetch: opencodeGoFetch,
    })
}
