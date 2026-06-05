"use client"

export const entityRouteMap: Record<string, string> = {
    Regra: "rules",
    Habilidade: "traits",
    Talento: "feats",
    Magia: "spells",
    Classe: "classes",
    Origem: "backgrounds",
    Raça: "races",
    Item: "items",
    Monstro: "monsters",
    NPC: "my-npcs",
}

export function getEntitySlug(name: string) {
    return encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"))
}

export function getEntityRoute(entityType: string) {
    return entityRouteMap[entityType] || "rules"
}

export function getEntityHref(entityType: string, name: string) {
    return `/${getEntityRoute(entityType)}/${getEntitySlug(name)}`
}

export function getEntityDetailQueryKey(entityType: string, slug: string) {
    if (entityType === "NPC") {
        return ["npc-detail", slug] as const
    }

    return [entityType.toLowerCase(), slug] as const
}

export function getEntityDetailCacheValue(entityType: string, entity: unknown) {
    if (entityType === "NPC") {
        return {
            items: [entity],
            total: 1,
            page: 1,
            limit: 1,
        }
    }

    return entity
}
