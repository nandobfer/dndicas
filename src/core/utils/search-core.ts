import Fuse, { type FuseResult } from "fuse.js"
import type { EntityType } from "@/lib/config/colors"

export interface UnifiedEntity {
    id: string
    _id?: string
    name: string
    originalName?: string
    label?: string
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
    score?: number
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

export type SearchableEntity = { name?: string; originalName?: string; label?: string; source?: string; description?: string }
type SearchResultItem = SearchableEntity & {
    id?: { toString: () => string } | string
    _id?: { toString: () => string } | string
    toObject?: () => Record<string, unknown>
}

export const FUSE_OPTIONS = {
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

export type FuzzyCacheEntry<T extends SearchableEntity> = {
    fuse: Fuse<T>
    rankedResultsByQuery: Map<string, FuseResult<T>[]>
}

export function buildFilterCacheKey(options?: UnifiedSearchOptions): string | null {
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

export function createFuzzyCacheEntry<T extends SearchableEntity>(items: T[]): FuzzyCacheEntry<T> {
    return {
        fuse: new Fuse(items, FUSE_OPTIONS),
        rankedResultsByQuery: new Map(),
    }
}

export function filterEntitiesByOptions(items: UnifiedEntity[], options?: UnifiedSearchOptions): UnifiedEntity[] {
    if (!options) return items

    const entityTypes = options.specificEntityTypes?.length
        ? options.specificEntityTypes
        : options.specificEntityType
            ? [options.specificEntityType]
            : null

    return items.filter((entity) => {
        if (entityTypes && !entityTypes.includes(entity.type as EntityType)) return false
        if (options.itemTypes?.length && entity.type === "Item" && !options.itemTypes.includes(entity.itemType ?? "")) return false
        if (options.circles?.length && entity.type === "Magia" && !options.circles.includes(entity.circle ?? -1)) return false
        if (options.parentClassId && entity.type === "Subclasse" && entity.metadata?.parentClassId !== options.parentClassId) return false
        return true
    })
}

function getRankedFuzzyResults<T extends SearchableEntity>(
    cacheEntry: FuzzyCacheEntry<T>,
    query: string
): FuseResult<T>[] {
    const cachedResults = cacheEntry.rankedResultsByQuery.get(query)
    if (cachedResults) return cachedResults

    const fuseResults = cacheEntry.fuse.search(query)
    cacheEntry.rankedResultsByQuery.set(query, fuseResults)
    return fuseResults
}

export function applyFuzzySearchWithCache<T extends SearchableEntity>(
    items: T[],
    query: string,
    cacheEntry: FuzzyCacheEntry<T>,
    limit?: number,
    offset = 0
): T[] {
    if (!query.trim()) {
        return items.slice(offset, limit ? offset + limit : undefined)
    }

    const rawResults = getRankedFuzzyResults(cacheEntry, query)
    const paginatedRawResults = limit
        ? rawResults.slice(offset, offset + limit)
        : rawResults.slice(offset)

    return paginatedRawResults.map((result) => {
        const item = result.item as SearchResultItem
        const baseItem = (typeof item.toObject === "function" ? item.toObject() : { ...result.item }) as Record<string, unknown> & SearchResultItem
        const id = baseItem._id?.toString() || baseItem.id?.toString()

        return {
            ...baseItem,
            id,
            _id: id,
            score: result.score
        } as unknown as T
    })
}

export function applyFuzzySearch<T extends SearchableEntity>(
    items: T[],
    query: string,
    limit?: number,
    offset = 0
): T[] {
    return applyFuzzySearchWithCache(items, query, createFuzzyCacheEntry(items), limit, offset)
}
