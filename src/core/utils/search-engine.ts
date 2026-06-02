import { ENTITY_PROVIDERS } from "@/lib/config/entities"
import {
    applyFuzzySearchWithCache,
    buildFilterCacheKey,
    createFuzzyCacheEntry,
    filterEntitiesByOptions as filterEntities,
    type FuzzyCacheEntry,
    type SearchableEntity,
    type UnifiedEntity,
    type UnifiedSearchOptions,
} from "@/core/utils/search-core"

export {
    filterEntitiesByOptions,
    type UnifiedEntity,
    type UnifiedEntityMetadata,
    type UnifiedSearchOptions,
} from "@/core/utils/search-core"

/**
 * @fileoverview Central search engine for multi-entity lookups.
 * Includes Fuse.js fuzzy search with weighted scoring.
 */

type SearchDataResponse = Partial<Record<"items" | "spells" | "traits" | "rules" | "feats" | "classes" | "backgrounds" | "races" | "data", unknown[]>>

// Simple in-memory cache for search data
let cachedData: UnifiedEntity[] | null = null
let lastFetchTime = 0
const CACHE_TTL = 1000 * 60 * 5 // 5 minutes
let fuzzyCache = new WeakMap<SearchableEntity[], FuzzyCacheEntry<SearchableEntity>>()
const unifiedFilteredCache = new Map<string, UnifiedEntity[]>()

async function getSearchData(): Promise<UnifiedEntity[]> {
    const now = Date.now()
    if (cachedData && now - lastFetchTime < CACHE_TTL) {
        return cachedData
    }

    const fetchPromises = ENTITY_PROVIDERS.map(async (provider) => {
        try {
            // Se o endpoint termina em /search, não passamos query no cache inicial para pegar todos ativos
            // Mas as rotas /search sem 'q' devem retornar a lista completa
            const res = await fetch(provider.endpoint())
            if (!res.ok) return []
            const data = await res.json() as SearchDataResponse | unknown[]

            let rawItems: unknown[] = []
            if (Array.isArray(data)) rawItems = data
            else if (data.items) rawItems = data.items
            else if (data.spells) rawItems = data.spells
            else if (data.traits) rawItems = data.traits
            else if (data.rules) rawItems = data.rules
            else if (data.feats) rawItems = data.feats
            else if (data.classes) rawItems = data.classes
            else if (data.backgrounds) rawItems = data.backgrounds
            else if (data.races) rawItems = data.races
            else if (data.data) rawItems = data.data // Fallback para padrões comuns

            return rawItems.flatMap((item) => provider.map(item))
        } catch (err) {
            console.error(`Fetch failed for ${provider.name}:`, err)
            return []
        }
    })

    const results = await Promise.all(fetchPromises)
    cachedData = results.flat()
    lastFetchTime = Date.now()
    return cachedData
}

function filterEntitiesByOptionsWithCache(items: UnifiedEntity[], options?: UnifiedSearchOptions): UnifiedEntity[] {
    const cacheKey = buildFilterCacheKey(options)
    if (cacheKey) {
        const cached = unifiedFilteredCache.get(cacheKey)
        if (cached) return cached
    }

    const filtered = filterEntities(items, options)

    if (cacheKey) {
        unifiedFilteredCache.set(cacheKey, filtered)
    }

    return filtered
}

function getFuzzyCacheEntry<T extends SearchableEntity>(items: T[]): FuzzyCacheEntry<T> {
    const cached = fuzzyCache.get(items as SearchableEntity[])
    if (cached) return cached as unknown as FuzzyCacheEntry<T>

    const entry = createFuzzyCacheEntry(items)
    fuzzyCache.set(items as SearchableEntity[], entry as unknown as FuzzyCacheEntry<SearchableEntity>)
    return entry
}

function applyCachedFuzzySearch<T extends SearchableEntity>(
    items: T[],
    query: string,
    limit?: number,
    offset = 0
): T[] {
    return applyFuzzySearchWithCache(items, query, getFuzzyCacheEntry(items), limit, offset)
}

/**
 * Applies weighted fuzzy search to a list of entities.
 */
export function applyFuzzySearch<T extends SearchableEntity>(
    items: T[],
    query: string,
    limit?: number,
    offset = 0
): T[] {
    return applyCachedFuzzySearch(items, query, limit, offset)
}

/**
 * Returns cached search results synchronously when available.
 * Useful for instantly populating mention lists before the async search resolves.
 */
export function peekUnifiedSearch(
    query: string,
    limit = 20,
    offset = 0,
    options?: UnifiedSearchOptions
): UnifiedEntity[] | null {
    if (!cachedData) return null

    const filteredEntities = filterEntitiesByOptionsWithCache(cachedData, options)
    return applyCachedFuzzySearch(filteredEntities, query, limit, offset)
}

/**
 * Performs a fuzzy search across all entities with weighted scoring.
 */
export async function performUnifiedSearch(
    query: string,
    limit = 20,
    offset = 0,
    options?: UnifiedSearchOptions
): Promise<UnifiedEntity[]> {
    const allEntities = await getSearchData()
    const filteredEntities = filterEntitiesByOptionsWithCache(allEntities, options)

    return applyCachedFuzzySearch(filteredEntities, query, limit, offset)
}

/**
 * Pre-populates the search cache without blocking. Safe to call on app init.
 */
export function warmSearchCache(): void {
    void getSearchData()
}

/**
 * Resets the search cache, forcing the next search to re-fetch all entities.
 * Call this after successful create/update/delete mutations.
 */
export function invalidateSearchCache(): void {
    cachedData = null
    lastFetchTime = 0
    fuzzyCache = new WeakMap<SearchableEntity[], FuzzyCacheEntry<SearchableEntity>>()
    unifiedFilteredCache.clear()

    if (typeof window !== "undefined") {
        void import("@/core/utils/search-worker-client").then(({ invalidateSearchWorkerCache }) => {
            invalidateSearchWorkerCache()
        })
    }
}
