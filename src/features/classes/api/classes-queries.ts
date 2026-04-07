/**
 * @fileoverview TanStack Query hooks for Classes feature.
 */

"use client";

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query"
import type { CharacterClass, CreateClassInput, UpdateClassInput, ClassesFilters, ClassesListResponse } from "../types/classes.types"
import { fetchClasses, fetchClass, createClass, updateClass, deleteClass } from "./classes-api"
import { invalidateSearchCache } from "@/core/utils/search-engine"

export const classesKeys = {
    all: ["classes"] as const,
    lists: () => [...classesKeys.all, "list"] as const,
    list: (filters: ClassesFilters & { page?: number; limit?: number }) => [...classesKeys.lists(), filters] as const,
    infinite: (filters: ClassesFilters & { limit?: number }) => [...classesKeys.all, "infinite", filters] as const,
    details: () => [...classesKeys.all, "detail"] as const,
    detail: (id: string) => [...classesKeys.details(), id] as const,
}

export function useClasses(
    filters: ClassesFilters = {},
    page = 1,
    limit = 10,
    options: { enabled?: boolean } = {}
) {
    return useQuery<ClassesListResponse, Error>({
        queryKey: classesKeys.list({ ...filters, page, limit }),
        queryFn: () => fetchClasses({ ...filters, page, limit }),
        staleTime: 30 * 1000,
        placeholderData: (previousData) => previousData,
        ...options,
    })
}

export function useInfiniteClasses(
    filters: ClassesFilters = {},
    options: { enabled?: boolean; limit?: number } = {}
) {
    const limit = options.limit || 10

    return useInfiniteQuery({
        queryKey: classesKeys.infinite({ ...filters, limit }),
        queryFn: async ({ pageParam = 1 }) => fetchClasses({ ...filters, page: pageParam as number, limit }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const totalPages = Math.ceil(lastPage.total / lastPage.limit)
            return lastPage.page < totalPages ? lastPage.page + 1 : undefined
        },
        ...options,
    })
}

export function useClass(id: string | null) {
    return useQuery<CharacterClass, Error>({
        queryKey: classesKeys.detail(id || ""),
        queryFn: () => fetchClass(id!),
        enabled: !!id,
        staleTime: 60 * 1000,
    })
}

export function useCreateClass() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: CreateClassInput) => createClass(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: classesKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
            invalidateSearchCache()
        },
    })
}

export function useUpdateClass() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateClassInput }) => updateClass(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: classesKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
            invalidateSearchCache()
        },
    })
}

export function useDeleteClass() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => deleteClass(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: classesKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
            invalidateSearchCache()
        },
    })
}
