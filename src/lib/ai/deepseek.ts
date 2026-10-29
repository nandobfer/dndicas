import { createDeepSeek, type DeepSeekProvider } from "@ai-sdk/deepseek"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { AI_REASONING_LEVELS, type AiModelDto } from "./providers"
import { AiProviderError } from "./errors"

/**
 * DeepSeek — SOMENTE servidor. Lista de modelos pela REST `/models`; geração pelo
 * `@ai-sdk/deepseek` (Vercel AI SDK).
 */

export const DEEPSEEK_API_URL = "https://api.deepseek.com"

async function getDeepseekApiKey(): Promise<string> {
    const { apiKey } = await getIntegrationConfig("ai_deepseek")
    if (!apiKey) throw new AiProviderError("DeepSeek sem API key: configure em Integrações › Provedores de IA › DeepSeek")
    return apiKey
}

/** `deepseek-chat` é o alias sem raciocínio; os demais modelos raciocinam. */
export function deepseekSupportsReasoning(id: string): boolean {
    return !/-chat$/i.test(id)
}

export function toDeepseekModel(raw: { id: string }): AiModelDto {
    return {
        id: raw.id,
        name: raw.id,
        variants: deepseekSupportsReasoning(raw.id) ? [...AI_REASONING_LEVELS] : [],
        group: null,
        contextWindow: null,
        free: false,
    }
}

export async function listDeepseekModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    const apiKey = await getDeepseekApiKey()
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_deepseek"), "DeepSeek", `${DEEPSEEK_API_URL}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", signal })
    } catch (error) {
        throw new AiProviderError(`Não foi possível conectar à DeepSeek: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (res.status === 401 || res.status === 403) throw new AiProviderError(`A DeepSeek recusou a API key (HTTP ${res.status})`)
    if (!res.ok) throw new AiProviderError(`A DeepSeek respondeu HTTP ${res.status}`)
    const body = (await res.json()) as { data?: { id: string }[] }
    return (body.data ?? []).map(toDeepseekModel).sort((a, b) => a.id.localeCompare(b.id))
}

export async function createDeepseekProvider(): Promise<DeepSeekProvider> {
    return createDeepSeek({ apiKey: await getDeepseekApiKey() })
}
