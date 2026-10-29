import type { EntityGenerationProgress } from "../types/entity-generation.types"

interface ProgressCounter {
    current: number
    total: number
    onProgress?: (progress: EntityGenerationProgress) => void | Promise<void>
}

export async function resolveCandidateImage({
    sourceImage,
    entityLabel,
    formData,
    userId,
    counter,
}: {
    sourceImage?: string
    entityLabel: string
    formData: unknown
    userId: string
    counter: ProgressCounter
}): Promise<string> {
    if (sourceImage) return sourceImage

    counter.total += 1
    await counter.onProgress?.({ current: counter.current, total: counter.total, message: "Gerando imagem..." })

    // Import tardio: a camada de IA (SDKs dos provedores) só carrega quando uma imagem é gerada.
    const { generateAndStoreDndImage } = await import("@/features/ai/server/image-generator")
    const image = await generateAndStoreDndImage({
        entityLabel,
        formData,
        userId,
        preferredAspectRatio: "1:1",
    })

    counter.current += 1
    await counter.onProgress?.({ current: counter.current, total: counter.total, message: "Gerando imagem..." })

    return image.url
}
