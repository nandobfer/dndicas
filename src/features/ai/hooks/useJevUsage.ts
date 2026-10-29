"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { JEV_USAGE_UPDATED_EVENT } from "@/lib/ai/jev-usage"
import type { JevUsageQuery, JevUsageSummary } from "../jev-usage"
import { AI_QUERY_KEY } from "./useAi"

const queryKey = [AI_QUERY_KEY, "usage", "jev"] as const

export function useJevUsage(query: JevUsageQuery | null) {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const refresh = () => void queryClient.invalidateQueries({ queryKey })
        channel.bind(JEV_USAGE_UPDATED_EVENT, refresh)
        // Cada nova assinatura (inclusive reconexão) repõe os eventos que podem ter sido perdidos.
        channel.bind("pusher:subscription_succeeded", refresh)
        return () => {
            channel.unbind(JEV_USAGE_UPDATED_EVENT, refresh)
            channel.unbind("pusher:subscription_succeeded", refresh)
            releaseChannel(name)
        }
    }, [queryClient])
    return useQuery({
        queryKey: [...queryKey, query],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<JevUsageSummary>>("/ai/providers/jev/usage", { params: query })).data),
        enabled: query !== null,
    })
}
