"use client";

import * as React from 'react';
import { useInfiniteTraits } from './useTraits';
import { useTraitMutations } from './useTraitMutations';
import { useDebounce } from '@/core/hooks/useDebounce';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import { useViewMode } from "@/core/hooks/useViewMode"
import type { Trait, CreateTraitInput, UpdateTraitInput, TraitFilterParams } from "../types/traits.types"

/**
 * T044: Logic for the Traits page, including filters, modals, and responsive data fetching.
 */
export function useTraitsPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode, isDefault } = useViewMode()

    // State
    const [search, setSearch] = React.useState("")
    const [status, setStatus] = React.useState<TraitFilterParams["status"]>("all")
    const [sources, setSources] = React.useState<string[]>([])

    // Debounced search
    const debouncedSearch = useDebounce(search, 500)

    // Common filters object
    const filters = React.useMemo(
        () => ({
            search: debouncedSearch,
            status,
            sources: sources.length > 0 ? sources : undefined,
            limit: 10,
        }),
        [debouncedSearch, status, sources],
    )

    /**
     * Data Fetching
     * Uses infinite query for both table and list/grid views.
     */

    const infiniteData = useInfiniteTraits(filters)

    // Mutations
    const { create, update, remove } = useTraitMutations()

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedTrait, setSelectedTrait] = React.useState<Trait | null>(null)

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value)
    }

    const handleStatusChange = (value: TraitFilterParams["status"]) => {
        setStatus(value)
    }

    const handleSourcesChange = (value: string[]) => {
        setSources(value)
    }

    const handleCreateClick = () => {
        setSelectedTrait(null)
        setIsFormOpen(true)
    }

    const handleEditClick = (trait: Trait) => {
        setSelectedTrait(trait)
        setIsFormOpen(true)
    }

    const handleDeleteClick = (trait: Trait) => {
        setSelectedTrait(trait)
        setIsDeleteOpen(true)
    }

    const handleFormSubmit = async (formData: CreateTraitInput | UpdateTraitInput) => {
        if (selectedTrait) {
            await update.mutateAsync({
                id: selectedTrait._id,
                data: formData as UpdateTraitInput,
            })
        } else {
            await create.mutateAsync(formData as CreateTraitInput)
        }
        setIsFormOpen(false)
        setSelectedTrait(null)
    }

    const handleDeleteConfirm = async () => {
        if (selectedTrait) {
            await remove.mutateAsync(selectedTrait._id)
            setIsDeleteOpen(false)
            setSelectedTrait(null)
        }
    }

    return {
        isMobile,
        viewMode,
        setViewMode,
        isDefault,
        filters: { search, status, sources },
        pagination: {
            page: 1,
            setPage: () => {},
            total: infiniteData.data?.pages[0]?.total || 0,
            limit: 10,
        },
        data: {
            paginated: {
                items: [],
                isLoading: infiniteData.isLoading,
                isFetching: infiniteData.isFetching,
            },
            infinite: {
                items: infiniteData.data?.pages.flatMap((page) => page.items) || [],
                isLoading: infiniteData.isLoading,
                isFetching: infiniteData.isFetching,
                isFetchingNextPage: infiniteData.isFetchingNextPage,
                hasNextPage: !!infiniteData.hasNextPage,
                fetchNextPage: infiniteData.fetchNextPage,
                total: infiniteData.data?.pages[0]?.total || 0,
            },
        },
        actions: {
            handleSearchChange,
            handleStatusChange,
            handleSourcesChange,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleFormSubmit,
            handleDeleteConfirm,
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            isDeleteOpen,
            setIsDeleteOpen,
            selectedTrait,
            isSaving: create.isPending || update.isPending,
            isDeleting: remove.isPending,
        },
    }
}
