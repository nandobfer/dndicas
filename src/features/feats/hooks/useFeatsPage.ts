"use client";

import * as React from 'react';
import { useFeats, useInfiniteFeats, featKeys } from './useFeats';
import { useFeatMutations } from './useFeatMutations';
import { useDebounce } from '@/core/hooks/useDebounce';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import { toast } from 'sonner';
import type { Feat, CreateFeatInput, UpdateFeatInput, FeatsFilters } from '../types/feats.types';

/**
 * T044: Logic for the Feats page, including filters, modals, and responsive data fetching.
 */
export function useFeatsPage() {
    const isMobile = useIsMobile();
    
    // State
    const [page, setPage] = React.useState(1);
    const [search, setSearch] = React.useState("");
    const [status, setStatus] = React.useState<FeatsFilters['status']>('all');
    const [level, setLevel] = React.useState<number | undefined>(undefined);
    const [levelMax, setLevelMax] = React.useState<number | undefined>(undefined);
    const [attributes, setAttributes] = React.useState<string[]>([]);
    
    // Debounced search
    const debouncedSearch = useDebounce(search, 500);

    // Common filters object
    const filters = React.useMemo(() => ({
        search: debouncedSearch,
        status,
        level,
        levelMax,
        attributes,
        limit: 10,
    }), [debouncedSearch, status, level, levelMax, attributes]);

    /**
     * Data Fetching
     * Uses regular query for desktop table and infinite query for mobile list.
     */
    
    // Desktop View Data
    const desktopData = useFeats({
        ...filters,
        page,
    }, { enabled: !isMobile });

    // Mobile View Data
    const mobileData = useInfiniteFeats(filters, { enabled: isMobile });

    // Mutations
    const { createFeat, updateFeat, deleteFeat } = useFeatMutations();

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
    const [selectedFeat, setSelectedFeat] = React.useState<Feat | null>(null);

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const handleStatusChange = (value: FeatsFilters['status']) => {
        setStatus(value);
        setPage(1);
    };

    const handleLevelChange = (value: number | undefined, mode: "exact" | "upto") => {
        if (value === undefined) {
            setLevel(undefined);
            setLevelMax(undefined);
        } else if (mode === "exact") {
            setLevel(value);
            setLevelMax(undefined);
        } else {
            setLevelMax(value);
            setLevel(undefined);
        }
        setPage(1);
    };

    const handleAttributesChange = (val: string[]) => {
        setAttributes(val);
        setPage(1);
    };

    const handleCreateClick = () => {
        setSelectedFeat(null);
        setIsFormOpen(true);
    };

    const handleEditClick = (feat: Feat) => {
        setSelectedFeat(feat);
        setIsFormOpen(true);
    };

    const handleDeleteClick = (feat: Feat) => {
        setSelectedFeat(feat);
        setIsDeleteOpen(true);
    };

    const handleFormSubmit = async (formData: CreateFeatInput | UpdateFeatInput) => {
        try {
            if (selectedFeat) {
                await updateFeat.mutateAsync({
                    id: selectedFeat._id,
                    data: formData as UpdateFeatInput
                });
                toast.success("Talento atualizado com sucesso!");
            } else {
                await createFeat.mutateAsync(formData as CreateFeatInput);
                toast.success("Talento criado com sucesso!");
            }
            setIsFormOpen(false);
            setSelectedFeat(null);
        } catch (error: any) {
            toast.error(error.message || "Erro ao salvar talento");
        }
    };

    const handleDeleteConfirm = async () => {
        if (selectedFeat) {
            try {
                await deleteFeat.mutateAsync(selectedFeat._id);
                setIsDeleteOpen(false);
                setSelectedFeat(null);
                toast.success("Talento deletado com sucesso!");
            } catch (error: any) {
                toast.error(error.message || "Erro ao deletar talento");
            }
        }
    };

    return {
        isMobile,
        filters: {
            search,
            status,
            level,
            levelMax,
            attributes
        },
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
                isFetchingNextPage: mobileData.isFetchingNextPage,
                isFetching: mobileData.isFetching,
                hasNextPage: !!mobileData.hasNextPage,
                fetchNextPage: mobileData.fetchNextPage
            }
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
            handleDeleteConfirm
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            isDeleteOpen,
            setIsDeleteOpen,
            selectedFeat,
            isSaving: createFeat.isPending || updateFeat.isPending,
            isDeleting: deleteFeat.isPending
        }
    };
}
