/**
 * @fileoverview TanStack Query hooks for fetching feats data.
 * Manages server state with caching and automatic refetching.
 *
 * @see specs/003-feats-catalog/quickstart.md
 */

import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import { fetchFeats, fetchFeat } from "../api/feats-api"
import { FeatsFilters, FeatsResponse, Feat } from "../types/feats.types"

export const featKeys = {
    all: ["feats"] as const,
    lists: () => [...featKeys.all, "list"] as const,
    list: (filters: FeatsFilters) => [...featKeys.lists(), filters] as const,
    infinite: (filters: Omit<FeatsFilters, "page">) => [...featKeys.all, "infinite", filters] as const,
    details: () => [...featKeys.all, "detail"] as const,
    detail: (id: string) => [...featKeys.details(), id] as const,
}

export function useFeats(filters: FeatsFilters = { page: 1, limit: 10, status: "all" }, options: { enabled?: boolean } = {}) {
    return useQuery<FeatsResponse>({
        queryKey: featKeys.list(filters),
        queryFn: () => fetchFeats(filters),
        placeholderData: (previousData) => previousData, // Keep previous data while fetching
        ...options,
    })
}

export function useInfiniteFeats(filters: Omit<FeatsFilters, "page">, options: { enabled?: boolean } = {}) {
    return useInfiniteQuery({
        queryKey: featKeys.infinite(filters),
        queryFn: async ({ pageParam = 1 }) => {
            return fetchFeats({
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

export function useFeat(id: string | null) {
    return useQuery<Feat>({
        queryKey: featKeys.detail(id!),
        queryFn: () => fetchFeat(id!),
        enabled: !!id,
    })
}
