"use client"

import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { fetchAdminSheets } from "../api/admin-sheets-api"
import type { AdminSheetsListResponse } from "../types/character-sheet.types"

export interface AdminSheetsFilters {
    search?: string
    page?: number
    limit?: number
}

export const adminSheetsKeys = {
    all: ["admin-sheets"] as const,
    lists: () => [...adminSheetsKeys.all, "list"] as const,
    list: (filters: AdminSheetsFilters) => [...adminSheetsKeys.lists(), filters] as const,
}

export function useAdminSheets(filters: AdminSheetsFilters, options: { enabled?: boolean } = {}) {
    return useQuery<AdminSheetsListResponse, Error>({
        queryKey: adminSheetsKeys.list(filters),
        queryFn: () => fetchAdminSheets(filters),
        staleTime: 30 * 1000,
        placeholderData: (previousData) => previousData,
        ...options,
    })
}

export function useInfiniteAdminSheets(filters: AdminSheetsFilters, options: { enabled?: boolean } = {}) {
    return useInfiniteQuery<AdminSheetsListResponse, Error>({
        queryKey: [...adminSheetsKeys.list(filters), "infinite"],
        queryFn: ({ pageParam = 1 }) => fetchAdminSheets({ ...filters, page: pageParam as number }),
        getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
        initialPageParam: 1,
        staleTime: 30 * 1000,
        ...options,
    })
}
