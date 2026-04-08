"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useDebounce } from "@/core/hooks/useDebounce"
import type { ClassesFilters } from "../types/classes.types"

const DEFAULT_LIMIT = 10
const SEARCH_DEBOUNCE_MS = 300

export function useClassFilters() {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [page, setPageState] = useState(() => {
        const p = searchParams.get("page")
        return p ? parseInt(p, 10) : 1
    })
    const [limit] = useState(DEFAULT_LIMIT)
    const [search, setSearchState] = useState(() => searchParams.get("search") || "")
    const [status, setStatusState] = useState<ClassesFilters["status"]>(() => {
        const s = searchParams.get("status")
        return (s as ClassesFilters["status"]) || "all"
    })
    const [sources, setSourcesState] = useState<string[]>(() => {
        const s = searchParams.get("sources")
        return s ? s.split(",") : []
    })

    const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS)

    const setSearch = useCallback((value: string) => {
        setSearchState(value)
        setPageState(1)
    }, [])

    const setStatus = useCallback((value: ClassesFilters["status"]) => {
        setStatusState(value)
        setPageState(1)
    }, [])

    const setSources = useCallback((value: string[]) => {
        setSourcesState(value)
        setPageState(1)
    }, [])

    const setPage = useCallback((newPage: number) => setPageState(newPage), [])

    const resetFilters = useCallback(() => {
        setSearchState("")
        setStatusState("all")
        setSourcesState([])
        setPageState(1)
    }, [])

    const filters: ClassesFilters & { page: number; limit: number } = useMemo(
        () => ({
            search: debouncedSearch,
            status,
            sources: sources.length > 0 ? sources : undefined,
            page,
            limit
        }),
        [debouncedSearch, status, sources, page, limit]
    )

    useEffect(() => {
        const params = new URLSearchParams()
        if (search) params.set("search", search)
        if (status && status !== "all") params.set("status", status)
        if (page > 1) params.set("page", page.toString())
        if (sources.length > 0) params.set("sources", sources.join(","))

        const qs = params.toString()
        const newUrl = qs ? `?${qs}` : window.location.pathname
        router.replace(newUrl, { scroll: false })
    }, [search, status, page, sources, router])

    return {
        filters,
        search,
        debouncedSearch,
        page,
        limit,
        setSearch,
        setStatus,
        setSources,
        setPage,
        resetFilters
    }
}
