"use client";

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query"
import type { 
    Background, 
    CreateBackgroundInput, 
    UpdateBackgroundInput, 
    BackgroundsFilters, 
    BackgroundsListResponse 
} from "../types/backgrounds.types"
import { 
    fetchBackgrounds, 
    fetchBackground, 
    createBackground, 
    updateBackground, 
    deleteBackground 
} from "./backgrounds-api"

export const backgroundsKeys = {
    all: ["backgrounds"] as const,
    lists: () => [...backgroundsKeys.all, "list"] as const,
    list: (filters: BackgroundsFilters) => [...backgroundsKeys.lists(), filters] as const,
    infinite: (filters: BackgroundsFilters) => [...backgroundsKeys.all, "infinite", filters] as const,
    details: () => [...backgroundsKeys.all, "detail"] as const,
    detail: (id: string) => [...backgroundsKeys.details(), id] as const,
}

export function useBackgrounds(
    filters: BackgroundsFilters = {},
    page = 1,
    limit = 10,
    options: { enabled?: boolean } = {}
) {
    return useQuery<BackgroundsListResponse, Error>({
        queryKey: backgroundsKeys.list({ ...filters, page, limit }),
        queryFn: () => fetchBackgrounds({ ...filters, page, limit }),
        staleTime: 30 * 1000,
        placeholderData: (previousData) => previousData,
        ...options,
    })
}

export function useInfiniteBackgrounds(
    filters: BackgroundsFilters = {},
    options: { enabled?: boolean; limit?: number } = {}
) {
    const limit = options.limit || 10

    return useInfiniteQuery({
        queryKey: backgroundsKeys.infinite({ ...filters, limit }),
        queryFn: async ({ pageParam = 1 }) => fetchBackgrounds({ ...filters, page: pageParam as number, limit }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const totalPages = Math.ceil(lastPage.total / lastPage.limit)
            return lastPage.page < totalPages ? lastPage.page + 1 : undefined
        },
        ...options,
    })
}

export function useBackground(id: string | null) {
    return useQuery<Background, Error>({
        queryKey: backgroundsKeys.detail(id || ""),
        queryFn: () => fetchBackground(id!),
        enabled: !!id,
        staleTime: 60 * 1000,
    })
}

export function useCreateBackground() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: CreateBackgroundInput) => createBackground(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: backgroundsKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        },
    })
}

export function useUpdateBackground() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateBackgroundInput }) => updateBackground(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: backgroundsKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        },
    })
}

export function useDeleteBackground() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => deleteBackground(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: backgroundsKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        },
    })
}
