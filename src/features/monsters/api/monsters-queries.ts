"use client"

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { invalidateSearchCache } from "@/core/utils/search-engine"
import type { CreateMonsterInput, Monster, MonsterFilterParams, MonstersResponse, UpdateMonsterInput } from "../types/monsters.types"
import { createMonster, deleteMonster, fetchMonsterById, fetchMonsters, updateMonster } from "./monsters-api"

export const monstersKeys = {
    all: ["monsters"] as const,
    lists: () => [...monstersKeys.all, "list"] as const,
    list: (filters: MonsterFilterParams) => [...monstersKeys.lists(), filters] as const,
    infinite: (filters: MonsterFilterParams) => [...monstersKeys.all, "infinite", filters] as const,
    details: () => [...monstersKeys.all, "detail"] as const,
    detail: (id: string) => [...monstersKeys.details(), id] as const,
}

export function useMonsters(filters: MonsterFilterParams = {}, page = 1, limit = 10, options: { enabled?: boolean } = {}) {
    return useQuery<MonstersResponse, Error>({
        queryKey: monstersKeys.list({ ...filters, page, limit }),
        queryFn: () => fetchMonsters({ ...filters, page, limit }),
        staleTime: 30 * 1000,
        placeholderData: (previousData) => previousData,
        ...options,
    })
}

export function useInfiniteMonsters(filters: MonsterFilterParams = {}, options: { enabled?: boolean; limit?: number } = {}) {
    const limit = options.limit || 10
    return useInfiniteQuery({
        queryKey: monstersKeys.infinite({ ...filters, limit }),
        queryFn: ({ pageParam = 1 }) => fetchMonsters({ ...filters, page: pageParam as number, limit }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const totalPages = Math.ceil(lastPage.total / lastPage.limit)
            return lastPage.page < totalPages ? lastPage.page + 1 : undefined
        },
        ...options,
    })
}

export function useMonster(id: string | null) {
    return useQuery<Monster, Error>({
        queryKey: monstersKeys.detail(id || ""),
        queryFn: () => fetchMonsterById(id!),
        enabled: !!id,
        staleTime: 60 * 1000,
    })
}

export function useCreateMonster() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateMonsterInput) => createMonster(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: monstersKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
            invalidateSearchCache()
        },
    })
}

export function useUpdateMonster() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateMonsterInput }) => updateMonster(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: monstersKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
            invalidateSearchCache()
        },
    })
}

export function useDeleteMonster() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => deleteMonster(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: monstersKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
            invalidateSearchCache()
        },
    })
}
