"use client";

import * as React from 'react';
import { useRules, useInfiniteRules } from './useRules';
import { useRuleMutations } from './useRuleMutations';
import { useDebounce } from '@/core/hooks/useDebounce';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import { useViewMode } from "@/core/hooks/useViewMode"
import type { Reference, CreateReferenceInput, UpdateReferenceInput, RulesFilters } from "../types/rules.types"

/**
 * T044: Logic for the Rules page, including filters, modals, and responsive data fetching.
 */
export function useRulesPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode, isTable, isDefault } = useViewMode()

    // State
    const [page, setPage] = React.useState(1)
    const [search, setSearch] = React.useState("")
    const [status, setStatus] = React.useState<RulesFilters["status"]>("all")

    // Debounced search
    const debouncedSearch = useDebounce(search, 500)

    // Common filters object
    const filters = React.useMemo(
        () => ({
            search: debouncedSearch,
            status,
            limit: 10,
        }),
        [debouncedSearch, status],
    )

    /**
     * Data Fetching
     * Uses regular query for table view and infinite query for list/grid view.
     */

    const paginatedData = useRules(
        {
            ...filters,
            page,
        },
        { enabled: isTable },
    )

    const infiniteData = useInfiniteRules(filters, { enabled: !isTable })

    // Mutations
    const { createRule, updateRule, deleteRule } = useRuleMutations()

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedRule, setSelectedRule] = React.useState<Reference | null>(null)

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value)
        setPage(1)
    }

    const handleStatusChange = (value: RulesFilters["status"]) => {
        setStatus(value)
        setPage(1)
    }

    const handleCreateClick = () => {
        setSelectedRule(null)
        setIsFormOpen(true)
    }

    const handleEditClick = (rule: Reference) => {
        setSelectedRule(rule)
        setIsFormOpen(true)
    }

    const handleDeleteClick = (rule: Reference) => {
        setSelectedRule(rule)
        setIsDeleteOpen(true)
    }

    const handleFormSubmit = async (formData: CreateReferenceInput | UpdateReferenceInput) => {
        if (selectedRule) {
            await updateRule.mutateAsync({
                id: selectedRule._id,
                data: formData as UpdateReferenceInput,
            })
        } else {
            await createRule.mutateAsync(formData as CreateReferenceInput)
        }
        setIsFormOpen(false)
        setSelectedRule(null)
    }

    const handleDeleteConfirm = async () => {
        if (selectedRule) {
            await deleteRule.mutateAsync(selectedRule._id)
            setIsDeleteOpen(false)
            setSelectedRule(null)
        }
    }

    return {
        isMobile,
        viewMode,
        setViewMode,
        isDefault,
        filters: { search, status },
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
                isFetching: infiniteData.isFetching,
                isFetchingNextPage: infiniteData.isFetchingNextPage,
                hasNextPage: !!infiniteData.hasNextPage,
                fetchNextPage: infiniteData.fetchNextPage,
            },
        },
        actions: {
            handleSearchChange,
            handleStatusChange,
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
            selectedRule,
            isSaving: createRule.isPending || updateRule.isPending,
            isDeleting: deleteRule.isPending,
        },
    }
}
