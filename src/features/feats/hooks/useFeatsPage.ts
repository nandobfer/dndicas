"use client";

import * as React from 'react';
import { useInfiniteFeats } from './useFeats';
import { useFeatMutations } from './useFeatMutations';
import { useDebounce } from '@/core/hooks/useDebounce';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import { useViewMode } from "@/core/hooks/useViewMode"
import { toast } from "sonner"
import type { Feat, CreateFeatInput, UpdateFeatInput, FeatsFilters, FeatCategory } from "../types/feats.types"

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

/**
 * T044: Logic for the Feats page, including filters, modals, and responsive data fetching.
 */
export function useFeatsPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode, isDefault } = useViewMode()

    // State
    const [search, setSearch] = React.useState("")
    const [status, setStatus] = React.useState<FeatsFilters["status"]>("all")
    const [level, setLevel] = React.useState<number | undefined>(undefined)
    const [levelMax, setLevelMax] = React.useState<number | undefined>(undefined)
    const [attributes, setAttributes] = React.useState<string[]>([])
    const [categories, setCategories] = React.useState<FeatCategory[]>([])
    const [sources, setSources] = React.useState<string[]>([])

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
            categories,
            sources: sources.length > 0 ? sources : undefined,
            limit: 10,
        }),
        [debouncedSearch, status, level, levelMax, attributes, categories, sources],
    )

    /**
     * Data Fetching
     * Uses infinite query for both table and list/grid view.
     */

    const infiniteData = useInfiniteFeats(filters)

    // Mutations
    const { createFeat, updateFeat, deleteFeat } = useFeatMutations()

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedFeat, setSelectedFeat] = React.useState<Feat | null>(null)

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value)
    }

    const handleStatusChange = (value: FeatsFilters["status"]) => {
        setStatus(value)
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
    }

    const handleAttributesChange = (val: string[]) => {
        setAttributes(val)
    }

    const handleCategoriesChange = (val: FeatCategory[]) => {
        setCategories(val)
    }

    const handleSourcesChange = (val: string[]) => {
        setSources(val)
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
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Erro ao salvar talento"))
        }
    }

    const handleDeleteConfirm = async () => {
        if (selectedFeat) {
            try {
                await deleteFeat.mutateAsync(selectedFeat._id)
                setIsDeleteOpen(false)
                setSelectedFeat(null)
                toast.success("Talento deletado com sucesso!")
            } catch (error: unknown) {
                toast.error(getErrorMessage(error, "Erro ao deletar talento"))
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
            categories,
            sources,
        },
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
                isFetchingNextPage: infiniteData.isFetchingNextPage,
                isFetching: infiniteData.isFetching,
                hasNextPage: !!infiniteData.hasNextPage,
                fetchNextPage: infiniteData.fetchNextPage,
                total: infiniteData.data?.pages[0]?.total || 0,
            },
        },
        actions: {
            handleSearchChange,
            handleStatusChange,
            handleLevelChange,
            handleAttributesChange,
            handleCategoriesChange,
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
            selectedFeat,
            isSaving: createFeat.isPending || updateFeat.isPending,
            isDeleting: deleteFeat.isPending,
        },
    }
}
