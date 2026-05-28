import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const genAiMocks = vi.hoisted(() => {
    const generateContent = vi.fn()
    const generateContentStream = vi.fn()
    const countTokens = vi.fn()
    const constructor = vi.fn(function () {
        return {
            models: {
                generateContent,
                generateContentStream,
                countTokens,
            },
        }
    })

    return {
        constructor,
        generateContent,
        generateContentStream,
        countTokens,
    }
})

const usageLogMocks = vi.hoisted(() => ({
    logUsage: vi.fn(),
}))

vi.mock("@google/genai", () => ({
    GoogleGenAI: genAiMocks.constructor,
}))

vi.mock("@/core/ai/usage-log", () => ({
    logUsage: usageLogMocks.logUsage,
}))

const makeHighDemandError = (): Error & { status: number } => Object.assign(
    new Error(JSON.stringify({
        error: {
            code: 503,
            message: "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
            status: "UNAVAILABLE",
        },
    })),
    { status: 503 }
)

const makeServiceUnavailableError = (): Error & { status: number } => Object.assign(
    new Error(JSON.stringify({
        error: {
            code: 503,
            message: "The service is currently unavailable.",
            status: "UNAVAILABLE",
        },
    })),
    { status: 503 }
)

async function* makeStream() {
    yield {
        text: "streamed",
        usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 2,
            totalTokenCount: 3,
        },
    }
}

