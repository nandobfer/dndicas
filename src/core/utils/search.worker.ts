import { ENTITY_PROVIDERS } from "@/lib/config/entities"
import {
    applyFuzzySearchWithCache,
    buildFilterCacheKey,
    createFuzzyCacheEntry,
    filterEntitiesByOptions,
    type FuzzyCacheEntry,
    type UnifiedEntity,
    type UnifiedSearchOptions,
} from "@/core/utils/search-core"

type SearchDataResponse = Partial<Record<"items" | "spells" | "traits" | "rules" | "feats" | "classes" | "backgrounds" | "races" | "data", unknown[]>>

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

type WorkerSearchScope = {
    items: UnifiedEntity[]
    fuzzyCache: FuzzyCacheEntry<UnifiedEntity>
}

type EntityProvider = (typeof ENTITY_PROVIDERS)[number]
type ProviderStatus = "idle" | "loading" | "loaded" | "failed"

let cachedData: UnifiedEntity[] | null = null
let lastFetchTime = 0
const CACHE_TTL = 1000 * 60 * 5
const scopedSearchCache = new Map<string, WorkerSearchScope>()
const providerItems = new Map<string, UnifiedEntity[]>()
const providerStatus = new Map<string, ProviderStatus>()
const providerPromises = new Map<string, Promise<UnifiedEntity[]>>()

export function resolveWorkerEndpoint(endpoint: string, baseUrl: string): string {
    return new URL(endpoint, baseUrl).toString()
}

function postMessageToClient(message: SearchWorkerResponse) {
    self.postMessage(message)
}

function extractItems(data: SearchDataResponse | unknown[]): unknown[] {
    if (Array.isArray(data)) return data
    if (data.items) return data.items
    if (data.spells) return data.spells
    if (data.traits) return data.traits
    if (data.rules) return data.rules
    if (data.feats) return data.feats
    if (data.classes) return data.classes
    if (data.backgrounds) return data.backgrounds
    if (data.races) return data.races
    if (data.data) return data.data
    return []
}

function searchItems(
    items: UnifiedEntity[],
    query: string,
    limit: number,
    offset: number,
    options?: UnifiedSearchOptions
): UnifiedEntity[] {
    const filteredItems = filterEntitiesByOptions(items, options)
    const fuzzyCache = createFuzzyCacheEntry(filteredItems)
    return applyFuzzySearchWithCache(filteredItems, query, fuzzyCache, limit, offset)
}

function getProviderKey(provider: EntityProvider) {
    return provider.name
}

function isProviderCacheFresh() {
    return lastFetchTime > 0 && Date.now() - lastFetchTime < CACHE_TTL
}

function getCachedProviderItems() {
    return Array.from(providerItems.values()).flat()
}

function updateCachedDataFromProviders() {
    cachedData = getCachedProviderItems()
    scopedSearchCache.clear()
    return cachedData
}

function getCompletedProviderCount() {
    return ENTITY_PROVIDERS.filter((provider) => {
        const status = providerStatus.get(getProviderKey(provider))
        return status === "loaded" || status === "failed"
    }).length
}

function getFailedProviderCount() {
    return ENTITY_PROVIDERS.filter((provider) => providerStatus.get(getProviderKey(provider)) === "failed").length
}

function clearStaleProviderCache() {
    if (!lastFetchTime || Date.now() - lastFetchTime < CACHE_TTL) return
    invalidateWorkerCache()
}

