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
    const [status, setStatus] = React.useState<"active" | "inactive" | "all">("all")

    // Filters for query
    const filters = { search, status }

    const tableData = useBackgrounds(filters, 1, 100) // Simple non-infinite for table
    const infiniteData = useInfiniteBackgrounds(filters)

    // Modal states
    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedBackground, setSelectedBackground] = React.useState<Background | null>(null)

    const handleSearchChange = (value: string) => setSearch(value)
    const handleStatusChange = (value: "active" | "inactive" | "all") => setStatus(value)

    const handleCreateClick = () => {
        setSelectedBackground(null)
        setIsFormOpen(true)
    }

    const handleEditClick = (bg: Background) => {
        setSelectedBackground(bg)
        setIsFormOpen(true)
    }

    const handleDeleteClick = (bg: Background) => {
        setSelectedBackground(bg)
        setIsDeleteOpen(true)
    }

    const closeAll = () => {
        setIsFormOpen(false)
        setIsDeleteOpen(false)
        setSelectedBackground(null)
    }

    return {
        isMobile,
        viewMode,
        setViewMode,
        filters: {
            search,
            setSearch,
            status,
            setStatus,
        },
        data: {
            backgrounds: viewMode === "table" ? tableData.data?.items || [] : infiniteData.data?.pages.flatMap((p) => p.items) || [],
            isLoading: viewMode === "table" ? tableData.isLoading : infiniteData.isLoading || infiniteData.isFetching,
            hasNextPage: !!infiniteData.hasNextPage,
            fetchNextPage: infiniteData.fetchNextPage,
            isFetchingNextPage: !!infiniteData.isFetchingNextPage,
            total: tableData.data?.total || 0,
        },
        actions: {
            handleSearchChange,
            handleStatusChange,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            isDeleteOpen,
            setIsDeleteOpen,
            selectedBackground,
            closeAll,
        },
    }
}
