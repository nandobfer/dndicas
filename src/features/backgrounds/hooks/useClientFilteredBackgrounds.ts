/**
 * @fileoverview Hook to apply client-side filtering to backgrounds fetched from the infinite query.
 * Handles attributes (AND logic), skills (OR logic), and feats (OR logic).
 * Also automatically fetches next pages if the filtered result is empty.
 */

"use client";

import * as React from "react"
import type { Background } from "../types/backgrounds.types"

interface ClientFilters {
    suggestedAttributes?: string[]
    skillProficiencies?: string[]
    featIds?: string[]
}

export function applyClientFilters(
    items: Background[],
    filters: ClientFilters
): Background[] {
    const { suggestedAttributes = [], skillProficiencies = [], featIds = [] } = filters
    let result = items

    // Attributes filter: MUST have ALL selected attributes (AND logic)
    if (suggestedAttributes.length > 0) {
        result = result.filter((bg) =>
            suggestedAttributes.every((a) => bg.suggestedAttributes?.includes(a as any)),
        )
    }

    // Skills filter: MUST have ANY of the selected skills (OR logic)
    if (skillProficiencies.length > 0) {
        result = result.filter((bg) =>
            bg.skillProficiencies?.some((s) => skillProficiencies.includes(s)),
        )
    }

    // Feats filter: MUST have ANY of the selected feats (OR logic)
    if (featIds.length > 0) {
        result = result.filter((bg) => {
            if (!bg.featId) return false
            // API might return featId as { id, label } object or as a plain string
            const resolvedId = typeof bg.featId === "object"
                ? (bg.featId as unknown as { id: string }).id
                : bg.featId
            return featIds.includes(resolvedId)
        })
    }

    return result
}

interface UseClientFilteredBackgroundsProps {
    infiniteData: {
        pages?: Array<{ items: Background[] }>
    }
    filters: ClientFilters
    hasNextPage?: boolean
    isLoading?: boolean
    isFetchingNextPage?: boolean
    fetchNextPage: () => void
}

export function useClientFilteredBackgrounds({
    infiniteData,
    filters,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
}: UseClientFilteredBackgroundsProps) {
    const allItems = React.useMemo(
        () => infiniteData.pages?.flatMap((p) => p.items) || [],
        [infiniteData.pages],
    )

    const filteredItems = React.useMemo(
        () => applyClientFilters(allItems, filters),
        [allItems, filters],
    )

    const hasClientFilters = 
        (filters.suggestedAttributes?.length || 0) > 0 || 
        (filters.skillProficiencies?.length || 0) > 0 || 
        (filters.featIds?.length || 0) > 0

    // Automatic fetching logic: if filters result in an empty list but there are more items to fetch from server
    React.useEffect(() => {
        if (
            hasClientFilters &&
            filteredItems.length === 0 &&
            allItems.length > 0 &&
            hasNextPage &&
            !isLoading &&
            !isFetchingNextPage
        ) {
            fetchNextPage()
        }
    }, [
        allItems.length,
        fetchNextPage,
        filteredItems.length,
        hasClientFilters,
        hasNextPage,
        isFetchingNextPage,
        isLoading
    ])

    return {
        filteredItems,
        allItems,
        hasClientFilters,
    }
}
