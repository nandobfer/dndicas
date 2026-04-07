"use client";

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query"
import type { 
    Item, 
    CreateItemInput, 
    UpdateItemInput, 
    ItemFilterParams, 
    ItemsResponse 
} from "../types/items.types"
import { 
    fetchItems, 
    fetchItemById, 
    createItem, 
    updateItem, 
    deleteItem 
} from "./items-api"
import { invalidateSearchCache } from "@/core/utils/search-engine"

export const itemsKeys = {
    all: ["items"] as const,
    lists: () => [...itemsKeys.all, "list"] as const,
    list: (filters: ItemFilterParams) => [...itemsKeys.lists(), filters] as const,
    infinite: (filters: ItemFilterParams) => [...itemsKeys.all, "infinite", filters] as const,
    details: () => [...itemsKeys.all, "detail"] as const,
    detail: (id: string) => [...itemsKeys.details(), id] as const,
}

export function useItems(
    filters: ItemFilterParams = {},
    page = 1,
    limit = 10,
    options: { enabled?: boolean } = {}
) {
    return useQuery<ItemsResponse, Error>({
        queryKey: itemsKeys.list({ ...filters, page, limit }),
        queryFn: () => fetchItems({ ...filters, page, limit }),
        staleTime: 30 * 1000,
        ...options,
    })
}

export function useInfiniteItems(
    filters: ItemFilterParams = {},
    options: { enabled?: boolean; limit?: number } = {}
) {
    const limit = options.limit || 10

    return useInfiniteQuery({
        queryKey: itemsKeys.infinite({ ...filters, limit }),
        queryFn: async ({ pageParam = 1 }) => fetchItems({ ...filters, page: pageParam as number, limit }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const totalPages = Math.ceil(lastPage.total / lastPage.limit)
            return lastPage.page < totalPages ? (lastPage.page as number) + 1 : undefined
        },
        ...options,
    })
}

export function useItem(id: string | null) {
    return useQuery<Item, Error>({
        queryKey: itemsKeys.detail(id || ""),
        queryFn: () => fetchItemById(id!),
        enabled: !!id,
        staleTime: 60 * 1000,
    })
}

export function useCreateItem() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: CreateItemInput) => createItem(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemsKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
            invalidateSearchCache()
        },
    })
}

export function useUpdateItem() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateItemInput }) => updateItem(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemsKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
            invalidateSearchCache()
        },
    })
}

export function useDeleteItem() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => deleteItem(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: itemsKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
            invalidateSearchCache()
        },
    })
}
