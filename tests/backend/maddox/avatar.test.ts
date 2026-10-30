import { describe, expect, it, vi } from "vitest"
import { DomainError } from "@/lib/api/route"

const generateAndStoreDndImage = vi.fn()
vi.mock("@/features/ai/server/image-generator", () => ({ generateAndStoreDndImage }))

const { generateMaddoxAvatar, buildMaddoxAvatarPrompt } = await import("@/features/maddox/server/avatar")

describe("avatar do Maddox", () => {
    it("pede ao Gerador de imagens um retrato 1:1 do peito para cima com a persona", async () => {
        generateAndStoreDndImage.mockResolvedValueOnce({ key: "ai/generated/u/1.png", url: "/api/files/ai/generated/u/1.png", mimeType: "image/png" })
        const result = await generateMaddoxAvatar("Anão de barba ruiva", "user-1")
        expect(result).toEqual({ url: "/api/files/ai/generated/u/1.png" })
        const call = generateAndStoreDndImage.mock.calls[0]![0]
        expect(call).toMatchObject({ preferredAspectRatio: "1:1", userId: "user-1" })
        expect(call.prompt).toContain("do peito para cima")
        expect(call.prompt).toContain("Anão de barba ruiva")
        expect(buildMaddoxAvatarPrompt("  x  ").endsWith("x")).toBe(true)
    })

    it("Gerador indisponível repassa o 409 em pt-BR", async () => {
        generateAndStoreDndImage.mockRejectedValueOnce(new DomainError(409, "O Gerador de imagens não está configurado", "AI_IMAGE_UNAVAILABLE"))
        await expect(generateMaddoxAvatar("persona", "user-1")).rejects.toMatchObject({ status: 409 })
    })
})