describe("GenAI high demand retry", () => {
    const originalEnv = process.env
    let warnSpy: ReturnType<typeof vi.spyOn>
    let errorSpy: ReturnType<typeof vi.spyOn>
    let logSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.useFakeTimers()
        vi.resetModules()
        genAiMocks.constructor.mockClear()
        genAiMocks.generateContent.mockReset()
        genAiMocks.generateContentStream.mockReset()
        genAiMocks.countTokens.mockReset()
        usageLogMocks.logUsage.mockReset()
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        process.env = { ...originalEnv, GOOGLE_API_KEY: "test-key" }
    })

    afterEach(() => {
        vi.useRealTimers()
        warnSpy.mockRestore()
        errorSpy.mockRestore()
        logSpy.mockRestore()
        process.env = originalEnv
    })

    it("retries generateText after 1s when Gemini reports high demand", async () => {
        genAiMocks.generateContent
            .mockRejectedValueOnce(makeHighDemandError())
            .mockResolvedValueOnce({
                text: "ok",
                usageMetadata: {
                    promptTokenCount: 4,
                    candidatesTokenCount: 5,
                    totalTokenCount: 9,
                },
            })

        const { generateText } = await import("@/core/ai/genai")
        const resultPromise = generateText("prompt", "gemini-test", "user-1")

        await vi.advanceTimersByTimeAsync(1000)

        await expect(resultPromise).resolves.toBe("ok")
        expect(genAiMocks.generateContent).toHaveBeenCalledTimes(2)
        expect(warnSpy).toHaveBeenCalledWith("GenAI generateText hit Gemini high demand. Retrying in 1s (attempt 2).")
        expect(usageLogMocks.logUsage).toHaveBeenCalledTimes(1)
        expect(usageLogMocks.logUsage).toHaveBeenCalledWith("gemini-test", 4, 5, 9, "user-1")
    })

    it("does not retry generateText for non-high-demand errors", async () => {
        genAiMocks.generateContent.mockRejectedValueOnce(new Error("invalid prompt"))

        const { generateText } = await import("@/core/ai/genai")

        await expect(generateText("prompt")).rejects.toThrow("Failed to generate text: invalid prompt")
        expect(genAiMocks.generateContent).toHaveBeenCalledTimes(1)
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it("retries generateText after 1s when Gemini reports temporary unavailability", async () => {
        genAiMocks.generateContent
            .mockRejectedValueOnce(makeServiceUnavailableError())
            .mockResolvedValueOnce({
                text: "ok",
                usageMetadata: {
                    promptTokenCount: 2,
                    candidatesTokenCount: 3,
                    totalTokenCount: 5,
                },
            })

        const { generateText } = await import("@/core/ai/genai")
        const resultPromise = generateText("prompt", "gemini-test", "user-1")

        await vi.advanceTimersByTimeAsync(1000)

        await expect(resultPromise).resolves.toBe("ok")
        expect(genAiMocks.generateContent).toHaveBeenCalledTimes(2)
        expect(warnSpy).toHaveBeenCalledWith("GenAI generateText hit Gemini temporary unavailability. Retrying in 1s (attempt 2).")
    })

    it("retries generateTextStream before streaming chunks", async () => {
        const onChunk = vi.fn()
        genAiMocks.generateContentStream
            .mockRejectedValueOnce(makeHighDemandError())
            .mockResolvedValueOnce(makeStream())

        const { generateTextStream } = await import("@/core/ai/genai")
        const resultPromise = generateTextStream("prompt", onChunk, "gemini-test", "user-1")

        await vi.advanceTimersByTimeAsync(1000)

        await expect(resultPromise).resolves.toBeUndefined()
        expect(genAiMocks.generateContentStream).toHaveBeenCalledTimes(2)
        expect(onChunk).toHaveBeenCalledWith("streamed")
        expect(usageLogMocks.logUsage).toHaveBeenCalledWith("gemini-test", 1, 2, 3, "user-1")
    })

    it("retries countTokens after 1s when Gemini reports high demand", async () => {
        genAiMocks.countTokens
            .mockRejectedValueOnce(makeHighDemandError())
            .mockResolvedValueOnce({ totalTokens: 12 })

        const { countTokens } = await import("@/core/ai/genai")
        const resultPromise = countTokens("prompt", "gemini-test")

        await vi.advanceTimersByTimeAsync(1000)

        await expect(resultPromise).resolves.toBe(12)
        expect(genAiMocks.countTokens).toHaveBeenCalledTimes(2)
    })

    it("retries chat after 1s when Gemini reports high demand", async () => {
        genAiMocks.generateContent
            .mockRejectedValueOnce(makeHighDemandError())
            .mockResolvedValueOnce({ text: "chat ok" })

        const { chat } = await import("@/core/ai/genai")
        const resultPromise = chat([{ role: "user", parts: "hello" }], "gemini-test")

        await vi.advanceTimersByTimeAsync(1000)

        await expect(resultPromise).resolves.toBe("chat ok")
        expect(genAiMocks.generateContent).toHaveBeenCalledTimes(2)
    })

    it("returns the first generated image buffer and logs usage", async () => {
        const imageBuffer = Buffer.from("generated-image")

        genAiMocks.generateContent.mockResolvedValueOnce({
            candidates: [{
                content: {
                    parts: [
                        { text: "imagem pronta" },
                        {
                            inlineData: {
                                data: imageBuffer.toString("base64"),
                                mimeType: "image/png",
                            },
                        },
                    ],
                },
            }],
            usageMetadata: {
                promptTokenCount: 6,
                candidatesTokenCount: 7,
                totalTokenCount: 13,
            },
        })

        const { generateImage } = await import("@/core/ai/genai")

        await expect(generateImage("prompt", "gemini-image", "user-1")).resolves.toEqual({
            buffer: imageBuffer,
            mimeType: "image/png",
        })
        expect(usageLogMocks.logUsage).toHaveBeenCalledWith("gemini-image", 6, 7, 13, "user-1")
    })

    it("throws when Gemini returns no inline image data", async () => {
        genAiMocks.generateContent.mockResolvedValueOnce({
            candidates: [{
                content: {
                    parts: [{ text: "somente texto" }],
                },
            }],
        })

        const { generateImage } = await import("@/core/ai/genai")

        await expect(generateImage("prompt")).rejects.toThrow("Failed to generate image: Gemini response did not include an image.")
    })
})
