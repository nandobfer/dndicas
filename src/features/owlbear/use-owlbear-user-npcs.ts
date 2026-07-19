"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import type { MonsterFilterParams } from "@/features/monsters/types/monsters.types"
import { fetchOwlbearUserNpcs } from "./room-npcs-api"

export const owlbearUserNpcsKeys = {
    all: ["owlbear-user-npcs"] as const,
    infinite: (roomId: string | null, filters: MonsterFilterParams) => [...owlbearUserNpcsKeys.all, "infinite", roomId, filters] as const,
}

export function useInfiniteOwlbearUserNpcs(
    roomId: string | null,
    sessionToken: string | null,
    filters: MonsterFilterParams = {},
    options: { enabled?: boolean; limit?: number } = {},
) {
    const limit = options.limit || 10
    return useInfiniteQuery({
        queryKey: owlbearUserNpcsKeys.infinite(roomId, { ...filters, limit }),
        queryFn: ({ pageParam = 1 }) => {
            if (!roomId || !sessionToken) throw new Error("Sessão Owlbear indisponível")
            return fetchOwlbearUserNpcs(roomId, sessionToken, { ...filters, page: pageParam as number, limit })
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const totalPages = Math.ceil(lastPage.total / lastPage.limit)
            return lastPage.page < totalPages ? lastPage.page + 1 : undefined
        },
        ...options,
        enabled: !!roomId && !!sessionToken && (options.enabled ?? true),
    })
}
