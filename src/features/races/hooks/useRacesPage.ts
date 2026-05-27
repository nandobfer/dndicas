/**
 * @fileoverview Hook for managing races list state.
 */

"use client";

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useInfiniteRaces } from "../api/races-queries"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { useViewMode } from "@/core/hooks/useViewMode"
import type { Race } from "../types/races.types"

export function useRacesPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode } = useViewMode()
    const queryClient = useQueryClient()

    const [search, setSearch] = React.useState("")
    const [status, setStatus] = React.useState<"active" | "inactive" | "all">("all")
    const [sources, setSources] = React.useState<string[]>([])

    const filters = { search, status, sources: sources.length > 0 ? sources : undefined }

    const infiniteData = useInfiniteRaces(filters)

    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [isGenerationOpen, setIsGenerationOpen] = React.useState(false)
    const [selectedRace, setSelectedRace] = React.useState<Race | null>(null)

    const handleSearchChange = (value: string) => setSearch(value)
    const handleStatusChange = (value: "active" | "inactive" | "all") => setStatus(value)
    const handleSourcesChange = (value: string[]) => setSources(value)

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

    const handleGenerateAIClick = (race: Race) => {
        setSelectedRace(race)
        setIsGenerationOpen(true)
    }

    const handleGenerationApplied = () => {
        queryClient.invalidateQueries({ queryKey: ["races"] })
        queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
    }

    const closeAll = () => {
        setIsFormOpen(false)
        setIsDeleteOpen(false)
        setIsGenerationOpen(false)
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
            sources,
            setSources,
        },
        data: {
            races: infiniteData.data?.pages.flatMap((p) => p.items) || [],
            isLoading: infiniteData.isLoading,
            isFetching: infiniteData.isFetching,
            hasNextPage: !!infiniteData.hasNextPage,
            fetchNextPage: infiniteData.fetchNextPage,
            isFetchingNextPage: !!infiniteData.isFetchingNextPage,
            total: infiniteData.data?.pages[0]?.total || 0,
        },
        actions: {
            handleSearchChange,
            handleStatusChange,
            handleSourcesChange,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleGenerateAIClick,
            handleGenerationApplied,
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            isDeleteOpen,
            setIsDeleteOpen,
            isGenerationOpen,
            setIsGenerationOpen,
            selectedRace,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleGenerateAIClick,
            closeAll,
        },
    }
}
