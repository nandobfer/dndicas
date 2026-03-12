"use client"

import { useState, useCallback, useDeferredValue } from "react"
import { useInfiniteSheets } from "../api/character-sheets-queries"

export function useSheetList() {
    const [search, setSearch] = useState("")
    const deferredSearch = useDeferredValue(search)

    const query = useInfiniteSheets(deferredSearch || undefined)

    const sheets = query.data?.pages.flatMap((p) => p.sheets) ?? []

    const handleSearch = useCallback((value: string) => {
        setSearch(value)
    }, [])

    return {
        sheets,
        search,
        handleSearch,
        isLoading: query.isLoading,
        isFetchingNextPage: query.isFetchingNextPage,
        hasNextPage: query.hasNextPage,
        fetchNextPage: query.fetchNextPage,
        isError: query.isError,
    }
}
