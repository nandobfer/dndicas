/**
 * @fileoverview Central search engine for multi-entity lookups.
 * Used by Global Search FAB and Mentions system (Tiptap).
 */

export interface UnifiedEntity {
    id: string;
    _id?: string;
    name: string;
    label?: string; // For compatibility
    type: "Regra" | "Magia" | "Habilidade" | "Talento";
    description?: string;
    source?: string;
    status: "active" | "inactive";
    metadata?: any;
    school?: string;
    circle?: number;
}

export const ENTITY_PROVIDERS = [
    {
        name: "Regra" as const,
        endpoint: (query: string, limit = 10) => `/api/rules?search=${query}&limit=${limit}&searchField=name`,
        map: (item: any): UnifiedEntity => ({
            id: item._id || item.id,
            _id: item._id,
            name: item.name,
            label: item.name, // Added for MentionList compatibility
            type: "Regra",
            description: item.description,
            source: item.source,
            status: item.status || "active",
        }),
    },
    {
        name: "Habilidade" as const,
        endpoint: (query: string, limit = 10) => `/api/traits/search?q=${query}&limit=${limit}`,
        map: (item: any): UnifiedEntity => ({
            id: item._id || item.id,
            _id: item._id,
            name: item.name,
            label: item.name, // Added for MentionList compatibility
            type: "Habilidade",
            description: item.description,
            source: item.source,
            status: item.status || "active",
        }),
    },
    {
        name: "Talento" as const,
        endpoint: (query: string, limit = 10) => `/api/feats/search?query=${query}&limit=${limit}`,
        map: (item: any): UnifiedEntity => ({
            id: item.id || item._id,
            _id: item._id,
            name: item.label || item.name,
            label: item.label || item.name,
            type: "Talento",
            description: item.metadata?.description || item.description,
            status: "active", // Feats often don't have status in search
            metadata: item.metadata,
        }),
    },
    {
        name: "Magia" as const,
        endpoint: (query: string, limit = 10) => `/api/spells/search?q=${query}&limit=${limit}`,
        map: (item: any): UnifiedEntity => ({
            id: item.id || item._id,
            _id: item._id,
            name: item.label || item.name,
            label: item.label || item.name,
            type: "Magia",
            description: item.description,
            school: item.school,
            circle: item.circle,
            status: item.status || "active",
        }),
    },
];

/**
 * Performs a search across all entity providers.
 */
export async function performUnifiedSearch(query: string, limitPerProvider = 5): Promise<UnifiedEntity[]> {
    if (!query.trim()) return [];

    const fetchPromises = ENTITY_PROVIDERS.map(async (provider) => {
        try {
            const res = await fetch(provider.endpoint(query, limitPerProvider));
            if (!res.ok) return [];
            const data = await res.json();

            let rawItems: any[] = [];
            if (Array.isArray(data)) rawItems = data;
            else if (data.items) rawItems = data.items;
            else if (data.spells) rawItems = data.spells;
            else if (data.traits) rawItems = data.traits;
            else if (data.rules) rawItems = data.rules;
            else if (data.feats) rawItems = data.feats;

            return rawItems.map(provider.map);
        } catch (err) {
            console.error(`Search failed for ${provider.name}:`, err);
            return [];
        }
    });

    const results = await Promise.all(fetchPromises);
    return results.flat();
}
