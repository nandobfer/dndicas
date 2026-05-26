"use client";

import * as React from "react"
import { useInfiniteClasses, useDeleteClass } from "../api/classes-queries"
import { useClassFilters } from "./useClassFilters"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { useViewMode } from "@/core/hooks/useViewMode"
import { toast } from "sonner"
import type { CharacterClass } from "../types/classes.types"

export function useClassesPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode, isDefault } = useViewMode()

    const { filters, search, setSearch, setStatus, setSources, setPage } = useClassFilters()

    const infiniteFilters = React.useMemo(() => {
        const { page: _page, ...rest } = filters
        void _page
        return rest
    }, [filters])

    const infiniteData = useInfiniteClasses(infiniteFilters)
    const deleteMutation = useDeleteClass()

    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedClass, setSelectedClass] = React.useState<CharacterClass | null>(null)

    const handleSearchChange = (value: string) => setSearch(value)
    const handleStatusChange = (value: "all" | "active" | "inactive") => setStatus(value)

    const handleCreateClick = () => {
        setSelectedClass(null)
        setIsFormOpen(true)
    }

    const handleEditClick = (characterClass: CharacterClass) => {
        setSelectedClass(characterClass)
        setIsFormOpen(true)
    }

    const handleDeleteClick = (characterClass: CharacterClass) => {
        setSelectedClass(characterClass)
        setIsDeleteOpen(true)
    }

    const handleDeleteConfirm = async () => {
        if (!selectedClass) return

        try {
            await deleteMutation.mutateAsync(selectedClass._id)
            toast.success("Classe excluída com sucesso!")
            setIsDeleteOpen(false)
            setSelectedClass(null)
        } catch {
            toast.error("Erro ao excluir classe")
        }
    }

    const handleFormSuccess = () => {
        setIsFormOpen(false)
        setSelectedClass(null)
    }

    const hasActiveFilters =
        !!filters.search || (filters.hitDice && filters.hitDice.length > 0) || (filters.spellcasting && filters.spellcasting.length > 0) || (filters.sources && filters.sources.length > 0) || (filters.status && filters.status !== "all")

    return {
        isMobile,
        viewMode,
        setViewMode,
        isDefault,
        filters: { ...filters, search },
        pagination: {
            page: filters.page,
            setPage,
            total: infiniteData.data?.pages[0]?.total || 0,
            limit: filters.limit
        },
        data: {
            paginated: {
                items: [],
                isLoading: infiniteData.isLoading,
                isFetching: infiniteData.isFetching
            },
            infinite: {
                items: infiniteData.data?.pages.flatMap((page) => page.classes) || [],
                isLoading: infiniteData.isLoading,
                isFetchingNextPage: infiniteData.isFetchingNextPage,
                isFetching: infiniteData.isFetching,
                hasNextPage: !!infiniteData.hasNextPage,
                fetchNextPage: infiniteData.fetchNextPage,
                total: infiniteData.data?.pages[0]?.total || 0
            }
        },
        actions: {
            handleSearchChange,
            handleStatusChange,
            handleSourcesChange: setSources,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleDeleteConfirm,
            handleFormSuccess
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            isDeleteOpen,
            setIsDeleteOpen,
            selectedClass,
            hasActiveFilters,
            isSaving: deleteMutation.isPending
        }
    }
}
