"use client"

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { CreateMonsterInput, MonsterFilterParams, UpdateMonsterInput } from "../types/monsters.types"
import { copyToNpc, createNpc, deleteNpc, fetchNpcs, updateNpc } from "./npcs-api"

export const npcsKeys = {
    all: ["npcs"] as const,
    lists: () => [...npcsKeys.all, "list"] as const,
    list: (filters: MonsterFilterParams) => [...npcsKeys.lists(), filters] as const,
    infinite: (filters: MonsterFilterParams) => [...npcsKeys.all, "infinite", filters] as const,
}

export function useInfiniteNpcs(filters: MonsterFilterParams = {}, options: { enabled?: boolean; limit?: number } = {}) {
    const limit = options.limit || 10
    return useInfiniteQuery({
        queryKey: npcsKeys.infinite({ ...filters, limit }),
        queryFn: ({ pageParam = 1 }) => fetchNpcs({ ...filters, page: pageParam as number, limit }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const totalPages = Math.ceil(lastPage.total / lastPage.limit)
            return lastPage.page < totalPages ? lastPage.page + 1 : undefined
        },
        ...options,
    })
}

export function useCreateNpc() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateMonsterInput) => createNpc(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: npcsKeys.all })
        },
    })
}

export function useCopyToNpc() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (data: { sourceType: "monster" | "npc"; sourceId: string }) => copyToNpc(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: npcsKeys.all })
        },
    })
}

export function useUpdateNpc() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateMonsterInput }) => updateNpc(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: npcsKeys.all })
        },
    })
}

export function useDeleteNpc() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => deleteNpc(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: npcsKeys.all })
        },
    })
}
