import { createOpencode, type OpencodeProvider } from "ai-sdk-provider-opencode-sdk"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import type { AiAgentDto, AiModelDto } from "./providers"
import { AiProviderError } from "./errors"

/**
 * Servidor OpenCode 2.x (`opencode serve`) — SOMENTE servidor. Catálogo (modelos, agentes) pelas
 * rotas HTTP do servidor; geração pelo provider da Vercel AI SDK (`ai-sdk-provider-opencode-sdk`).
 * Autenticação Basic `opencode:<senha>` em toda rota.
 */

const OPENCODE_USER = "opencode"

export interface OpencodeConnection {
    baseUrl: string
    headers: Record<string, string>
    directory?: string
}

export async function getOpencodeConnection(): Promise<OpencodeConnection> {
    const config = await getIntegrationConfig("ai_opencode")
    const baseUrl = config.baseUrl?.trim().replace(/\/+$/, "")
    if (!baseUrl) throw new AiProviderError("OpenCode sem URL do servidor: configure em Integrações › Provedores de IA › OpenCode")
    const headers: Record<string, string> = { Accept: "application/json" }
    if (config.password) headers.Authorization = `Basic ${Buffer.from(`${OPENCODE_USER}:${config.password}`).toString("base64")}`
    return { baseUrl, headers, directory: config.directory?.trim() || undefined }
}

/** GET numa rota do servidor; erros viram mensagens acionáveis em pt-BR. */
export async function opencodeGet<T>(path: string, signal?: AbortSignal, connection?: OpencodeConnection): Promise<T> {
    const conn = connection ?? (await getOpencodeConnection())
    const query = conn.directory && path !== "/api/info" ? `?location[directory]=${encodeURIComponent(conn.directory)}` : ""
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_opencode"), "OpenCode", `${conn.baseUrl}${path}${query}`, { headers: conn.headers, cache: "no-store", signal })
    } catch (error) {
        throw new AiProviderError(`Não foi possível conectar ao OpenCode em ${conn.baseUrl}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (res.status === 401) throw new AiProviderError("O OpenCode recusou a senha (HTTP 401): confira a senha do servidor")
    if (res.status === 404 && path === "/api/info") throw new AiProviderError("Servidor sem /api/info: é um OpenCode 1.x ou incompatível (use o 2.x)")
    if (res.status === 404 && conn.directory)
        throw new AiProviderError(`O OpenCode respondeu HTTP 404 em ${path}: confira se o diretório das sessões existe na máquina do OpenCode ("${conn.directory}")`)
    if (!res.ok) throw new AiProviderError(`O OpenCode respondeu HTTP ${res.status} em ${path}`)
    return (await res.json()) as T
}

interface OpencodeModelRaw {
    id: string
    providerID: string
    name?: string
    enabled?: boolean
    status?: string
    variants?: { id: string }[]
    cost?: { input?: number; output?: number; tier?: unknown }[]
    limit?: { context?: number }
}

export function toOpencodeModel(raw: OpencodeModelRaw): AiModelDto {
    const base = raw.cost?.find((tier) => !tier.tier) ?? raw.cost?.[0]
    return {
        id: `${raw.providerID}/${raw.id}`,
        name: raw.name ?? raw.id,
        variants: (raw.variants ?? []).map((variant) => variant.id),
        group: raw.providerID,
        contextWindow: raw.limit?.context ?? null,
        free: Boolean(base && !base.input && !base.output),
    }
}

export async function listOpencodeModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    const body = await opencodeGet<{ data?: OpencodeModelRaw[] }>("/api/model", signal)
    return (body.data ?? [])
        .filter((model) => model.enabled !== false && model.status !== "deprecated")
        .map(toOpencodeModel)
        .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name))
}

interface OpencodeAgentRaw {
    id: string
    name?: string
    description?: string
    mode?: string
    hidden?: boolean
}

/** Agentes que podem conduzir uma sessão (primários e visíveis). */
export async function listOpencodeAgents(signal?: AbortSignal): Promise<AiAgentDto[]> {
    const body = await opencodeGet<{ data?: OpencodeAgentRaw[] }>("/api/agent", signal)
    return (body.data ?? [])
        .filter((agent) => agent.mode !== "subagent" && !agent.hidden)
        .map((agent) => ({ id: agent.id, name: agent.name ?? agent.id, description: agent.description ?? null }))
}

export async function getOpencodeInfo(signal?: AbortSignal): Promise<{ version: string }> {
    const info = await opencodeGet<{ version?: string }>("/api/info", signal)
    if (!info.version?.startsWith("2.")) throw new AiProviderError(`Versão do OpenCode incompatível (${info.version ?? "desconhecida"}): use o 2.x`)
    return { version: info.version }
}

/** Provider da Vercel AI SDK para uma chamada; descarte com `dispose()` ao terminar. */
export async function createOpencodeProvider(): Promise<{ provider: OpencodeProvider; directory?: string }> {
    const conn = await getOpencodeConnection()
    const { Accept: _accept, ...headers } = conn.headers
    void _accept
    return { provider: createOpencode({ baseUrl: conn.baseUrl, clientOptions: { headers } }), directory: conn.directory }
}
