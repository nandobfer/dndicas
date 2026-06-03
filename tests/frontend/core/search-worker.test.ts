import { beforeEach, describe, expect, it, vi } from "vitest"

const mockProviders = vi.hoisted(() => ({
    providers: [
        {
            name: "Regra",
            endpoint: () => "/api/rules",
            map: (item: { id: string; name: string }) => ({ ...item, _id: item.id, label: item.name, type: "Regra", status: "active" }),
        },
        {
            name: "Magia",
            endpoint: () => "/api/spells/search",
            map: (item: { id: string; name: string }) => ({ ...item, _id: item.id, label: item.name, type: "Magia", status: "active" }),
        },
    ],
}))

vi.mock("@/lib/config/entities", () => ({
    ENTITY_PROVIDERS: mockProviders.providers,
}))

describe("search worker", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.restoreAllMocks()
    })

    it("resolves relative API endpoints against the page origin", async () => {
        const { resolveWorkerEndpoint } = await import("@/core/utils/search.worker")

        expect(resolveWorkerEndpoint("/api/rules", "https://example.com")).toBe("https://example.com/api/rules")
        expect(resolveWorkerEndpoint("https://api.example.com/rules", "https://example.com")).toBe("https://api.example.com/rules")
    })

    it("responds with an error instead of caching empty data when all providers fail", async () => {
        const responses: unknown[] = []
        vi.stubGlobal("fetch", vi.fn(async () => {
            throw new TypeError("invalid url")
        }))
        vi.spyOn(self, "postMessage").mockImplementation((message) => {
            responses.push(message)
        })

        await import("@/core/utils/search.worker")
        self.onmessage?.({
            data: {
                id: 1,
                type: "search",
                baseUrl: "https://example.com",
                query: "fire",
                limit: 10,
                offset: 0,
            },
        } as MessageEvent)

        await vi.waitFor(() => {
            expect(responses).toHaveLength(1)
        })
        expect(responses[0]).toEqual({
            id: 1,
            type: "error",
            error: "All worker search providers failed",
        })
    })

    it("emits partial results as each provider finishes before the final result", async () => {
        const responses: unknown[] = []
        let resolveRules: (response: { ok: boolean; json: () => Promise<unknown> }) => void = () => undefined
        let resolveSpells: (response: { ok: boolean; json: () => Promise<unknown> }) => void = () => undefined

        vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
            const url = String(input)
            if (url.endsWith("/api/rules")) {
                return new Promise((resolve) => {
                    resolveRules = resolve
                })
            }

            if (url.endsWith("/api/spells/search")) {
                return new Promise((resolve) => {
                    resolveSpells = resolve
                })
            }

            throw new Error(`Unexpected URL: ${url}`)
        }))
        vi.spyOn(self, "postMessage").mockImplementation((message) => {
            responses.push(message)
        })

        await import("@/core/utils/search.worker")
        self.onmessage?.({
            data: {
                id: 1,
                type: "search",
                baseUrl: "https://example.com",
                query: "fire",
                limit: 10,
                offset: 0,
            },
        } as MessageEvent)

        resolveRules({
            ok: true,
            json: async () => ({ items: [{ id: "rule-1", name: "Fire Rules" }] }),
        })

        await vi.waitFor(() => {
            expect(responses).toHaveLength(1)
        })
        expect(responses[0]).toEqual(expect.objectContaining({
            id: 1,
            type: "partial-result",
            loadedProviders: 1,
            totalProviders: 2,
            done: false,
        }))
        expect((responses[0] as { results: Array<{ id: string }> }).results.map((item) => item.id)).toEqual(["rule-1"])

        resolveSpells({
            ok: true,
            json: async () => ({ items: [{ id: "spell-1", name: "Fire Bolt" }] }),
        })

        await vi.waitFor(() => {
            expect(responses).toHaveLength(3)
        })
        expect(responses[1]).toEqual(expect.objectContaining({
            id: 1,
            type: "partial-result",
            loadedProviders: 2,
            totalProviders: 2,
            done: false,
        }))
        expect(responses[2]).toEqual(expect.objectContaining({
            id: 1,
            type: "result",
        }))
        expect((responses[2] as { results: Array<{ id: string }> }).results.map((item) => item.id)).toEqual(["rule-1", "spell-1"])
    })

    it("keeps successful provider results when another provider fails", async () => {
        const responses: unknown[] = []
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.endsWith("/api/rules")) {
                return {
                    ok: true,
                    json: async () => ({ items: [{ id: "rule-1", name: "Fire Rules" }] }),
                }
            }

            throw new Error(`Provider failed: ${url}`)
        }))
        vi.spyOn(self, "postMessage").mockImplementation((message) => {
            responses.push(message)
        })

        await import("@/core/utils/search.worker")
        self.onmessage?.({
            data: {
                id: 1,
                type: "search",
                baseUrl: "https://example.com",
                query: "fire",
                limit: 10,
                offset: 0,
            },
        } as MessageEvent)

        await vi.waitFor(() => {
            expect(responses.some((message) => (message as { type: string }).type === "result")).toBe(true)
        })

        const finalResponse = responses.find((message) => (message as { type: string }).type === "result") as { results: Array<{ id: string }> }
        expect(finalResponse.results.map((item) => item.id)).toEqual(["rule-1"])
        expect(responses.some((message) => (message as { type: string }).type === "error")).toBe(false)
    })

    it("lets a search use provider data that finished during a background warmup", async () => {
        const responses: unknown[] = []
        let resolveRules: (response: { ok: boolean; json: () => Promise<unknown> }) => void = () => undefined
        let resolveSpells: (response: { ok: boolean; json: () => Promise<unknown> }) => void = () => undefined

        vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
            const url = String(input)
            if (url.endsWith("/api/rules")) {
                return new Promise((resolve) => {
                    resolveRules = resolve
                })
            }

            if (url.endsWith("/api/spells/search")) {
                return new Promise((resolve) => {
                    resolveSpells = resolve
                })
            }

            throw new Error(`Unexpected URL: ${url}`)
        }))
        vi.spyOn(self, "postMessage").mockImplementation((message) => {
            responses.push(message)
        })

        await import("@/core/utils/search.worker")
        self.onmessage?.({
            data: {
                id: 1,
                type: "warm",
                baseUrl: "https://example.com",
            },
        } as MessageEvent)

        await vi.waitFor(() => {
            expect(responses).toEqual([{ id: 1, type: "warmed" }])
        })

        resolveRules({
            ok: true,
            json: async () => ({ items: [{ id: "rule-1", name: "Fire Rules" }] }),
        })

        await vi.waitFor(() => {
            expect(fetch).toHaveBeenCalledTimes(2)
        })

        self.onmessage?.({
            data: {
                id: 2,
                type: "search",
                baseUrl: "https://example.com",
                query: "fire",
                limit: 10,
                offset: 0,
            },
        } as MessageEvent)

        await vi.waitFor(() => {
            expect(responses.some((message) => (message as { id: number; type: string }).id === 2 && (message as { type: string }).type === "partial-result")).toBe(true)
        })

        const partial = responses.find((message) => (message as { id: number; type: string }).id === 2 && (message as { type: string }).type === "partial-result") as { results: Array<{ id: string }> }
        expect(partial.results.map((item) => item.id)).toEqual(["rule-1"])
        expect(fetch).toHaveBeenCalledTimes(2)

        resolveSpells({
            ok: true,
            json: async () => ({ items: [{ id: "spell-1", name: "Fire Bolt" }] }),
        })

        await vi.waitFor(() => {
            expect(responses.some((message) => (message as { id: number; type: string }).id === 2 && (message as { type: string }).type === "result")).toBe(true)
        })
        expect(fetch).toHaveBeenCalledTimes(2)
    })
})
