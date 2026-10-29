import { createAnthropic, type AnthropicProvider } from "@ai-sdk/anthropic"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { AI_REASONING_LEVELS, type AiModelDto } from "./providers"
import { AiProviderError } from "./errors"

/**
 * Anthropic (Claude) — SOMENTE servidor. Lista de modelos pela REST `v1/models`; geração pelo
 * `@ai-sdk/anthropic` (Vercel AI SDK).
 */

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1"
const ANTHROPIC_VERSION = "2023-06-01"

async function getAnthropicApiKey(): Promise<string> {
    const { apiKey } = await getIntegrationConfig("ai_anthropic")
    if (!apiKey) throw new AiProviderError("Anthropic sem API key: configure em Integrações › Provedores de IA › Anthropic")
    return apiKey
}

interface AnthropicModelRaw {
    id: string
    display_name?: string
    created_at?: string
    max_input_tokens?: number
}

/** Os Claude 3.x anteriores ao 3.7 não raciocinam (sem extended thinking). */
export function anthropicSupportsReasoning(id: string): boolean {
    return !/^claude-(instant|2|3-(?!7))/i.test(id)
}

export function toAnthropicModel(raw: AnthropicModelRaw): AiModelDto {
    return {
        id: raw.id,
        name: raw.display_name ?? raw.id,
        variants: anthropicSupportsReasoning(raw.id) ? [...AI_REASONING_LEVELS] : [],
        group: null,
        contextWindow: raw.max_input_tokens ?? null,
        free: false,
    }
}

/** Modelos da conta, do mais novo para o mais antigo. */
export async function listAnthropicModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    const apiKey = await getAnthropicApiKey()
    const models: AnthropicModelRaw[] = []
    let afterId: string | undefined
    do {
        const url = `${ANTHROPIC_API_URL}/models?limit=1000${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ""}`
        let res: Response
        try {
            res = await debugFetch(integrationDebug("ai_anthropic"), "Anthropic", url, { headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION }, cache: "no-store", signal })
        } catch (error) {
            throw new AiProviderError(`Não foi possível conectar à Anthropic: ${error instanceof Error ? error.message : String(error)}`)
        }
        if (res.status === 401 || res.status === 403) throw new AiProviderError(`A Anthropic recusou a API key (HTTP ${res.status})`)
        if (!res.ok) throw new AiProviderError(`A Anthropic respondeu HTTP ${res.status}`)
        const body = (await res.json()) as { data?: AnthropicModelRaw[]; has_more?: boolean; last_id?: string | null }
        models.push(...(body.data ?? []))
        afterId = body.has_more && body.last_id ? body.last_id : undefined
    } while (afterId)
    return models.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).map(toAnthropicModel)
}

export async function createAnthropicProvider(): Promise<AnthropicProvider> {
    return createAnthropic({ apiKey: await getAnthropicApiKey() })
}
