import type { UnifiedEntity, UnifiedSearchOptions } from "@/core/utils/search-core"

type SearchDataResponse = {
    items?: UnifiedEntity[]
}

function appendListParam(params: URLSearchParams, name: string, values?: Array<string | number>): void {
    if (!values?.length) return
    params.set(name, values.join(","))
}

export async function searchUnifiedEntitiesOnServer(
    query: string,
    limit = 20,
    offset = 0,
    options?: UnifiedSearchOptions,
): Promise<UnifiedEntity[]> {
    const params = new URLSearchParams({
        q: query,
        limit: String(limit),
        offset: String(offset),
    })

    if (options?.specificEntityType) {
        params.set("type", options.specificEntityType)
    }
    appendListParam(params, "types", options?.specificEntityTypes)
    appendListParam(params, "itemTypes", options?.itemTypes)
    appendListParam(params, "circles", options?.circles)
    if (options?.parentClassId) {
        params.set("parentClassId", options.parentClassId)
    }

    const response = await fetch(`/api/search?${params.toString()}`)
    if (!response.ok) {
        throw new Error("Erro ao buscar entidades")
    }

    const data = await response.json() as SearchDataResponse
    return data.items ?? []
}
