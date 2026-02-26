"use client";

import * as React from 'react';
import { useTraits, useInfiniteTraits, traitKeys } from './useTraits';
import { useTraitMutations } from './useTraitMutations';
import { useDebounce } from '@/core/hooks/useDebounce';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import type { Trait, CreateTraitInput, UpdateTraitInput, TraitFilterParams } from '../types/traits.types';

/**
 * T044: Logic for the Traits page, including filters, modals, and responsive data fetching.
 */
export function useTraitsPage() {
    const isMobile = useIsMobile();
    
    // State
    const [page, setPage] = React.useState(1);
    const [search, setSearch] = React.useState("");
    const [status, setStatus] = React.useState<TraitFilterParams['status']>('all');
    
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
    const desktopData = useTraits({
        ...filters,
        page,
    }, { enabled: !isMobile });

    // Mobile View Data
    const mobileData = useInfiniteTraits(filters, { enabled: isMobile });

    // Mutations
    const { create, update, remove } = useTraitMutations();

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
    const [selectedTrait, setSelectedTrait] = React.useState<Trait | null>(null);

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const handleStatusChange = (value: TraitFilterParams['status']) => {
        setStatus(value);
        setPage(1);
    };

    const handleCreateClick = () => {
        setSelectedTrait(null);
        setIsFormOpen(true);
    };

    const handleEditClick = (trait: Trait) => {
        setSelectedTrait(trait);
        setIsFormOpen(true);
    };

    const handleDeleteClick = (trait: Trait) => {
        setSelectedTrait(trait);
        setIsDeleteOpen(true);
    };

    const handleFormSubmit = async (formData: CreateTraitInput | UpdateTraitInput) => {
        if (selectedTrait) {
            await update.mutateAsync({
                id: selectedTrait._id,
                data: formData as UpdateTraitInput
            });
        } else {
            await create.mutateAsync(formData as CreateTraitInput);
        }
        setIsFormOpen(false);
        setSelectedTrait(null);
    };

    const handleDeleteConfirm = async () => {
        if (selectedTrait) {
            await remove.mutateAsync(selectedTrait._id);
            setIsDeleteOpen(false);
            setSelectedTrait(null);
        }
    };

    return {
        isMobile,
        filters: { search, status },
        pagination: { 
            page, 
            setPage, 
            total: desktopData.data?.total || 0,
            limit: 10 
        },
        data: {
            desktop: {
                items: desktopData.data?.items || [],
                isLoading: desktopData.isLoading,
                isFetching: desktopData.isFetching
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
            selectedTrait,
            isSaving: create.isPending || update.isPending,
            isDeleting: remove.isPending
        }
    };
}
