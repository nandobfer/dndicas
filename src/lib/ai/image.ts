import type { generateImage } from "ai"
import { randomUUID } from "node:crypto"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { recordAiConsumption } from "./consumption"
import { AiProviderError } from "./errors"
import type { AiImageProviderId, AiModelDto } from "./providers"

/**
 * Geração de IMAGEM pela Vercel AI SDK (`generateImage`) — SOMENTE servidor. Extensão do DnDicas
 * sobre a camada de IA copiada do Opex (que só gera texto): usada pelo agente "Gerador de imagens".
 *
 * Provedores com modelos de imagem: Gemini (`*-image*` e Imagen) e OpenAI (`gpt-image-*`, `dall-e-*`).
 * A SDK `ai` e os clientes dos provedores entram sob demanda (`await import`), como em `stream.ts`.
 */

export { AI_IMAGE_PROVIDER_IDS, isAiImageProviderId, type AiImageProviderId } from "./providers"

/** Modelos de imagem do Gemini: os `gemini-*-image*` (nano banana) e o Imagen. */
export function isGeminiImageModel(id: string): boolean {
    return /^(gemini-.*image|imagen-)/i.test(id) && !/(tts|audio|live|embedding)/i.test(id)
}

/** Modelos de imagem da OpenAI. */
export function isOpenaiImageModel(id: string): boolean {
    return /^(gpt-image|dall-e)/i.test(id)
}

const toModel = (id: string, name?: string): AiModelDto => ({ id, name: name ?? id, variants: [], group: null, contextWindow: null, free: false })

async function listGeminiImageModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    const { apiKey } = await getIntegrationConfig("ai_gemini")
    if (!apiKey) throw new AiProviderError("Gemini sem API key: configure em Integrações › Provedores de IA › Gemini")
    const { GEMINI_API_URL } = await import("./gemini")
    const models: { name: string; displayName?: string }[] = []
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
        const body = (await res.json()) as { models?: { name: string; displayName?: string }[]; nextPageToken?: string }
        models.push(...(body.models ?? []))
        pageToken = body.nextPageToken
    } while (pageToken)
    return models
        .map((model) => ({ id: model.name.replace(/^models\//, ""), name: model.displayName }))
        .filter((model) => isGeminiImageModel(model.id))
        .map((model) => toModel(model.id, model.name))
        .sort((a, b) => b.id.localeCompare(a.id))
}

async function listOpenaiImageModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    const { apiKey } = await getIntegrationConfig("ai_openai")
    if (!apiKey) throw new AiProviderError("OpenAI sem API key: configure em Integrações › Provedores de IA › OpenAI")
    const { OPENAI_API_URL } = await import("./openai")
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_openai"), "OpenAI", `${OPENAI_API_URL}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", signal })
    } catch (error) {
        throw new AiProviderError(`Não foi possível conectar à OpenAI: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (res.status === 401 || res.status === 403) throw new AiProviderError(`A OpenAI recusou a API key (HTTP ${res.status})`)
    if (!res.ok) throw new AiProviderError(`A OpenAI respondeu HTTP ${res.status}`)
    const body = (await res.json()) as { data?: { id: string; created?: number }[] }
    return (body.data ?? [])
        .filter((model) => isOpenaiImageModel(model.id))
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id))
        .map((model) => toModel(model.id))
}

export const IMAGE_MODEL_LISTERS: Record<AiImageProviderId, (signal?: AbortSignal) => Promise<AiModelDto[]>> = {
    gemini: listGeminiImageModels,
    openai: listOpenaiImageModels,
}

export interface AiImageRequest {
    provider: AiImageProviderId
    model: string
    prompt: string
    /** `largura:altura` (ex.: `1:1`, `16:9`). */
    aspectRatio?: `${number}:${number}`
    signal?: AbortSignal
    /** Origem e referência no painel de consumo. */
    consumption?: { origin: string; subject?: string | null }
}

export interface AiImageResult {
    buffer: Buffer
    mimeType: string
    durationMs: number
}

async function imageModelFor(request: AiImageRequest) {
    if (request.provider === "gemini") return (await (await import("./gemini")).createGeminiProvider()).image(request.model)
    return (await (await import("./openai")).createOpenaiProvider()).image(request.model)
}

/** Gera UMA imagem. Lança `AiProviderError` com mensagem pt-BR quando o provedor falha. */
export async function generateAiImage(request: AiImageRequest): Promise<AiImageResult> {
    const startedAt = Date.now()
    let result: Awaited<ReturnType<typeof generateImage>>
    try {
        const { generateImage } = await import("ai")
        result = await generateImage({
            model: await imageModelFor(request),
            prompt: request.prompt,
            n: 1,
            // A OpenAI aceita tamanhos; os demais, proporção.
            ...(request.aspectRatio && request.provider !== "openai" ? { aspectRatio: request.aspectRatio } : {}),
            abortSignal: request.signal,
        })
    } catch (error) {
        if (error instanceof AiProviderError) throw error
        throw new AiProviderError(`O ${request.provider === "gemini" ? "Gemini" : "OpenAI"} não gerou a imagem: ${error instanceof Error ? error.message : String(error)}`)
    }
    const image = result.image
    if (!image?.uint8Array?.length) throw new AiProviderError("O provedor não devolveu nenhuma imagem")
    if (request.consumption) {
        const usage = result.usage as { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined
        await recordAiConsumption({
            dedupKey: `image:${randomUUID()}`,
            provider: request.provider,
            origin: request.consumption.origin,
            subject: request.consumption.subject ?? null,
            model: request.model,
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? null,
            totalTokens: usage?.totalTokens ?? null,
            costUsd: null,
        })
    }
    return { buffer: Buffer.from(image.uint8Array), mimeType: image.mediaType || "image/png", durationMs: Date.now() - startedAt }
}