async function fetchProviderItems(provider: EntityProvider, baseUrl: string): Promise<UnifiedEntity[]> {
    const endpointUrl = resolveWorkerEndpoint(provider.endpoint(), baseUrl)
    console.log("[mention-search worker:fetch]", { provider: provider.name, endpointUrl })
    const res = await fetch(endpointUrl)
    if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`)
    }

    const data = await res.json() as SearchDataResponse | unknown[]
    return extractItems(data).flatMap((item) => provider.map(item))
}

function ensureProviderLoad(provider: EntityProvider, baseUrl: string): Promise<UnifiedEntity[]> {
    clearStaleProviderCache()

    const key = getProviderKey(provider)
    const status = providerStatus.get(key)
    const cachedItems = providerItems.get(key)
    if (status === "loaded" && cachedItems && isProviderCacheFresh()) {
        return Promise.resolve(cachedItems)
    }

    const existingPromise = providerPromises.get(key)
    if (existingPromise) {
        return existingPromise
    }

    providerStatus.set(key, "loading")
    const promise = fetchProviderItems(provider, baseUrl)
        .then((items) => {
            providerItems.set(key, items)
            providerStatus.set(key, "loaded")
            providerPromises.delete(key)
            lastFetchTime = Date.now()
            updateCachedDataFromProviders()
            return items
        })
        .catch((err) => {
            providerStatus.set(key, "failed")
            providerPromises.delete(key)
            throw err
        })

    providerPromises.set(key, promise)
    return promise
}

function startAllProviderLoads(baseUrl: string): Promise<UnifiedEntity[]>[] {
    return ENTITY_PROVIDERS.map((provider) => ensureProviderLoad(provider, baseUrl))
}

function getCurrentSearchResults(message: Extract<SearchWorkerRequest, { type: "search" }>) {
    return searchItems(getCachedProviderItems(), message.query, message.limit, message.offset, message.options)
}

function postPartialSearchResult(message: Extract<SearchWorkerRequest, { type: "search" }>) {
    const results = getCurrentSearchResults(message)
    const loadedProviders = getCompletedProviderCount()
    const totalProviders = ENTITY_PROVIDERS.length
    console.log("[mention-search worker:partial-result]", {
        query: message.query,
        loadedProviders,
        totalProviders,
        total: getCachedProviderItems().length,
        results: results.length,
    })
    postMessageToClient({
        id: message.id,
        type: "partial-result",
        results,
        loadedProviders,
        totalProviders,
        done: false,
    })
}

async function searchProgressively(message: Extract<SearchWorkerRequest, { type: "search" }>): Promise<void> {
    clearStaleProviderCache()

    if (cachedData && isProviderCacheFresh() && providerItems.size === ENTITY_PROVIDERS.length) {
        const scope = getSearchScope(cachedData, message.options)
        const results = applyFuzzySearchWithCache(scope.items, message.query, scope.fuzzyCache, message.limit, message.offset)
        console.log("[mention-search worker:result]", { query: message.query, scopedItems: scope.items.length, results: results.length })
        postMessageToClient({ id: message.id, type: "result", results })
        return
    }

    const totalProviders = ENTITY_PROVIDERS.length
    if (providerItems.size > 0) {
        postPartialSearchResult(message)
    }

    const watchedProviders = ENTITY_PROVIDERS.filter((provider) => providerStatus.get(getProviderKey(provider)) !== "loaded")
    await Promise.all(watchedProviders.map(async (provider) => {
        try {
            await ensureProviderLoad(provider, message.baseUrl)
            postPartialSearchResult(message)
            return true
        } catch (err) {
            console.error(`Worker fetch failed for ${provider.name}:`, err)
            if (getFailedProviderCount() < totalProviders && getCachedProviderItems().length > 0) {
                postPartialSearchResult(message)
            }
            return false
        }
    }))

    const failedProviders = getFailedProviderCount()
    if (failedProviders === totalProviders) {
        throw new Error("All worker search providers failed")
    }

    cachedData = updateCachedDataFromProviders()
    console.log("[mention-search worker:data]", { total: cachedData.length, failedProviders })

    const scope = getSearchScope(cachedData, message.options)
    const results = applyFuzzySearchWithCache(scope.items, message.query, scope.fuzzyCache, message.limit, message.offset)
    console.log("[mention-search worker:result]", { query: message.query, scopedItems: scope.items.length, results: results.length })
    postMessageToClient({ id: message.id, type: "result", results })
}

function getSearchScope(items: UnifiedEntity[], options?: UnifiedSearchOptions): WorkerSearchScope {
    const key = buildFilterCacheKey(options) ?? "__all__"
    const cachedScope = scopedSearchCache.get(key)
    if (cachedScope) return cachedScope

    const filteredItems = filterEntitiesByOptions(items, options)
    const scope = {
        items: filteredItems,
        fuzzyCache: createFuzzyCacheEntry(filteredItems),
    }

    scopedSearchCache.set(key, scope)
    return scope
}

function invalidateWorkerCache() {
    cachedData = null
    lastFetchTime = 0
    scopedSearchCache.clear()
    providerItems.clear()
    providerStatus.clear()
    providerPromises.clear()
}

self.onmessage = (event: MessageEvent<SearchWorkerRequest>) => {
    const message = event.data

    void (async () => {
        try {
            if (message.type === "invalidate") {
                invalidateWorkerCache()
                postMessageToClient({ id: message.id, type: "invalidated" })
                return
            }

            if (message.type === "warm") {
                startAllProviderLoads(message.baseUrl).forEach((promise) => {
                    void promise.catch(() => undefined)
                })
                postMessageToClient({ id: message.id, type: "warmed" })
                return
            }

            await searchProgressively(message)
        } catch (err) {
            postMessageToClient({
                id: message.id,
                type: "error",
                error: err instanceof Error ? err.message : "Unknown worker search error",
            })
        }
    })()
}
