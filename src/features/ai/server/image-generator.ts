import { DomainError } from "@/lib/api/route"
import { generateAiImage } from "@/lib/ai/image"
import { AiProviderError } from "@/lib/ai/errors"
import { isAiImageProviderId } from "@/lib/ai/providers"
import { loggerFor } from "@/lib/logger"
import { buildFileProxyUrl, getImageExtensionFromMimeType, uploadFile } from "@/core/storage/s3"
import { IMAGE_ASPECT_RATIOS, IMAGE_GENERATOR_CONSUMPTION_ORIGIN, MAX_GENERATED_IMAGE_SIZE_BYTES, type ImageAspectRatio } from "../constants"
import { memoriesSection } from "../memories-prompt"
import type { ImageGeneratorSettings } from "../schemas"
import { agentMemoryTexts } from "./agent-memory-service"
import { availabilityOfImageGenerator, loadImageGeneratorSettings } from "./settings"

/**
 * Agente "Gerador de imagens" (Integrações › Provedores de IA › Gerador de imagens): gera a arte de
 * uma entidade a partir do JSON do formulário/ficha (ou de um prompt livre) e grava no Storage S3.
 * Substitui o antigo gerador fixo no Gemini (`src/core/ai`). Sem configuração não há fallback:
 * responde 409 com o motivo.
 */

export class GeneratedImageTooLargeError extends DomainError {
    constructor() {
        super(422, "A imagem gerada excedeu o limite de 5MB.", "AI_IMAGE_TOO_LARGE")
        this.name = "GeneratedImageTooLargeError"
    }
}

export interface StoredGeneratedImage {
    key: string
    url: string
    mimeType: string
}

export interface GenerateDndImageInput {
    /** Prompt livre (usado quando não há `formData`). */
    prompt?: string
    entityLabel?: string
    preferredAspectRatio?: string
    formData?: unknown
    userId: string
}

const log = loggerFor({ module: "ai", feature: "image-generator" })

function aspectRatioOf(value: string | undefined, fallback: ImageAspectRatio): ImageAspectRatio {
    return value && (IMAGE_ASPECT_RATIOS as readonly string[]).includes(value) ? (value as ImageAspectRatio) : fallback
}

/** Prompt final: instruções configuradas + memórias do agente + contexto (JSON) da entidade. Módulo testável. */
export function buildImagePrompt(
    settings: Pick<ImageGeneratorSettings, "instructions">,
    memories: readonly string[],
    input: Pick<GenerateDndImageInput, "prompt" | "entityLabel" | "formData">,
    aspectRatio: ImageAspectRatio,
): string {
    const parts = [settings.instructions.trim() + memoriesSection(memories), `Proporção da arte: ${aspectRatio}.`]
    if (typeof input.formData === "undefined") {
        if (input.entityLabel) parts.push(`Contexto principal da entidade: ${input.entityLabel}.`)
        parts.push("Pedido:", input.prompt?.trim() ?? "")
        return parts.join("\n\n")
    }
    let serialized: string
    try {
        serialized = JSON.stringify(input.formData, null, 2)
    } catch {
        serialized = "{}"
    }
    parts.push(`Contexto principal da entidade: ${input.entityLabel || "Entidade de D&D"}.`, "JSON do formulário:", serialized)
    return parts.join("\n\n")
}

/** Gera a imagem com o agente configurado e grava em `ai/generated/{usuário}/…`. */
export async function generateAndStoreDndImage(input: GenerateDndImageInput): Promise<StoredGeneratedImage> {
    const { settings } = await loadImageGeneratorSettings()
    const availability = await availabilityOfImageGenerator(settings)
    if (!availability.available || !settings.provider || !settings.model || !isAiImageProviderId(settings.provider)) {
        throw new DomainError(409, availability.reason ?? "O Gerador de imagens não está configurado em Integrações › Provedores de IA.", "AI_IMAGE_UNAVAILABLE")
    }
    const aspectRatio = aspectRatioOf(input.preferredAspectRatio, settings.defaultAspectRatio)
    const prompt = buildImagePrompt(settings, await agentMemoryTexts(["image-generator"]), input, aspectRatio)

    let generated: Awaited<ReturnType<typeof generateAiImage>>
    try {
        generated = await generateAiImage({
            provider: settings.provider,
            model: settings.model,
            prompt,
            aspectRatio,
            consumption: { origin: IMAGE_GENERATOR_CONSUMPTION_ORIGIN, subject: input.entityLabel ?? null },
        })
    } catch (error) {
        if (error instanceof AiProviderError) {
            log.warn({ err: error.message, provider: settings.provider, model: settings.model }, "[ai] falha ao gerar imagem")
            throw new DomainError(502, error.message, "AI_IMAGE_GENERATION_ERROR")
        }
        throw error
    }

    if (generated.buffer.byteLength > MAX_GENERATED_IMAGE_SIZE_BYTES) throw new GeneratedImageTooLargeError()

    const key = `ai/generated/${input.userId}/${Date.now()}.${getImageExtensionFromMimeType(generated.mimeType)}`
    await uploadFile(key, generated.buffer, generated.mimeType)
    log.info({ userId: input.userId, key, provider: settings.provider, model: settings.model, durationMs: generated.durationMs }, "[ai] imagem gerada")
    return { key, url: buildFileProxyUrl(key), mimeType: generated.mimeType }
}
