import { createGoogleGenerativeAI, type GoogleProvider } from "@ai-sdk/google"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { GEMINI_THINKING_LEVELS, type AiModelDto } from "./providers"
import { AiProviderError } from "./errors"

/**
 * Google Gemini (API do Google AI Studio) — SOMENTE servidor. Lista de modelos pela REST
 * `v1beta/models`; geração pelo `@ai-sdk/google` (Vercel AI SDK).
 */

export const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"

async function getGeminiApiKey(): Promise<string> {
    const { apiKey } = await getIntegrationConfig("ai_gemini")
    if (!apiKey) throw new AiProviderError("Gemini sem API key: configure em Integrações › Provedores de IA › Gemini")
    return apiKey
}

interface GeminiModelRaw {
    name: string
    displayName?: string
    supportedGenerationMethods?: string[]
    inputTokenLimit?: number
    thinking?: boolean
}

export function toGeminiModel(raw: GeminiModelRaw): AiModelDto {
    return {
        id: raw.name.replace(/^models\//, ""),
        name: raw.displayName ?? raw.name.replace(/^models\//, ""),
        variants: raw.thinking ? [...GEMINI_THINKING_LEVELS] : [],
        group: null,
        contextWindow: raw.inputTokenLimit ?? null,
        free: false,
    }
}

/** Modelos que geram texto (`generateContent`), sem embeddings, imagem ou áudio. */
export async function listGeminiModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    const apiKey = await getGeminiApiKey()
    const models: GeminiModelRaw[] = []
    let pageToken: string | undefined
    do {
        const url = `${GEMINI_API_URL}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`
        let res: Response
        try {
            res = await debugFetch(integrationDebug("ai_gemini"), "Gemini", url, { headers: { "x-goog-api-key": apiKey }, cache: "no-store", signal })
        } catch (error) {
            throw new AiProviderError(`Não foi possível conectar ao Gemini: ${error instanceof Error ? error.message : String(error)}`)
        }
        if (res.status === 400 || res.status === 401 || res.status === 403) throw new AiProviderError(`O Gemini recusou a API key (HTTP ${res.status})`)
        if (!res.ok) throw new AiProviderError(`O Gemini respondeu HTTP ${res.status}`)
        const body = (await res.json()) as { models?: GeminiModelRaw[]; nextPageToken?: string }
        models.push(...(body.models ?? []))
        pageToken = body.nextPageToken
    } while (pageToken)
    return models
        .filter((model) => model.supportedGenerationMethods?.includes("generateContent") && /gemini|gemma/i.test(model.name) && !/(embedding|image|tts|audio|live)/i.test(model.name))
        .map(toGeminiModel)
        .sort((a, b) => b.id.localeCompare(a.id))
}

export async function createGeminiProvider(): Promise<GoogleProvider> {
    return createGoogleGenerativeAI({ apiKey: await getGeminiApiKey() })
}
