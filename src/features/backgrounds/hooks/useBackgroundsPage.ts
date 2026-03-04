/**
 * @fileoverview Hook for managing backgrounds list state.
 * Centralizes filter management, pagination, and modal control.
 */

"use client";

import * as React from "react"
import { useBackgrounds, useInfiniteBackgrounds } from "../api/backgrounds-queries"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { useViewMode } from "@/core/hooks/useViewMode"
import type { Background } from "../types/backgrounds.types"

export function useBackgroundsPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode } = useViewMode()

    const [search, setSearch] = React.useState("")

    // Filters for query
    const filters = { search }

    const tableData = useBackgrounds(filters, 1, 100) // Simple non-infinite for table
    const infiniteData = useInfiniteBackgrounds(filters)

    // Modal states
    const [isCreateOpen, setIsCreateOpen] = React.useState(false)
    const [isEditOpen, setIsEditOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedBackground, setSelectedBackground] = React.useState<Background | null>(null)

    return {
        isMobile,
        viewMode,
        setViewMode,
        filters: {
            search,
            setSearch
        },
        data: {
            backgrounds: viewMode === "table" ? (tableData.data?.items || []) : (infiniteData.data?.pages.flatMap(p => p.items) || []),
            isLoading: viewMode === "table" ? tableData.isLoading : (infiniteData.isLoading || infiniteData.isFetching),
            hasNextPage: !!infiniteData.hasNextPage,
            fetchNextPage: infiniteData.fetchNextPage,
            isFetchingNextPage: !!infiniteData.isFetchingNextPage,
            total: tableData.data?.total || 0,
        },
        modals: {
            isCreateOpen,
            isEditOpen,
            isDeleteOpen,
            selectedBackground,
            openCreate: () => {
                setSelectedBackground(null)
                setIsCreateOpen(true)
            },
            openEdit: (bg: Background) => {
                setSelectedBackground(bg)
                setIsEditOpen(true)
            },
            openDelete: (bg: Background) => {
                setSelectedBackground(bg)
                setIsDeleteOpen(true)
            },
            closeAll: () => {
                setIsCreateOpen(false)
                setIsEditOpen(false)
                setIsDeleteOpen(false)
                setSelectedBackground(null)
            }
        }
    }
}
