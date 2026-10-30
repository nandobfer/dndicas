import { dbConnect } from "@/lib/db"
import { IntegrationStatus, type IIntegrationStatus } from "@/lib/db/models/IntegrationStatus"
import { getIntegrationDef } from "@/lib/integrations/catalog"
import { getIntegration, isIntegrationConfigured } from "@/lib/integrations/config"
import { listJevModels } from "./jev"
import { AI_PROVIDERS, getAiProvider, type AiAgentDto, type AiModelDto, type AiProviderId, type AiProviderStatusDto, type AiImageProviderId } from "./providers"

/**
 * Catálogo dos provedores de IA (SOMENTE servidor): situação de cada provedor e modelos/agentes
 * disponíveis, com cache curto por configuração (`version` da integração).
 *
 * Os módulos de cada provedor (e as SDKs que eles carregam) entram sob demanda: este catálogo é
 * alcançado pelas configurações de IA, e quem só lê a configuração não paga as SDKs.
 */

const MODEL_LISTERS: Record<AiProviderId, (signal?: AbortSignal) => Promise<AiModelDto[]>> = {
    opencode: async (signal) => (await import("./opencode")).listOpencodeModels(signal),
    gemini: async (signal) => (await import("./gemini")).listGeminiModels(signal),
    anthropic: async (signal) => (await import("./anthropic")).listAnthropicModels(signal),
    openai: async (signal) => (await import("./openai")).listOpenaiModels(signal),
    deepseek: async (signal) => (await import("./deepseek")).listDeepseekModels(signal),
    jev: listJevModels,
}

const CACHE_MS = 2 * 60_000
const cache = new Map<string, { at: number; value: unknown }>()

async function cached<T>(key: string, load: () => Promise<T>, fresh: boolean): Promise<T> {
    const hit = cache.get(key)
    if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value as T
    const value = await load()
    cache.set(key, { at: Date.now(), value })
    return value
}

export function clearAiCatalogCache(): void {
    cache.clear()
}

export async function getAiProviderStatuses(): Promise<AiProviderStatusDto[]> {
    await dbConnect()
    const statuses = (await IntegrationStatus.find({ integrationId: { $in: AI_PROVIDERS.map((p) => p.integrationId) } }).lean()) as IIntegrationStatus[]
    return Promise.all(
        AI_PROVIDERS.map(async (provider) => {
            const resolved = await getIntegration(provider.integrationId)
            const configured = isIntegrationConfigured(getIntegrationDef(provider.integrationId), resolved)
            const status = statuses.find((item) => item.integrationId === provider.integrationId)?.status
            return {
                id: provider.id,
                integrationId: provider.integrationId,
                name: provider.name,
                configured,
                connected: configured && (status === "ok" || status === "warn"),
            }
        }),
    )
}

export async function listAiModels(providerId: AiProviderId, options: { fresh?: boolean; signal?: AbortSignal } = {}): Promise<AiModelDto[]> {
    const { version } = await getIntegration(getAiProvider(providerId).integrationId)
    return cached(`models:${providerId}:${version}`, () => MODEL_LISTERS[providerId](options.signal), options.fresh === true)
}

export async function listAiAgents(options: { fresh?: boolean; signal?: AbortSignal } = {}): Promise<AiAgentDto[]> {
    const { version } = await getIntegration("ai_opencode")
    return cached(`agents:${version}`, async () => (await import("./opencode")).listOpencodeAgents(options.signal), options.fresh === true)
}

/** Modelos de IMAGEM do provedor (Gemini e OpenAI), com o mesmo cache por configuração. */
export async function listAiImageModels(providerId: AiImageProviderId, options: { fresh?: boolean; signal?: AbortSignal } = {}): Promise<AiModelDto[]> {
    const { version } = await getIntegration(getAiProvider(providerId).integrationId)
    return cached(`image-models:${providerId}:${version}`, async () => (await import("./image")).IMAGE_MODEL_LISTERS[providerId](options.signal), options.fresh === true)
}
