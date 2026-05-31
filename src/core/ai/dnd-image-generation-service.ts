import { generateImage } from "@/core/ai/genai"
import { buildFileProxyUrl, getImageExtensionFromMimeType, uploadFile } from "@/core/storage/s3"

export const MAX_GENERATED_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
export const DEFAULT_GENERATED_IMAGE_ASPECT_RATIO = "1:1"

export class GeneratedImageTooLargeError extends Error {
    constructor() {
        super("A imagem gerada excedeu o limite de 5MB.")
        this.name = "GeneratedImageTooLargeError"
    }
}

export interface StoredGeneratedImage {
    key: string
    url: string
    mimeType: string
}

export function buildDndImagePrompt({
    entityLabel,
    formData,
    preferredAspectRatio,
}: {
    entityLabel?: string
    formData: unknown
    preferredAspectRatio?: string
}): string {
    const serializedFormData = JSON.stringify(formData, null, 2)

    return [
        "Você é um diretor de arte especializado em Dungeons & Dragons 5e, criando ilustrações com aparência premium de livro oficial.",
        `Crie uma única arte final em aspecto ${preferredAspectRatio || DEFAULT_GENERATED_IMAGE_ASPECT_RATIO}, priorizando composição 1:1, leitura clara do sujeito principal e enquadramento adequado para uso como imagem de catálogo.`,
        "A estética deve ser coerente com D&D: realismo clássico, fantasia heroica, acabamento editorial, iluminação dramática, riqueza de materiais, silhueta legível e consistência com artes de sourcebooks oficiais.",
        "Regras obrigatórias: sem texto, sem logos, sem molduras, sem watermark, sem interface, sem colagem, sem múltiplos quadros e sem visual fotográfico moderno fora do tema de fantasia.",
        "Use TODO o JSON abaixo como fonte de verdade. Não dependa de campos específicos; leia o objeto inteiro e extraia dele o que for necessário para representar com precisão a entidade.",
        `Contexto principal da entidade: ${entityLabel || "Entidade de D&D"}.`,
        "Prefira uma saída visualmente rica, mas com composição eficiente para web e adequada a um arquivo final de até 5MB.",
        "JSON do formulário:",
        serializedFormData,
    ].join("\n\n")
}

export async function generateAndStoreDndImage({
    prompt,
    model,
    entityLabel,
    preferredAspectRatio,
    formData,
    userId,
}: {
    prompt?: string
    model?: string
    entityLabel?: string
    preferredAspectRatio?: string
    formData?: unknown
    userId: string
}): Promise<StoredGeneratedImage> {
    const promptToUse = typeof formData === "undefined"
        ? prompt!
        : buildDndImagePrompt({ entityLabel, formData, preferredAspectRatio })

    const generatedImage = await generateImage(promptToUse, model, userId)

    if (generatedImage.buffer.byteLength > MAX_GENERATED_IMAGE_SIZE_BYTES) {
        throw new GeneratedImageTooLargeError()
    }

    const fileExtension = getImageExtensionFromMimeType(generatedImage.mimeType)
    const key = `ai/generated/${userId}/${Date.now()}.${fileExtension}`

    await uploadFile(key, generatedImage.buffer, generatedImage.mimeType)

    return {
        key,
        url: buildFileProxyUrl(key),
        mimeType: generatedImage.mimeType,
    }
}
