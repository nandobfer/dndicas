import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveCandidateImage } from "@/features/entity-generation/server/entity-generation-image-service"
import { generateAndStoreDndImage } from "@/core/ai/dnd-image-generation-service"

vi.mock("@/core/ai/dnd-image-generation-service", () => ({
    generateAndStoreDndImage: vi.fn(),
}))

describe("entity generation image service", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(generateAndStoreDndImage).mockResolvedValue({
            key: "ai/generated/user-1/image.png",
            url: "/api/upload?key=image",
            mimeType: "image/png",
        })
    })

    it("uses source images without generating a new image", async () => {
        const counter = { current: 3, total: 5, onProgress: vi.fn() }

        const image = await resolveCandidateImage({
            sourceImage: "https://5e.tools/img/race.webp",
            entityLabel: "Raça",
            formData: { name: "Elfo" },
            userId: "user-1",
            counter,
        })

        expect(image).toBe("https://5e.tools/img/race.webp")
        expect(generateAndStoreDndImage).not.toHaveBeenCalled()
        expect(counter.onProgress).not.toHaveBeenCalled()
    })

    it("generates and stores an image when the source has no image", async () => {
        const counter = { current: 3, total: 5, onProgress: vi.fn() }

        const image = await resolveCandidateImage({
            entityLabel: "Monstro",
            formData: { name: "Goblin" },
            userId: "user-1",
            counter,
        })

        expect(image).toBe("/api/upload?key=image")
        expect(generateAndStoreDndImage).toHaveBeenCalledWith({
            entityLabel: "Monstro",
            formData: { name: "Goblin" },
            userId: "user-1",
            preferredAspectRatio: "1:1",
        })
        expect(counter.onProgress).toHaveBeenCalledWith({ current: 3, total: 6, message: "Gerando imagem..." })
        expect(counter.onProgress).toHaveBeenCalledWith({ current: 4, total: 6, message: "Gerando imagem..." })
    })
})
