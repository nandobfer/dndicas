"use client"

import * as React from "react"
import { useDebounce } from "./useDebounce"
import { performUnifiedSearch, type UnifiedEntity } from "@/core/utils/search-engine"

export type SearchResult = UnifiedEntity

export function useGlobalSearch() {
    const [query, setQuery] = React.useState("")
    const [results, setResults] = React.useState<SearchResult[]>([])
    const [isLoading, setIsLoading] = React.useState(false)
    const [page, setPage] = React.useState(1)
    const [hasMore, setHasMore] = React.useState(true)
    const [isFetchingNextPage, setIsFetchingNextPage] = React.useState(false)
    const debouncedQuery = useDebounce(query, 500)
    
    const PAGE_SIZE = 20

    const performSearch = React.useCallback(async (q: string, currentPage: number, isInitial = true) => {
        if (!q.trim()) {
            setResults([])
            setHasMore(false)
            return
        }

        if (isInitial) {
            setIsLoading(true)
        } else {
            setIsFetchingNextPage(true)
        }

        try {
            const offset = (currentPage - 1) * PAGE_SIZE
            const searchResults = await performUnifiedSearch(q, PAGE_SIZE, offset)

            if (isInitial) {
                setResults(searchResults)
            } else {
                setResults((prev) => [...prev, ...searchResults])
            }

            // If we got fewer results than the page size, there are no more
            setHasMore(searchResults.length === PAGE_SIZE)
        } catch (err) {
            console.error("Global search failed:", err)
        } finally {
            setIsLoading(false)
            setIsFetchingNextPage(false)
        }
    }, [])

    const loadMore = React.useCallback(() => {
        if (isLoading || isFetchingNextPage || !hasMore) return
        const nextPage = page + 1
        setPage(nextPage)
        performSearch(debouncedQuery, nextPage, false)
    }, [isLoading, isFetchingNextPage, hasMore, page, debouncedQuery, performSearch])

    React.useEffect(() => {
        setPage(1)
        performSearch(debouncedQuery, 1, true)
    }, [debouncedQuery, performSearch])

    return {
        query,
        setQuery,
        results,
        isLoading,
        isFetchingNextPage,
        hasNextPage: hasMore,
        loadMore,
        isSearching: query !== debouncedQuery
    }
}