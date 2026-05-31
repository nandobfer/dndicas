/**
 * @fileoverview Hook for managing backgrounds list state.
 * Centralizes filter management, pagination, and modal control.
 */

"use client";

import * as React from "react"
import { useInfiniteBackgrounds } from "../api/backgrounds-queries"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { useViewMode } from "@/core/hooks/useViewMode"
import type { Background } from "../types/backgrounds.types"
import { useClientFilteredBackgrounds } from "./useClientFilteredBackgrounds"

export function useBackgroundsPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode } = useViewMode()

    const [search, setSearch] = React.useState("")
    const [status, setStatus] = React.useState<"active" | "inactive" | "all">("all")
    const [suggestedAttributes, setSuggestedAttributes] = React.useState<string[]>([])
    const [skillProficiencies, setSkillProficiencies] = React.useState<string[]>([])
    const [featIds, setFeatIds] = React.useState<string[]>([])
    const [sources, setSources] = React.useState<string[]>([])

    // Only server-filterable fields go to the API
    const serverFilters = { search, status, sources: sources.length > 0 ? sources : undefined }

    const infiniteData = useInfiniteBackgrounds(serverFilters)

    const { filteredItems: filteredInfiniteItems, hasClientFilters } = useClientFilteredBackgrounds({
        infiniteData: { pages: infiniteData.data?.pages },
        filters: { suggestedAttributes, skillProficiencies, featIds },
        hasNextPage: !!infiniteData.hasNextPage,
        isLoading: infiniteData.isLoading,
        isFetchingNextPage: infiniteData.isFetchingNextPage,
        fetchNextPage: infiniteData.fetchNextPage,
    })

    // Modal states
    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedBackground, setSelectedBackground] = React.useState<Background | null>(null)

    const handleSearchChange = (value: string) => setSearch(value)
    const handleStatusChange = (value: "active" | "inactive" | "all") => setStatus(value)
    const handleAttributesChange = (attrs: string[]) => setSuggestedAttributes(attrs)
    const handleSkillsChange = (skills: string[]) => setSkillProficiencies(skills)
    const handleFeatsChange = (ids: string[]) => setFeatIds(ids)
    const handleSourcesChange = (value: string[]) => setSources(value)

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
            suggestedAttributes,
            skillProficiencies,
            featIds,
            sources,
        },
        data: {
            backgrounds: filteredInfiniteItems,
            isLoading: infiniteData.isLoading,
            isFetching: infiniteData.isFetching,
            hasNextPage: !!infiniteData.hasNextPage,
            fetchNextPage: infiniteData.fetchNextPage,
            isFetchingNextPage: !!infiniteData.isFetchingNextPage,
            total: hasClientFilters ? filteredInfiniteItems.length : infiniteData.data?.pages[0]?.total || 0,
        },
        actions: {
            handleSearchChange,
            handleStatusChange,
            handleAttributesChange,
            handleSkillsChange,
            handleFeatsChange,
            handleSourcesChange,
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
