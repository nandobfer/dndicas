"use client";

import * as React from 'react';
import { useRules, useInfiniteRules } from './useRules';
import { useRuleMutations } from './useRuleMutations';
import { useDebounce } from '@/core/hooks/useDebounce';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import type { Reference, CreateReferenceInput, UpdateReferenceInput, RulesFilters } from '../types/rules.types';

/**
 * T044: Logic for the Rules page, including filters, modals, and responsive data fetching.
 */
export function useRulesPage() {
    const isMobile = useIsMobile();
    
    // State
    const [page, setPage] = React.useState(1);
    const [search, setSearch] = React.useState("");
    const [status, setStatus] = React.useState<RulesFilters['status']>('all');
    
    // Debounced search
    const debouncedSearch = useDebounce(search, 500);

    // Common filters object
    const filters = React.useMemo(() => ({
        search: debouncedSearch,
        status,
        limit: 10,
    }), [debouncedSearch, status]);

    /**
     * Data Fetching
     * Uses regular query for desktop table and infinite query for mobile list.
     */
    
    // Desktop View Data
    const decktopData = useRules({
        ...filters,
        page,
    }, { enabled: !isMobile });

    // Mobile View Data
    const mobileData = useInfiniteRules(filters, { enabled: isMobile });

    // Mutations
    const { createRule, updateRule, deleteRule } = useRuleMutations();

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
    const [selectedRule, setSelectedRule] = React.useState<Reference | null>(null);

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const handleStatusChange = (value: RulesFilters['status']) => {
        setStatus(value);
        setPage(1);
    };

    const handleCreateClick = () => {
        setSelectedRule(null);
        setIsFormOpen(true);
    };

    const handleEditClick = (rule: Reference) => {
        setSelectedRule(rule);
        setIsFormOpen(true);
    };

    const handleDeleteClick = (rule: Reference) => {
        setSelectedRule(rule);
        setIsDeleteOpen(true);
    };

    const handleFormSubmit = async (formData: CreateReferenceInput | UpdateReferenceInput) => {
        if (selectedRule) {
            await updateRule.mutateAsync({
                id: selectedRule._id,
                data: formData as UpdateReferenceInput
            });
        } else {
            await createRule.mutateAsync(formData as CreateReferenceInput);
        }
        setIsFormOpen(false);
        setSelectedRule(null);
    };

    const handleDeleteConfirm = async () => {
        if (selectedRule) {
            await deleteRule.mutateAsync(selectedRule._id);
            setIsDeleteOpen(false);
            setSelectedRule(null);
        }
    };

    return {
        isMobile,
        filters: { search, status },
        pagination: { 
            page, 
            setPage, 
            total: decktopData.data?.total || 0,
            limit: 10 
        },
        data: {
            desktop: {
                items: decktopData.data?.items || [],
                isLoading: decktopData.isLoading,
                isFetching: decktopData.isFetching
            },
            mobile: {
                items: mobileData.data?.pages.flatMap(page => page.items) || [],
                isLoading: mobileData.isLoading,
                isFetching: mobileData.isFetching,
                isFetchingNextPage: mobileData.isFetchingNextPage,
                hasNextPage: !!mobileData.hasNextPage,
                fetchNextPage: mobileData.fetchNextPage
            }
        },
        actions: {
            handleSearchChange,
            handleStatusChange,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleFormSubmit,
            handleDeleteConfirm
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            isDeleteOpen,
            setIsDeleteOpen,
            selectedRule,
            isSaving: createRule.isPending || updateRule.isPending,
            isDeleting: deleteRule.isPending
        }
    };
}
