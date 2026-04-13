"use client"

import * as React from "react"
import { useDebounce } from "@/core/hooks/useDebounce"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { useAdminSheets, useInfiniteAdminSheets } from "./useAdminSheets"

export function useAdminSheetsPage(enabled = true) {
    const isMobile = useIsMobile()

    const [page, setPage] = React.useState(1)
    const [search, setSearch] = React.useState("")
    const debouncedSearch = useDebounce(search, 500)

    const filters = React.useMemo(
        () => ({
            search: debouncedSearch,
            limit: 10,
        }),
        [debouncedSearch],
    )

    const desktopData = useAdminSheets(
        {
            ...filters,
            page,
        },
        { enabled: enabled && !isMobile },
    )

    const mobileData = useInfiniteAdminSheets(filters, { enabled: enabled && isMobile })

    const handleSearchChange = (value: string) => {
        setSearch(value)
        setPage(1)
    }

    return {
        isMobile,
        filters: {
            search,
        },
        pagination: {
            page,
            setPage,
            total: desktopData.data?.total || 0,
            limit: 10,
        },
        data: {
            desktop: {
                items: desktopData.data?.items || [],
                isLoading: desktopData.isLoading,
                isFetching: desktopData.isFetching,
                error: desktopData.error,
                refetch: desktopData.refetch,
            },
            mobile: {
                items: mobileData.data?.pages.flatMap((pageData) => pageData.items) || [],
                isLoading: mobileData.isLoading,
                isFetching: mobileData.isFetching,
                isFetchingNextPage: mobileData.isFetchingNextPage,
                hasNextPage: !!mobileData.hasNextPage,
                fetchNextPage: mobileData.fetchNextPage,
                error: mobileData.error,
                refetch: mobileData.refetch,
            },
        },
        actions: {
            handleSearchChange,
        },
    }
}
