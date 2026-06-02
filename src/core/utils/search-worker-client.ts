import { performUnifiedSearch } from "@/core/utils/search-engine"
import type { UnifiedEntity, UnifiedSearchOptions } from "@/core/utils/search-core"

type SearchWorkerRequest =
    | { id: number; type: "search"; baseUrl: string; query: string; limit: number; offset: number; options?: UnifiedSearchOptions }
    | { id: number; type: "warm"; baseUrl: string }
    | { id: number; type: "invalidate" }

type SearchWorkerResponse =
    | { id: number; type: "partial-result"; results: UnifiedEntity[]; loadedProviders: number; totalProviders: number; done: false }
    | { id: number; type: "result"; results: UnifiedEntity[] }
    | { id: number; type: "warmed" }
    | { id: number; type: "invalidated" }
    | { id: number; type: "error"; error: string }

export type ProgressiveSearchUpdate = {
    results: UnifiedEntity[]
    loadedProviders: number
    totalProviders: number
    done: boolean
}

type PendingRequest = {
    resolve: (results: UnifiedEntity[]) => void
    reject: (error: Error) => void
    onPartial?: (update: ProgressiveSearchUpdate) => void
}

let worker: Worker | null = null
let requestId = 0
const pendingRequests = new Map<number, PendingRequest>()

function canUseWorker() {
    return typeof window !== "undefined" && typeof Worker !== "undefined"
}

function getWorkerBaseUrl() {
    return window.location.origin
}

function rejectPendingRequests(error: Error) {
    pendingRequests.forEach(({ reject }) => reject(error))
    pendingRequests.clear()
}

function getSearchWorker(): Worker | null {
    if (!canUseWorker()) return null
    if (worker) return worker

    try {
        worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" })
        worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
            const message = event.data
            const pending = pendingRequests.get(message.id)
            if (!pending) return

            if (message.type === "error") {
                pendingRequests.delete(message.id)
                pending.reject(new Error(message.error))
                return
            }

            if (message.type === "partial-result") {
                pending.onPartial?.({
                    results: message.results,
                    loadedProviders: message.loadedProviders,
                    totalProviders: message.totalProviders,
                    done: false,
                })
                return
            }

            pendingRequests.delete(message.id)
            pending.resolve(message.type === "result" ? message.results : [])
        }
        worker.onerror = (event) => {
            const error = new Error(event.message || "Search worker failed")
            worker?.terminate()
            worker = null
            rejectPendingRequests(error)
        }
    } catch {
        worker = null
    }

    return worker
}

function postWorkerRequest(
    message: SearchWorkerRequest,
    onPartial?: (update: ProgressiveSearchUpdate) => void
): Promise<UnifiedEntity[]> | null {
    const searchWorker = getSearchWorker()
    if (!searchWorker) return null

    return new Promise((resolve, reject) => {
        pendingRequests.set(message.id, { resolve, reject, onPartial })
        console.log("[mention-search worker:post]", {
            type: message.type,
            query: message.type === "search" ? message.query : undefined,
            baseUrl: "baseUrl" in message ? message.baseUrl : undefined,
        })
        searchWorker.postMessage(message)
    })
}

export async function performUnifiedSearchInWorker(
    query: string,
    limit = 20,
    offset = 0,
    options?: UnifiedSearchOptions
): Promise<UnifiedEntity[]> {
    const id = ++requestId
    const workerPromise = postWorkerRequest({ id, type: "search", baseUrl: canUseWorker() ? getWorkerBaseUrl() : "", query, limit, offset, options })

    if (!workerPromise) {
        return performUnifiedSearch(query, limit, offset, options)
    }

    try {
        return await workerPromise
    } catch (err) {
        console.error("Search worker failed, falling back to main-thread search:", { query, limit, offset, options, err })
        return performUnifiedSearch(query, limit, offset, options)
    }
}

export async function searchUnifiedInWorkerProgressively(
    query: string,
    limit = 20,
    offset = 0,
    options?: UnifiedSearchOptions,
    onPartial?: (update: ProgressiveSearchUpdate) => void
): Promise<UnifiedEntity[]> {
    const id = ++requestId
    const workerPromise = postWorkerRequest(
        { id, type: "search", baseUrl: canUseWorker() ? getWorkerBaseUrl() : "", query, limit, offset, options },
        onPartial,
    )

    if (!workerPromise) {
        const results = await performUnifiedSearch(query, limit, offset, options)
        onPartial?.({
            results,
            loadedProviders: 1,
            totalProviders: 1,
            done: true,
        })
        return results
    }

    try {
        const results = await workerPromise
        onPartial?.({
            results,
            loadedProviders: 1,
            totalProviders: 1,
            done: true,
        })
        return results
    } catch (err) {
        console.error("Search worker failed, falling back to main-thread search:", { query, limit, offset, options, err })
        const results = await performUnifiedSearch(query, limit, offset, options)
        onPartial?.({
            results,
            loadedProviders: 1,
            totalProviders: 1,
            done: true,
        })
        return results
    }
}

export function warmSearchWorkerCache(): void {
    const id = ++requestId
    const workerPromise = canUseWorker()
        ? postWorkerRequest({ id, type: "warm", baseUrl: getWorkerBaseUrl() })
        : null
    if (workerPromise) {
        void workerPromise.catch((err) => {
            console.error("Search worker warmup failed:", err)
        })
    }
}

export function invalidateSearchWorkerCache(): void {
    const id = ++requestId
    const workerPromise = postWorkerRequest({ id, type: "invalidate" })
    if (workerPromise) {
        void workerPromise.catch((err) => {
            console.error("Search worker invalidation failed:", err)
        })
    }
}
