import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type WorkerMessage = {
    id: number
    type: string
    baseUrl?: string
    query?: string
    limit?: number
    offset?: number
}

class MockWorker {
    static instances: MockWorker[] = []

    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    messages: WorkerMessage[] = []
    terminate = vi.fn()

    constructor() {
        MockWorker.instances.push(this)
    }

    postMessage(message: WorkerMessage) {
        this.messages.push(message)
    }

    respond(message: Record<string, unknown>) {
        this.onmessage?.({ data: message } as MessageEvent)
    }
}

const fallbackSearch = vi.fn()

async function importClient() {
    vi.resetModules()
    vi.doMock("@/core/utils/search-engine", () => ({
        performUnifiedSearch: fallbackSearch,
    }))

    return import("@/core/utils/search-worker-client")
}

describe("search-worker-client", () => {
    beforeEach(() => {
        MockWorker.instances = []
        fallbackSearch.mockReset()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.doUnmock("@/core/utils/search-engine")
    })

    it("resolves search results returned by the worker", async () => {
        vi.stubGlobal("Worker", MockWorker)
        const { performUnifiedSearchInWorker } = await importClient()

        const promise = performUnifiedSearchInWorker("fire", 10, 0)
        const worker = MockWorker.instances[0]

        expect(worker.messages[0]).toEqual(expect.objectContaining({
            type: "search",
            baseUrl: window.location.origin,
            query: "fire",
            limit: 10,
            offset: 0,
        }))

        worker.respond({
            id: worker.messages[0].id,
            type: "result",
            results: [{ id: "spell-1", name: "Fire Bolt", type: "Magia", status: "active" }],
        })

        await expect(promise).resolves.toEqual([
            { id: "spell-1", name: "Fire Bolt", type: "Magia", status: "active" },
        ])
        expect(fallbackSearch).not.toHaveBeenCalled()
    })

    it("passes partial worker results to the progressive search callback", async () => {
        vi.stubGlobal("Worker", MockWorker)
        const { searchUnifiedInWorkerProgressively } = await importClient()
        const onPartial = vi.fn()

        const promise = searchUnifiedInWorkerProgressively("fire", 10, 0, undefined, onPartial)
        const worker = MockWorker.instances[0]

        worker.respond({
            id: worker.messages[0].id,
            type: "partial-result",
            results: [{ id: "rule-1", name: "Fire Rules", type: "Regra", status: "active" }],
            loadedProviders: 1,
            totalProviders: 2,
            done: false,
        })

        expect(onPartial).toHaveBeenCalledWith({
            results: [{ id: "rule-1", name: "Fire Rules", type: "Regra", status: "active" }],
            loadedProviders: 1,
            totalProviders: 2,
            done: false,
        })

        worker.respond({
            id: worker.messages[0].id,
            type: "result",
            results: [{ id: "spell-1", name: "Fire Bolt", type: "Magia", status: "active" }],
        })

        await expect(promise).resolves.toEqual([
            { id: "spell-1", name: "Fire Bolt", type: "Magia", status: "active" },
        ])
        expect(onPartial).toHaveBeenLastCalledWith({
            results: [{ id: "spell-1", name: "Fire Bolt", type: "Magia", status: "active" }],
            loadedProviders: 1,
            totalProviders: 1,
            done: true,
        })
    })

    it("matches out-of-order worker responses to the correct request", async () => {
        vi.stubGlobal("Worker", MockWorker)
        const { performUnifiedSearchInWorker } = await importClient()

        const first = performUnifiedSearchInWorker("fire", 10, 0)
        const second = performUnifiedSearchInWorker("cold", 10, 0)
        const worker = MockWorker.instances[0]
        const [firstMessage, secondMessage] = worker.messages

        worker.respond({
            id: secondMessage.id,
            type: "result",
            results: [{ id: "cold", name: "Cold Rules", type: "Regra", status: "active" }],
        })
        worker.respond({
            id: firstMessage.id,
            type: "result",
            results: [{ id: "fire", name: "Fire Rules", type: "Regra", status: "active" }],
        })

        await expect(first).resolves.toEqual([
            { id: "fire", name: "Fire Rules", type: "Regra", status: "active" },
        ])
        await expect(second).resolves.toEqual([
            { id: "cold", name: "Cold Rules", type: "Regra", status: "active" },
        ])
    })

    it("falls back to the main-thread search when Worker is unavailable", async () => {
        vi.stubGlobal("Worker", undefined)
        fallbackSearch.mockResolvedValue([{ id: "fallback", name: "Fallback", type: "Regra", status: "active" }])
        const { performUnifiedSearchInWorker } = await importClient()

        await expect(performUnifiedSearchInWorker("fallback", 5, 1)).resolves.toEqual([
            { id: "fallback", name: "Fallback", type: "Regra", status: "active" },
        ])
        expect(fallbackSearch).toHaveBeenCalledWith("fallback", 5, 1, undefined)
    })

    it("sends the page origin when warming the worker cache", async () => {
        vi.stubGlobal("Worker", MockWorker)
        const { warmSearchWorkerCache } = await importClient()

        warmSearchWorkerCache()

        expect(MockWorker.instances[0].messages[0]).toEqual(expect.objectContaining({
            type: "warm",
            baseUrl: window.location.origin,
        }))
    })

    it("falls back to the main-thread search when the worker reports an error", async () => {
        vi.stubGlobal("Worker", MockWorker)
        fallbackSearch.mockResolvedValue([{ id: "fallback-error", name: "Fallback Error", type: "Regra", status: "active" }])
        const { performUnifiedSearchInWorker } = await importClient()

        const promise = performUnifiedSearchInWorker("fire", 10, 0)
        const worker = MockWorker.instances[0]

        worker.respond({
            id: worker.messages[0].id,
            type: "error",
            error: "All worker search providers failed",
        })

        await expect(promise).resolves.toEqual([
            { id: "fallback-error", name: "Fallback Error", type: "Regra", status: "active" },
        ])
        expect(fallbackSearch).toHaveBeenCalledWith("fire", 10, 0, undefined)
    })
})
