"use client"

import * as React from "react"
import { useDebounce } from "@/core/hooks/useDebounce"
import { useInfiniteAdminSheets } from "./useAdminSheets"

export function useAdminSheetsPage(enabled = true) {
    const [search, setSearch] = React.useState("")
    const debouncedSearch = useDebounce(search, 500)

    const filters = React.useMemo(
        () => ({
            search: debouncedSearch,
            limit: 10,
        }),
        [debouncedSearch],
    )

    const sheetsData = useInfiniteAdminSheets(filters, { enabled })
    const items = sheetsData.data?.pages.flatMap((pageData) => pageData.items) || []

    const handleSearchChange = React.useCallback((value: string) => {
        setSearch(value)
    }, [])

    return {
        filters: {
            search,
        },
        data: {
            items,
            isLoading: sheetsData.isLoading,
            isFetching: sheetsData.isFetching,
            isFetchingNextPage: sheetsData.isFetchingNextPage,
            hasNextPage: !!sheetsData.hasNextPage,
            fetchNextPage: sheetsData.fetchNextPage,
            error: sheetsData.error,
            refetch: sheetsData.refetch,
        },
        actions: {
            handleSearchChange,
        },
    }
}
