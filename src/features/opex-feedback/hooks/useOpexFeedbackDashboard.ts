"use client"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { usePersistentState } from "@/hooks/usePersistentState"
import { withBasePath } from "@/lib/base-path"
import { dashboardPeriodSchema, DEFAULT_DASHBOARD_PERIOD, DASHBOARD_PERIOD_STORAGE_KEY, periodRange } from "../period"
import type { ClienteDashboardDto } from "../types"
import { readOpexResponse } from "./useOpexFeedbackAccess"

export function useOpexFeedbackDashboard(userId: string | undefined, enabled: boolean) {
    const { value: period, setValue: setPeriod, ready } = usePersistentState(DASHBOARD_PERIOD_STORAGE_KEY, dashboardPeriodSchema, DEFAULT_DASHBOARD_PERIOD)
    const range = useMemo(() => periodRange(period), [period])
    const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", [])
    const query = useQuery({
        queryKey: ["opex-feedback", userId, "dashboard", range.from, range.to, timeZone],
        queryFn: async () => readOpexResponse<ClienteDashboardDto>(await fetch(withBasePath(`/api/opex-feedback/dashboard?${new URLSearchParams({ ...range, timeZone })}`), { cache: "no-store" })),
        enabled: enabled && ready && Boolean(userId), retry: false, gcTime: 0,
    })
    return { period, setPeriod, ready, query }
}
