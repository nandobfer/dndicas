import { beforeEach, describe, expect, it, vi } from "vitest"

const dbConnect = vi.fn()
const findOne = vi.fn()
const findOneAndUpdate = vi.fn()
const listOpenCodeModelsWithRawOutput = vi.fn()

vi.mock("@/core/database/db", () => ({ default: dbConnect }))
vi.mock("@/features/feedback/api/feedback-opencode-model-cache.model", () => ({
    FeedbackOpenCodeModelCacheModel: {
        findOne,
        findOneAndUpdate,
    },
}))
vi.mock("@/features/feedback/services/opencode/opencode-cli-service", () => ({
    listOpenCodeModelsWithRawOutput,
}))

const { getCachedOpenCodeModels, refreshOpenCodeModelCache } = await import("@/features/feedback/services/opencode/opencode-model-cache-service")

describe("opencode model cache service", () => {
    beforeEach(() => {
        dbConnect.mockResolvedValue(undefined)
        findOne.mockReset()
        findOneAndUpdate.mockReset()
        listOpenCodeModelsWithRawOutput.mockReset()
    })

    it("lê modelos cacheados sem chamar o CLI", async () => {
        const refreshedAt = new Date("2026-07-16T12:00:00.000Z")
        const models = [{ id: "openai/gpt-5.5", label: "openai/gpt-5.5", provider: "openai" }]
        findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ models, refreshedAt }) })

        await expect(getCachedOpenCodeModels()).resolves.toEqual({ models, refreshedAt, errorMessage: undefined })

        expect(dbConnect).toHaveBeenCalled()
        expect(findOne).toHaveBeenCalledWith({ key: "default" })
        expect(listOpenCodeModelsWithRawOutput).not.toHaveBeenCalled()
    })

    it("atualiza o cache com a saída do CLI", async () => {
        const models = [{ id: "anthropic/claude-sonnet-4-5", label: "anthropic/claude-sonnet-4-5", provider: "anthropic" }]
        const refreshedAt = new Date("2026-07-16T12:00:00.000Z")
        listOpenCodeModelsWithRawOutput.mockResolvedValue({ models, rawOutput: "anthropic/claude-sonnet-4-5" })
        findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue({ models, refreshedAt }) })

        await expect(refreshOpenCodeModelCache()).resolves.toEqual({ models, refreshedAt, errorMessage: undefined })

        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { key: "default" },
            {
                $set: {
                    key: "default",
                    models,
                    rawOutput: "anthropic/claude-sonnet-4-5",
                    refreshedAt: expect.any(Date),
                },
                $unset: { errorMessage: "" },
            },
            { new: true, upsert: true },
        )
    })

    it("preserva o documento e registra erro quando o refresh falha", async () => {
        const error = new Error("opencode não encontrado")
        listOpenCodeModelsWithRawOutput.mockRejectedValue(error)
        findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })

        await expect(refreshOpenCodeModelCache()).rejects.toThrow("opencode não encontrado")

        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { key: "default" },
            { $set: { key: "default", errorMessage: "opencode não encontrado" } },
            { upsert: true },
        )
    })
})
