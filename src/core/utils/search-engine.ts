import Fuse, { type FuseResult } from "fuse.js"
import { ENTITY_PROVIDERS } from "@/lib/config/entities"
import type { EntityType } from "@/lib/config/colors"

/**
 * @fileoverview Central search engine for multi-entity lookups.
 * Includes Fuse.js fuzzy search with weighted scoring.
 */

export interface UnifiedEntity {
    id: string
    _id?: string
    name: string
    originalName?: string
    label?: string // For compatibility
    type: "Regra" | "Magia" | "Habilidade" | "Talento" | "Classe" | "Subclasse" | "Origem" | "Raça" | "Item" | "Monstro"
    description?: string
    source?: string
    status: "active" | "inactive"
    metadata?: UnifiedEntityMetadata
    school?: string
    circle?: number
    saveAttribute?: string
    component?: string[]
    baseDice?: unknown
    extraDicePerLevel?: unknown
    rarity?: string
    itemType?: string
    price?: string
    damageDice?: unknown
    damageType?: string
    ac?: number
    acType?: string
    armorType?: string
    acBonus?: number
    attributeUsed?: string
    image?: string
    isMagic?: boolean
    traits?: unknown[]
    properties?: unknown[]
    additionalDamage?: unknown[]
    mastery?: string
    score?: number // Added for weighted sorting visibility if needed
}

export interface UnifiedEntityMetadata extends Record<string, unknown> {
    parentClassId?: string
    parentClassName?: string
    subclassId?: string
    subclassName?: string
    subclassColor?: string
}

export interface UnifiedSearchOptions {
    specificEntityType?: EntityType
    specificEntityTypes?: EntityType[]
    itemTypes?: string[]
    circles?: number[]
    parentClassId?: string | null
}

type SearchableEntity = { name?: string; originalName?: string; label?: string; source?: string; description?: string }
type SearchResultItem = SearchableEntity & {
    id?: { toString: () => string } | string
    _id?: { toString: () => string } | string
    toObject?: () => Record<string, unknown>
}
type SearchDataResponse = Partial<Record<"items" | "spells" | "traits" | "rules" | "feats" | "classes" | "backgrounds" | "races" | "data", unknown[]>>

const FUSE_OPTIONS = {
    keys: [
        { name: "name", weight: 10 },
        { name: "originalName", weight: 8 },
        { name: "label", weight: 10 },
    ],
    threshold: 0.15,
    includeScore: true,
    shouldSort: true,
    minMatchCharLength: 2
}

type FuzzyCacheEntry<T extends SearchableEntity> = {
    fuse: Fuse<T>
    rankedResultsByQuery: Map<string, FuseResult<T>[]>
}

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

function buildFilterCacheKey(options?: UnifiedSearchOptions): string | null {
    if (!options) return null

    const entityTypes = options.specificEntityTypes?.length
        ? [...options.specificEntityTypes].sort()
        : options.specificEntityType
            ? [options.specificEntityType]
            : []

    const itemTypes = options.itemTypes?.length ? [...options.itemTypes].sort() : []
    const circles = options.circles?.length ? [...options.circles].sort((left, right) => left - right) : []
    const parentClassId = options.parentClassId ?? null

    if (entityTypes.length === 0 && itemTypes.length === 0 && circles.length === 0 && parentClassId === null) {
        return null
    }

    return JSON.stringify({
        entityTypes,
        itemTypes,
        circles,
        parentClassId,
    })
}

export function filterEntitiesByOptions(items: UnifiedEntity[], options?: UnifiedSearchOptions): UnifiedEntity[] {
    if (!options) return items

    const cacheKey = buildFilterCacheKey(options)
    if (cacheKey) {
        const cached = unifiedFilteredCache.get(cacheKey)
        if (cached) return cached
    }

    const entityTypes = options.specificEntityTypes?.length
        ? options.specificEntityTypes
        : options.specificEntityType
            ? [options.specificEntityType]
            : null

    const filtered = items.filter((entity) => {
        if (entityTypes && !entityTypes.includes(entity.type as EntityType)) return false
        if (options.itemTypes?.length && entity.type === "Item" && !options.itemTypes.includes(entity.itemType ?? "")) return false
        if (options.circles?.length && entity.type === "Magia" && !options.circles.includes(entity.circle ?? -1)) return false
        if (options.parentClassId && entity.type === "Subclasse" && entity.metadata?.parentClassId !== options.parentClassId) return false
        return true
    })

    if (cacheKey) {
        unifiedFilteredCache.set(cacheKey, filtered)
    }

    return filtered
}

function getFuzzyCacheEntry<T extends SearchableEntity>(items: T[]): FuzzyCacheEntry<T> {
    const cached = fuzzyCache.get(items as SearchableEntity[])
    if (cached) return cached as unknown as FuzzyCacheEntry<T>

    const entry: FuzzyCacheEntry<T> = {
        fuse: new Fuse(items, FUSE_OPTIONS),
        rankedResultsByQuery: new Map(),
    }
    fuzzyCache.set(items as SearchableEntity[], entry as unknown as FuzzyCacheEntry<SearchableEntity>)
    return entry
}

function getRankedFuzzyResults<T extends SearchableEntity>(items: T[], query: string): FuseResult<T>[] {
    const cacheEntry = getFuzzyCacheEntry(items)
    const cachedResults = cacheEntry.rankedResultsByQuery.get(query)
    if (cachedResults) return cachedResults

    const fuseResults = cacheEntry.fuse.search(query)
    cacheEntry.rankedResultsByQuery.set(query, fuseResults)
    return fuseResults
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
    if (!query.trim()) {
        const sliced = items.slice(offset, limit ? offset + limit : undefined)
        return sliced
    }

    const rawResults = getRankedFuzzyResults(items, query)
    const paginatedRawResults = limit
        ? rawResults.slice(offset, offset + limit)
        : rawResults.slice(offset)

    return paginatedRawResults.map((result) => {
        // Handle both plain objects and Mongoose/class instances
        const item = result.item as SearchResultItem
        const baseItem = (typeof item.toObject === "function" ? item.toObject() : { ...result.item }) as Record<string, unknown> & SearchResultItem

        // Ensure ID compatibility
        const id = baseItem._id?.toString() || baseItem.id?.toString()

        return {
            ...baseItem,
            id: id,
            _id: id,
            score: result.score
        } as unknown as T
    })
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

    const filteredEntities = filterEntitiesByOptions(cachedData, options)
    return applyFuzzySearch(filteredEntities, query, limit, offset)
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
    const filteredEntities = filterEntitiesByOptions(allEntities, options)

    return applyFuzzySearch(filteredEntities, query, limit, offset)
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
}
