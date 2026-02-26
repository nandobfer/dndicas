// src/features/traits/hooks/useTraits.ts
import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import { fetchTraits, fetchTraitById } from "../api/traits-api"
import { TraitFilterParams, TraitsResponse, Trait } from "../types/traits.types"

export const traitKeys = {
    all: ["traits"] as const,
    lists: () => [...traitKeys.all, "list"] as const,
    list: (filters: TraitFilterParams) => [...traitKeys.lists(), filters] as const,
    infinite: (filters: Omit<TraitFilterParams, "page">) => [...traitKeys.all, "infinite", filters] as const,
    details: () => [...traitKeys.all, "detail"] as const,
    detail: (id: string) => [...traitKeys.details(), id] as const,
}

export function useTraits(filters: TraitFilterParams = { page: 1, limit: 10, status: "all" }, options: { enabled?: boolean } = {}) {
    return useQuery<TraitsResponse>({
        queryKey: traitKeys.list(filters),
        queryFn: () => fetchTraits(filters),
        placeholderData: (previousData) => previousData, // Keep previous data while fetching
        ...options,
    })
}

export function useInfiniteTraits(filters: Omit<TraitFilterParams, "page">, options: { enabled?: boolean } = {}) {
    return useInfiniteQuery({
        queryKey: traitKeys.infinite(filters),
        queryFn: async ({ pageParam = 1 }) => {
            return fetchTraits({
                ...filters,
                page: pageParam as number,
                limit: filters.limit || 10,
            })
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const totalPages = Math.ceil(lastPage.total / lastPage.limit)
            return lastPage.page < totalPages ? lastPage.page + 1 : undefined
        },
        ...options,
    })
}

export function useTrait(id: string | null) {
  return useQuery<Trait>({
    queryKey: traitKeys.detail(id!),
    queryFn: () => fetchTraitById(id!),
    enabled: !!id,
  });
}
