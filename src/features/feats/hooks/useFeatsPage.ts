"use client";

import * as React from 'react';
import { useFeats, useInfiniteFeats, featKeys } from './useFeats';
import { useFeatMutations } from './useFeatMutations';
import { useDebounce } from '@/core/hooks/useDebounce';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import { useViewMode } from "@/core/hooks/useViewMode"
import { toast } from "sonner"
import type { Feat, CreateFeatInput, UpdateFeatInput, FeatsFilters } from "../types/feats.types"

/**
 * T044: Logic for the Feats page, including filters, modals, and responsive data fetching.
 */
export function useFeatsPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode, isTable, isDefault } = useViewMode()

    // State
    const [page, setPage] = React.useState(1)
    const [search, setSearch] = React.useState("")
    const [status, setStatus] = React.useState<FeatsFilters["status"]>("all")
    const [level, setLevel] = React.useState<number | undefined>(undefined)
    const [levelMax, setLevelMax] = React.useState<number | undefined>(undefined)
    const [attributes, setAttributes] = React.useState<string[]>([])

    // Debounced search
    const debouncedSearch = useDebounce(search, 500)

    // Common filters object
    const filters = React.useMemo(
        () => ({
            search: debouncedSearch,
            status,
            level,
            levelMax,
            attributes,
            limit: 10,
        }),
        [debouncedSearch, status, level, levelMax, attributes],
    )

    /**
     * Data Fetching
     * Uses regular query for table view and infinite query for list/grid view.
     */

    const paginatedData = useFeats(
        {
            ...filters,
            page,
        },
        { enabled: isTable },
    )

    const infiniteData = useInfiniteFeats(filters, { enabled: !isTable })

    // Mutations
    const { createFeat, updateFeat, deleteFeat } = useFeatMutations()

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedFeat, setSelectedFeat] = React.useState<Feat | null>(null)

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value)
        setPage(1)
    }

    const handleStatusChange = (value: FeatsFilters["status"]) => {
        setStatus(value)
        setPage(1)
    }

    const handleLevelChange = (value: number | undefined, mode: "exact" | "upto") => {
        if (value === undefined) {
            setLevel(undefined)
            setLevelMax(undefined)
        } else if (mode === "exact") {
            setLevel(value)
            setLevelMax(undefined)
        } else {
            setLevelMax(value)
            setLevel(undefined)
        }
        setPage(1)
    }

    const handleAttributesChange = (val: string[]) => {
        setAttributes(val)
        setPage(1)
    }

    const handleCreateClick = () => {
        setSelectedFeat(null)
        setIsFormOpen(true)
    }

    const handleEditClick = (feat: Feat) => {
        setSelectedFeat(feat)
        setIsFormOpen(true)
    }

    const handleDeleteClick = (feat: Feat) => {
        setSelectedFeat(feat)
        setIsDeleteOpen(true)
    }

    const handleFormSubmit = async (formData: CreateFeatInput | UpdateFeatInput) => {
        try {
            if (selectedFeat) {
                await updateFeat.mutateAsync({
                    id: selectedFeat._id,
                    data: formData as UpdateFeatInput,
                })
                toast.success("Talento atualizado com sucesso!")
            } else {
                await createFeat.mutateAsync(formData as CreateFeatInput)
                toast.success("Talento criado com sucesso!")
            }
            setIsFormOpen(false)
            setSelectedFeat(null)
        } catch (error: any) {
            toast.error(error.message || "Erro ao salvar talento")
        }
    }

    const handleDeleteConfirm = async () => {
        if (selectedFeat) {
            try {
                await deleteFeat.mutateAsync(selectedFeat._id)
                setIsDeleteOpen(false)
                setSelectedFeat(null)
                toast.success("Talento deletado com sucesso!")
            } catch (error: any) {
                toast.error(error.message || "Erro ao deletar talento")
            }
        }
    }

    return {
        isMobile,
        viewMode,
        setViewMode,
        isDefault,
        filters: {
            search,
            status,
            level,
            levelMax,
            attributes,
        },
        pagination: {
            page,
            setPage,
            total: paginatedData.data?.total || 0,
            limit: 10,
        },
        data: {
            paginated: {
                items: paginatedData.data?.items || [],
                isLoading: paginatedData.isLoading,
                isFetching: paginatedData.isFetching,
            },
            infinite: {
                items: infiniteData.data?.pages.flatMap((page) => page.items) || [],
                isLoading: infiniteData.isLoading,
                isFetchingNextPage: infiniteData.isFetchingNextPage,
                isFetching: infiniteData.isFetching,
                hasNextPage: !!infiniteData.hasNextPage,
                fetchNextPage: infiniteData.fetchNextPage,
            },
        },
        actions: {
            handleSearchChange,
            handleStatusChange,
            handleLevelChange,
            handleAttributesChange,
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
            selectedFeat,
            isSaving: createFeat.isPending || updateFeat.isPending,
            isDeleting: deleteFeat.isPending,
        },
    }
}
