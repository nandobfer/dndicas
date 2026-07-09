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

const makeQuotaError = (): Error & { status: number } => Object.assign(
    new Error("Quota exceeded for requests per minute."),
    { status: 429 }
)

const makeFetchResponse = (body: unknown, status = 200): Response => ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
}) as unknown as Response

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
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.useFakeTimers()
        vi.resetModules()
        genAiMocks.constructor.mockClear()
        genAiMocks.generateContent.mockReset()
        genAiMocks.generateContentStream.mockReset()
        genAiMocks.countTokens.mockReset()
        usageLogMocks.logUsage.mockReset()
        fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
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
        vi.unstubAllGlobals()
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
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("falls back to the GenAI microservice when Gemini returns quota errors", async () => {
        process.env = {
            ...process.env,
            GENAI_BASE_URL: "http://genai:4007/",
            GENAI_API_KEY: "fallback-key",
        }
        genAiMocks.generateContent.mockRejectedValueOnce(makeQuotaError())
        fetchMock.mockResolvedValueOnce(makeFetchResponse({
            id: "run_abc123",
            model: "google/gemini-2.5-flash",
            text: "fallback ok",
            usage: {
                inputTokens: 8,
                outputTokens: 13,
                totalTokens: 21,
            },
            costUsd: 0.001,
            latencyMs: 321,
        }))

        const { generateText } = await import("@/core/ai/genai")

        await expect(generateText("prompt", "gemini-test", "user-1")).resolves.toBe("fallback ok")

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith("http://genai:4007/generate", expect.objectContaining({
            method: "POST",
            headers: {
                Authorization: "Bearer fallback-key",
                "Content-Type": "application/json",
            },
            signal: expect.any(AbortSignal),
        }))

        const request = fetchMock.mock.calls[0]?.[1] as RequestInit
        expect(JSON.parse(request.body as string)).toEqual({
            prompt: "prompt",
            metadata: {
                app: "dndicas",
                feature: "core-ai-generate-text-fallback",
                sourceModel: "gemini-test",
                userId: "user-1",
            },
        })
        expect(usageLogMocks.logUsage).toHaveBeenCalledWith("google/gemini-2.5-flash", 8, 13, 21, "user-1")
    })

    it("uses configured fallback model and logs null usage tokens as zero", async () => {
        process.env = {
            ...process.env,
            GENAI_BASE_URL: "http://genai:4007",
            GENAI_API_KEY: "fallback-key",
            GENAI_FALLBACK_MODEL: "google/gemini-2.5-flash",
        }
        genAiMocks.generateContent.mockRejectedValueOnce(makeQuotaError())
        fetchMock.mockResolvedValueOnce(makeFetchResponse({
            id: "run_abc123",
            model: "google/gemini-2.5-flash",
            text: "fallback ok",
            usage: {
                inputTokens: null,
                outputTokens: null,
                totalTokens: null,
            },
            costUsd: null,
            latencyMs: 321,
        }))

        const { generateText } = await import("@/core/ai/genai")

        await expect(generateText("prompt", "gemini-test", "user-1")).resolves.toBe("fallback ok")

        const request = fetchMock.mock.calls[0]?.[1] as RequestInit
        expect(JSON.parse(request.body as string)).toEqual({
            prompt: "prompt",
            model: "google/gemini-2.5-flash",
            metadata: {
                app: "dndicas",
                feature: "core-ai-generate-text-fallback",
                sourceModel: "gemini-test",
                userId: "user-1",
            },
        })
        expect(usageLogMocks.logUsage).toHaveBeenCalledWith("google/gemini-2.5-flash", 0, 0, 0, "user-1")
    })

    it("falls back after retryable Gemini unavailability keeps failing", async () => {
        process.env = {
            ...process.env,
            GENAI_BASE_URL: "http://genai:4007",
            GENAI_API_KEY: "fallback-key",
        }
        genAiMocks.generateContent
            .mockRejectedValueOnce(makeHighDemandError())
            .mockRejectedValueOnce(makeHighDemandError())
        fetchMock.mockResolvedValueOnce(makeFetchResponse({
            id: "run_abc123",
            model: "google/gemini-2.5-flash",
            text: "fallback after retry",
            usage: {
                inputTokens: 1,
                outputTokens: 2,
                totalTokens: 3,
            },
            costUsd: null,
            latencyMs: 321,
        }))

        const { generateText } = await import("@/core/ai/genai")
        const resultPromise = generateText("prompt", "gemini-test", "user-1")

        await vi.advanceTimersByTimeAsync(1000)

        await expect(resultPromise).resolves.toBe("fallback after retry")
        expect(genAiMocks.generateContent).toHaveBeenCalledTimes(2)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("does not call fallback for non-eligible Gemini errors even when configured", async () => {
        process.env = {
            ...process.env,
            GENAI_BASE_URL: "http://genai:4007",
            GENAI_API_KEY: "fallback-key",
        }
        genAiMocks.generateContent.mockRejectedValueOnce(new Error("invalid prompt"))

        const { generateText } = await import("@/core/ai/genai")

        await expect(generateText("prompt")).rejects.toThrow("Failed to generate text: invalid prompt")
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("reports both primary and fallback failures when the microservice fails", async () => {
        process.env = {
            ...process.env,
            GENAI_BASE_URL: "http://genai:4007",
            GENAI_API_KEY: "fallback-key",
        }
        genAiMocks.generateContent.mockRejectedValueOnce(makeQuotaError())
        fetchMock.mockResolvedValueOnce(makeFetchResponse({
            error: {
                code: "OPENCODE_TIMEOUT",
                message: "The AI request timed out.",
                requestId: "run_abc123",
            },
        }, 504))

        const { generateText } = await import("@/core/ai/genai")

        await expect(generateText("prompt")).rejects.toThrow("Failed to generate text: primary provider failed (Quota exceeded for requests per minute.); fallback provider failed (The AI request timed out.)")
    })

    it("keeps the primary failure when fallback is not configured", async () => {
        genAiMocks.generateContent.mockRejectedValueOnce(makeQuotaError())

        const { generateText } = await import("@/core/ai/genai")

        await expect(generateText("prompt")).rejects.toThrow("Failed to generate text: Quota exceeded for requests per minute.")
        expect(fetchMock).not.toHaveBeenCalled()
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

    it("executes Gemini tool calls and streams the final response", async () => {
        async function* toolCallStream() {
            yield {
                candidates: [{
                    content: {
                        role: "model",
                        parts: [{
                            functionCall: { id: "call-1", name: "searchCatalogEntities", args: { query: "ladino" } },
                            thoughtSignature: "opaque-thought-signature",
                        }],
                    },
                }],
            }
        }

        async function* finalTextStream() {
            yield { text: "Ladino " }
            yield {
                text: "é furtivo.",
                usageMetadata: {
                    promptTokenCount: 3,
                    candidatesTokenCount: 4,
                    totalTokenCount: 7,
                },
            }
        }

        const execute = vi.fn().mockResolvedValue([{ id: "ladino", name: "Ladino", type: "Classe" }])
        const onChunk = vi.fn()
        genAiMocks.generateContentStream
            .mockResolvedValueOnce(toolCallStream())
            .mockResolvedValueOnce(finalTextStream())

        const { chatWithToolsStream } = await import("@/core/ai/genai")

        await expect(chatWithToolsStream({
            history: [{ role: "user", parts: "Explique Ladino" }],
            modelName: "gemini-test",
            userId: "user-1",
            onChunk,
            tools: [{
                declaration: {
                    name: "searchCatalogEntities",
                    description: "Busca catálogo",
                    parameters: { type: "object", properties: { query: { type: "string" } } },
                },
                execute,
            }],
        })).resolves.toBeUndefined()

        expect(execute).toHaveBeenCalledWith({ query: "ladino" })
        expect(onChunk).toHaveBeenNthCalledWith(1, "Ladino ")
        expect(onChunk).toHaveBeenNthCalledWith(2, "é furtivo.")
        expect(genAiMocks.generateContentStream).toHaveBeenCalledTimes(2)
        expect(usageLogMocks.logUsage).toHaveBeenCalledWith("gemini-test", 3, 4, 7, "user-1")

        const secondCall = genAiMocks.generateContentStream.mock.calls[1]?.[0]
        expect(secondCall.contents).toContainEqual(expect.objectContaining({
            role: "model",
            parts: [expect.objectContaining({
                functionCall: expect.objectContaining({ name: "searchCatalogEntities" }),
                thoughtSignature: "opaque-thought-signature",
            })],
        }))
        expect(secondCall.contents).toContainEqual(expect.objectContaining({
            role: "user",
            parts: [expect.objectContaining({ functionResponse: expect.objectContaining({ name: "searchCatalogEntities" }) })],
        }))
    })
})
