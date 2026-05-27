"use client";

import * as React from 'react';
import { useQueryClient } from "@tanstack/react-query"
import { useInfiniteSpells } from '../api/spells-queries';
import { useSpellFilters } from './useSpellFilters';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import { useViewMode } from "@/core/hooks/useViewMode"
import { invalidateSearchCache } from "@/core/utils/search-engine"
import type { Spell } from "../types/spells.types"

/**
 * T044: Logic for the Spells page, including filters, modals, and responsive data fetching.
 */
export function useSpellsPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode, isDefault } = useViewMode()
    const queryClient = useQueryClient()

    // Filters logic from existing hook
    const { filters, search, setSearch, setStatus, setCircles, setSchools, setSaveAttributes, setDiceTypes, setSources, circleMode, setCircleMode, setPage } = useSpellFilters()

    /**
     * Data Fetching
     */

    const infiniteFilters = React.useMemo(() => {
        const { page: _page, ...rest } = filters
        void _page
        return rest
    }, [filters])

    const infiniteData = useInfiniteSpells(infiniteFilters)

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)
    const [isGenerationOpen, setIsGenerationOpen] = React.useState(false)
    const [selectedSpell, setSelectedSpell] = React.useState<Spell | null>(null)

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value)
    }

    const handleCircleChange = (circle: number | undefined, mode: "exact" | "upTo") => {
        setCircleMode(mode)
        if (circle === undefined) {
            setCircles([])
        } else if (mode === "exact") {
            setCircles([circle])
        } else {
            const circleRange = Array.from({ length: circle + 1 }, (_, i) => i)
            setCircles(circleRange)
        }
    }

    const handleCreateClick = () => {
        setSelectedSpell(null)
        setIsFormOpen(true)
    }

    const handleEditClick = (spell: Spell) => {
        setSelectedSpell(spell)
        setIsFormOpen(true)
    }

    const handleDeleteClick = (spell: Spell) => {
        setSelectedSpell(spell)
        setIsDeleteDialogOpen(true)
    }

    const handleGenerateAIClick = (spell: Spell) => {
        setSelectedSpell(spell)
        setIsGenerationOpen(true)
    }

    const handleGenerationApplied = () => {
        queryClient.invalidateQueries({ queryKey: ["spells"] })
        queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        invalidateSearchCache()
    }

    const handleFormSuccess = () => {
        setIsFormOpen(false)
        setSelectedSpell(null)
    }

    const handleDeleteSuccess = () => {
        setIsDeleteDialogOpen(false)
        setSelectedSpell(null)
    }

    const closeAll = () => {
        setIsFormOpen(false)
        setIsDeleteDialogOpen(false)
        setIsGenerationOpen(false)
        setSelectedSpell(null)
    }

    const hasActiveFilters =
        !!filters.search ||
        (filters.circles && filters.circles.length > 0) ||
        (filters.schools && filters.schools.length > 0) ||
        (filters.saveAttributes && filters.saveAttributes.length > 0) ||
        (filters.diceTypes && filters.diceTypes.length > 0) ||
        (filters.sources && filters.sources.length > 0) ||
        (filters.status && filters.status !== "all")

    return {
        isMobile,
        viewMode,
        setViewMode,
        isDefault,
        filters: {
            ...filters,
            search,
            circleMode,
        },
        pagination: {
            page: filters.page,
            setPage,
            total: infiniteData.data?.pages[0]?.total || 0,
            limit: filters.limit,
        },
        data: {
            paginated: {
                items: [],
                isLoading: infiniteData.isLoading,
                isFetching: infiniteData.isFetching,
            },
            infinite: {
                items: infiniteData.data?.pages.flatMap((page) => page.spells) || [],
                isLoading: infiniteData.isLoading,
                isFetchingNextPage: infiniteData.isFetchingNextPage,
                isFetching: infiniteData.isFetching,
                hasNextPage: !!infiniteData.hasNextPage,
                fetchNextPage: infiniteData.fetchNextPage,
                total: infiniteData.data?.pages[0]?.total || 0,
            },
        },
        actions: {
            handleSearchChange,
            handleStatusChange: setStatus,
            handleCircleChange,
            handleSchoolsChange: setSchools,
            handleAttributesChange: setSaveAttributes,
            handleDiceTypesChange: setDiceTypes,
            handleSourcesChange: setSources,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleGenerateAIClick,
            handleFormSuccess,
            handleDeleteSuccess,
            handleGenerationApplied,
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            isDeleteDialogOpen,
            setIsDeleteDialogOpen,
            isGenerationOpen,
            setIsGenerationOpen,
            selectedSpell,
            hasActiveFilters,
            closeAll,
        },
    }
}
