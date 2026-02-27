"use client"

import * as React from "react"
import { useDebounce } from "./useDebounce"
import { performUnifiedSearch, type UnifiedEntity } from "@/core/utils/search-engine"

export type SearchResult = UnifiedEntity

export function useGlobalSearch() {
    const [query, setQuery] = React.useState("")
    const [results, setResults] = React.useState<SearchResult[]>([])
    const [isLoading, setIsLoading] = React.useState(false)
    const debouncedQuery = useDebounce(query, 500)

    const performSearch = React.useCallback(async (q: string) => {
        if (!q.trim()) {
            setResults([])
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        try {
            const allResults = await performUnifiedSearch(q, 5)
            setResults(allResults)
        } catch (err) {
            console.error("Global search failed:", err)
        } finally {
            setIsLoading(false)
        }
    }, [])

    React.useEffect(() => {
        performSearch(debouncedQuery)
    }, [debouncedQuery, performSearch])

    return {
        query,
        setQuery,
        results,
        isLoading,
        isSearching: query !== debouncedQuery,
    }
}