// src/features/rules/hooks/useRules.ts
import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import { fetchRules, fetchRule } from "../api/rules-api"
import { RulesFilters, RulesResponse, Reference } from "../types/rules.types"

export function useRules(filters: RulesFilters = { page: 1, limit: 10, status: "all" }, options: { enabled?: boolean } = {}) {
    return useQuery<RulesResponse>({
        queryKey: ["rules", filters],
        queryFn: () => fetchRules(filters),
        placeholderData: (previousData) => previousData, // Keep previous data while fetching
        ...options,
    })
}

export function useInfiniteRules(filters: Omit<RulesFilters, "page">, options: { enabled?: boolean } = {}) {
    return useInfiniteQuery({
        queryKey: ["rules-infinite", filters],
        queryFn: async ({ pageParam = 1 }) => {
            return fetchRules({
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

export function useRule(id: string | null) {
  return useQuery<Reference>({
    queryKey: ['rule', id],
    queryFn: () => fetchRule(id!),
    enabled: !!id,
  });
}
