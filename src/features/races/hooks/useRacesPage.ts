/**
 * @fileoverview Hook for managing races list state.
 */

"use client";

import * as React from "react"
import { useRaces, useInfiniteRaces } from "../api/races-queries"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { useViewMode } from "@/core/hooks/useViewMode"
import type { Race } from "../types/races.types"

export function useRacesPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode } = useViewMode()

    const [search, setSearch] = React.useState("")
    const [status, setStatus] = React.useState<"active" | "inactive" | "all">("all")

    const filters = { search, status }

    const tableData = useRaces(filters, 1, 100)
    const infiniteData = useInfiniteRaces(filters)

    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedRace, setSelectedRace] = React.useState<Race | null>(null)

    const handleSearchChange = (value: string) => setSearch(value)
    const handleStatusChange = (value: "active" | "inactive" | "all") => setStatus(value)

    const handleCreateClick = () => {
        setSelectedRace(null)
        setIsFormOpen(true)
    }

    const handleEditClick = (race: Race) => {
        setSelectedRace(race)
        setIsFormOpen(true)
    }

    const handleDeleteClick = (race: Race) => {
        setSelectedRace(race)
        setIsDeleteOpen(true)
    }

    const closeAll = () => {
        setIsFormOpen(false)
        setIsDeleteOpen(false)
        setSelectedRace(null)
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
            races: viewMode === "table" ? tableData.data?.items || [] : infiniteData.data?.pages.flatMap((p) => p.items) || [],
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
            selectedRace,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            closeAll,
        },
    }
}
