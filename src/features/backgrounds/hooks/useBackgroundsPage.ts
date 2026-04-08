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

function applyClientFilters(
    items: Background[],
    suggestedAttributes: string[],
    skillProficiencies: string[],
    featIds: string[],
): Background[] {
    let result = items

    if (suggestedAttributes.length > 0) {
        result = result.filter((bg) =>
            bg.suggestedAttributes?.some((a) => suggestedAttributes.includes(a)),
        )
    }

    if (skillProficiencies.length > 0) {
        result = result.filter((bg) =>
            bg.skillProficiencies?.some((s) => skillProficiencies.includes(s)),
        )
    }

    if (featIds.length > 0) {
        result = result.filter((bg) => {
            if (!bg.featId) return false
            // API returns featId as { id, label } object or as a plain string
            const resolvedId = typeof bg.featId === "object"
                ? (bg.featId as unknown as { id: string }).id
                : bg.featId
            return featIds.includes(resolvedId)
        })
    }

    return result
}

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

    const tableData = useBackgrounds(serverFilters, 1, 100)
    const infiniteData = useInfiniteBackgrounds(serverFilters)

    const allTableItems = tableData.data?.items || []
    const allInfiniteItems = infiniteData.data?.pages.flatMap((p) => p.items) || []

    const filteredTableItems = React.useMemo(
        () => applyClientFilters(allTableItems, suggestedAttributes, skillProficiencies, featIds),
        [allTableItems, suggestedAttributes, skillProficiencies, featIds],
    )

    const filteredInfiniteItems = React.useMemo(
        () => applyClientFilters(allInfiniteItems, suggestedAttributes, skillProficiencies, featIds),
        [allInfiniteItems, suggestedAttributes, skillProficiencies, featIds],
    )

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
            backgrounds:
                viewMode === "table" ? filteredTableItems : filteredInfiniteItems,
            isLoading: viewMode === "table" ? tableData.isLoading : infiniteData.isLoading || infiniteData.isFetching,
            hasNextPage: !!infiniteData.hasNextPage,
            fetchNextPage: infiniteData.fetchNextPage,
            isFetchingNextPage: !!infiniteData.isFetchingNextPage,
            total: filteredTableItems.length,
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
