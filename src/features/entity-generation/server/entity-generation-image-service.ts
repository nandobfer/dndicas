import { generateAndStoreDndImage } from "@/core/ai/dnd-image-generation-service"
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
