"use client"

import { useQuery } from "@tanstack/react-query"

const fetchSources = async (entityType: string): Promise<string[]> => {
    const res = await fetch(`/api/sources?entity=${entityType}`)
    if (!res.ok) throw new Error("Erro ao buscar fontes")
    const data = await res.json()
    return data.sources as string[]
}

/**
 * Hook to fetch distinct book names (source field) for a given entity type.
 * Results are cached for 5 minutes.
 *
 * @example
 * const { sources, isLoading } = useSources("spells")
 */
export function useSources(entityType: string) {
    const { data, isLoading, isError } = useQuery<string[]>({
        queryKey: ["sources", entityType],
        queryFn: () => fetchSources(entityType),
        staleTime: 5 * 60 * 1000,
        enabled: !!entityType,
    })

    return {
        sources: data || [],
        isLoading,
        isError,
    }
}
