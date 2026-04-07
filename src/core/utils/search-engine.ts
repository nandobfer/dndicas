import Fuse from "fuse.js"
import { ENTITY_PROVIDERS } from "@/lib/config/entities"

/**
 * @fileoverview Central search engine for multi-entity lookups.
 * Includes Fuse.js fuzzy search with weighted scoring.
 */

export interface UnifiedEntity {
    id: string
    _id?: string
    name: string
    label?: string // For compatibility
    type: "Regra" | "Magia" | "Habilidade" | "Talento" | "Classe" | "Origem" | "Raça" | "Item"
    description?: string
    source?: string
    status: "active" | "inactive"
    metadata?: any
    school?: string
    circle?: number
    saveAttribute?: string
    component?: string[]
    baseDice?: any
    extraDicePerLevel?: any
    rarity?: string
    itemType?: string
    price?: string
    damageDice?: any
    damageType?: string
    ac?: number
    acType?: string
    armorType?: string
    acBonus?: number
    attributeUsed?: string
    image?: string
    isMagic?: boolean
    traits?: any[]
    properties?: any[]
    additionalDamage?: any[]
    mastery?: string
    score?: number // Added for weighted sorting visibility if needed
}

// Simple in-memory cache for search data
let cachedData: UnifiedEntity[] | null = null
let lastFetchTime = 0
const CACHE_TTL = 1000 * 60 * 5 // 5 minutes

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
            const data = await res.json()

            let rawItems: any[] = []
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

            return rawItems.map(provider.map)
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

/**
 * Applies weighted fuzzy search to a list of entities.
 */
export function applyFuzzySearch<T extends { name?: string; label?: string; source?: string; description?: string }>(
    items: T[],
    query: string,
    limit?: number,
    offset = 0
): T[] {
    if (!query.trim()) {
        const sliced = items.slice(offset, limit ? offset + limit : undefined)
        return sliced
    }

    const fuse = new Fuse(items, {
        keys: [
            { name: "name", weight: 10 },
            { name: "label", weight: 10 },
            { name: "source", weight: 5 },
            { name: "description", weight: 1 }
        ],
        threshold: 0.35,
        includeScore: true,
        shouldSort: true,
        minMatchCharLength: 2
    })

    const fuseResults = fuse.search(query)
    const mapped = fuseResults.map((result) => {
        // Handle both plain objects and Mongoose/class instances
        const baseItem = typeof (result.item as any).toObject === "function" ? (result.item as any).toObject() : { ...result.item }

        // Ensure ID compatibility
        const id = baseItem._id?.toString() || baseItem.id?.toString()

        return {
            ...baseItem,
            id: id,
            _id: id,
            score: result.score
        }
    })

    return limit ? mapped.slice(offset, offset + limit) : mapped
}

/**
 * Performs a fuzzy search across all entities with weighted scoring.
 */
export async function performUnifiedSearch(query: string, limit = 20, offset = 0): Promise<UnifiedEntity[]> {
    if (!query.trim()) return []

    const allEntities = await getSearchData()
    return applyFuzzySearch(allEntities, query, limit, offset)
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
}
