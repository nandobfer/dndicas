"use client";

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query"
import type { 
    Race, 
    CreateRaceInput, 
    UpdateRaceInput, 
    RacesFilters, 
    RacesListResponse 
} from "../types/races.types"
import { 
    fetchRaces, 
    fetchRace, 
    createRace, 
    updateRace, 
    deleteRace 
} from "./races-api"

export const racesKeys = {
    all: ["races"] as const,
    lists: () => [...racesKeys.all, "list"] as const,
    list: (filters: RacesFilters) => [...racesKeys.lists(), filters] as const,
    infinite: (filters: RacesFilters) => [...racesKeys.all, "infinite", filters] as const,
    details: () => [...racesKeys.all, "detail"] as const,
    detail: (id: string) => [...racesKeys.details(), id] as const,
}

export function useRaces(
    filters: RacesFilters = {},
    page = 1,
    limit = 10,
    options: { enabled?: boolean } = {}
) {
    return useQuery<RacesListResponse, Error>({
        queryKey: racesKeys.list({ ...filters, page, limit }),
        queryFn: () => fetchRaces({ ...filters, page, limit }),
        staleTime: 30 * 1000,
        ...options,
    })
}

export function useInfiniteRaces(
    filters: RacesFilters = {},
    options: { enabled?: boolean; limit?: number } = {}
) {
    const limit = options.limit || 10

    return useInfiniteQuery({
        queryKey: racesKeys.infinite({ ...filters, limit }),
        queryFn: async ({ pageParam = 1 }) => fetchRaces({ ...filters, page: pageParam as number, limit }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const totalPages = Math.ceil(lastPage.total / lastPage.limit)
            return lastPage.page < totalPages ? lastPage.page + 1 : undefined
        },
        ...options,
    })
}

export function useRace(id: string | null) {
    return useQuery<Race, Error>({
        queryKey: racesKeys.detail(id || ""),
        queryFn: () => fetchRace(id!),
        enabled: !!id,
        staleTime: 60 * 1000,
    })
}

export function useCreateRace() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: CreateRaceInput) => createRace(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: racesKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        },
    })
}

export function useUpdateRace() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateRaceInput }) => updateRace(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: racesKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        },
    })
}

export function useDeleteRace() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => deleteRace(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: racesKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        },
    })
}
