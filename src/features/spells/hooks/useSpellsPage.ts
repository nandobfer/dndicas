"use client";

import * as React from 'react';
import { useSpells, useInfiniteSpells, useCreateSpell, useUpdateSpell, useDeleteSpell } from '../api/spells-queries';
import { useSpellFilters } from './useSpellFilters';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import { toast } from 'sonner';
import type { Spell, CreateSpellInput, UpdateSpellInput } from '../types/spells.types';

/**
 * T044: Logic for the Spells page, including filters, modals, and responsive data fetching.
 */
export function useSpellsPage() {
    const isMobile = useIsMobile();
    
    // Filters logic from existing hook
    const {
        filters,
        search,
        setSearch,
        setStatus,
        setCircles,
        setSchools,
        setSaveAttributes,
        setDiceTypes,
        circleMode,
        setCircleMode,
        setPage,
    } = useSpellFilters();

    /**
     * Data Fetching
     */
    
    // Desktop View Data
    const desktopData = useSpells(filters, filters.page, filters.limit, { enabled: !isMobile });

    // Mobile View Data
    const mobileData = useInfiniteSpells(filters, { enabled: isMobile });

    // Mutations
    const createMutation = useCreateSpell();
    const updateMutation = useUpdateSpell();
    const deleteMutation = useDeleteSpell();

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [selectedSpell, setSelectedSpell] = React.useState<Spell | null>(null);

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value);
    };

    const handleCircleChange = (circle: number | undefined, mode: "exact" | "upTo") => {
        setCircleMode(mode);
        if (circle === undefined) {
          setCircles([]);
        } else if (mode === "exact") {
          setCircles([circle]);
        } else {
          const circleRange = Array.from({ length: circle + 1 }, (_, i) => i);
          setCircles(circleRange);
        }
    };

    const handleCreateClick = () => {
        setSelectedSpell(null);
        setIsFormOpen(true);
    };

    const handleEditClick = (spell: Spell) => {
        setSelectedSpell(spell);
        setIsFormOpen(true);
    };

    const handleDeleteClick = async (spell: Spell) => {
        if (!confirm(`Deseja realmente excluir a magia "${spell.name}"?`)) return;

        try {
            await deleteMutation.mutateAsync(spell._id);
            toast.success("Magia excluída com sucesso!");
        } catch (error) {
            toast.error("Erro ao excluir magia");
        }
    };

    const handleFormSuccess = () => {
        setIsFormOpen(false);
        setSelectedSpell(null);
    };

    const hasActiveFilters =
        !!filters.search ||
        (filters.circles && filters.circles.length > 0) ||
        (filters.schools && filters.schools.length > 0) ||
        (filters.saveAttributes && filters.saveAttributes.length > 0) ||
        (filters.diceTypes && filters.diceTypes.length > 0) ||
        (filters.status && filters.status !== 'all');

    return {
        isMobile,
        filters: {
            ...filters,
            search,
            circleMode
        },
        pagination: {
            page: filters.page,
            setPage,
            total: desktopData.data?.total || 0,
            limit: filters.limit
        },
        data: {
            desktop: {
                items: desktopData.data?.spells || [],
                isLoading: desktopData.isLoading,
                isFetching: desktopData.isFetching
            },
            mobile: {
                items: mobileData.data?.pages.flatMap(page => page.spells) || [],
                isLoading: mobileData.isLoading,
                isFetchingNextPage: mobileData.isFetchingNextPage,
                isFetching: mobileData.isFetching,
                hasNextPage: !!mobileData.hasNextPage,
                fetchNextPage: mobileData.fetchNextPage
            }
        },
        actions: {
            handleSearchChange,
            handleStatusChange: setStatus,
            handleCircleChange,
            handleSchoolsChange: setSchools,
            handleAttributesChange: setSaveAttributes,
            handleDiceTypesChange: setDiceTypes,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleFormSuccess
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            selectedSpell,
            hasActiveFilters
        }
    };
}
