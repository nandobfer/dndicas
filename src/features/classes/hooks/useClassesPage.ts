"use client";

import * as React from "react"
import { useClasses, useInfiniteClasses, useDeleteClass } from "../api/classes-queries"
import { useClassFilters } from "./useClassFilters"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { useViewMode } from "@/core/hooks/useViewMode"
import { toast } from "sonner"
import type { CharacterClass } from "../types/classes.types"

export function useClassesPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode, isTable, isDefault } = useViewMode()

    const { filters, search, setSearch, setStatus, setHitDice, setSpellcasting, setPage } = useClassFilters()

    const paginatedData = useClasses(filters, filters.page, filters.limit, { enabled: isTable })
    const infiniteData = useInfiniteClasses(filters, { enabled: !isTable })
    const deleteMutation = useDeleteClass()

    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [selectedClass, setSelectedClass] = React.useState<CharacterClass | null>(null)

    const handleSearchChange = (value: string) => setSearch(value)
    const handleStatusChange = (value: "all" | "active" | "inactive") => setStatus(value)
    const handleHitDiceChange = (value: string[]) => setHitDice(value as any)
    const handleSpellcastingChange = (value: string[]) => setSpellcasting(value as any)

    const handleCreateClick = () => {
        setSelectedClass(null)
        setIsFormOpen(true)
    }

    const handleEditClick = (characterClass: CharacterClass) => {
        setSelectedClass(characterClass)
        setIsFormOpen(true)
    }

    const handleDeleteClick = async (characterClass: CharacterClass) => {
        if (!confirm(`Deseja realmente excluir a classe "${characterClass.name}"?`)) return

        try {
            await deleteMutation.mutateAsync(characterClass._id)
            toast.success("Classe excluída com sucesso!")
        } catch {
            toast.error("Erro ao excluir classe")
        }
    }

    const handleFormSuccess = () => {
        setIsFormOpen(false)
        setSelectedClass(null)
    }

    const hasActiveFilters =
        !!filters.search ||
        (filters.hitDice && filters.hitDice.length > 0) ||
        (filters.spellcasting && filters.spellcasting.length > 0) ||
        (filters.status && filters.status !== "all")

    return {
        isMobile,
        viewMode,
        setViewMode,
        isDefault,
        filters: { ...filters, search },
        pagination: {
            page: filters.page,
            setPage,
            total: paginatedData.data?.total || 0,
            limit: filters.limit,
        },
        data: {
            paginated: {
                items: paginatedData.data?.classes || [],
                isLoading: paginatedData.isLoading,
                isFetching: paginatedData.isFetching,
            },
            infinite: {
                items: infiniteData.data?.pages.flatMap((page) => page.classes) || [],
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
            handleHitDiceChange,
            handleSpellcastingChange,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleFormSuccess,
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            selectedClass,
            hasActiveFilters,
        },
    }
}
