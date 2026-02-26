"use client";

import * as React from 'react';
import { useFeedbacks, useInfiniteFeedbacks, useCreateFeedback, useUpdateFeedback } from './useFeedback';
import { useDebounce } from '@/core/hooks/useDebounce';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import type { 
    Feedback, 
    FeedbackFilters, 
    CreateFeedbackInput, 
    UpdateFeedbackInput 
} from '../types/feedback.types';

/**
 * Hook for logic of the Feedback page, featuring responsive data fetching 
 * (Query for desktop/Table, InfiniteQuery for mobile/List).
 */
export function useFeedbackPage() {
    const isMobile = useIsMobile();
    
    // State
    const [page, setPage] = React.useState(1);
    const [search, setSearch] = React.useState("");
    const [status, setStatus] = React.useState<FeedbackFilters['status']>("all");
    const [priority, setPriority] = React.useState<FeedbackFilters['priority']>("all");
    const [type, setType] = React.useState<FeedbackFilters['type']>("all");
    
    // Debounced search
    const debouncedSearch = useDebounce(search, 500);

    // Common filters object
    const filters = React.useMemo(() => ({
        search: debouncedSearch,
        status,
        priority,
        type,
        limit: 10,
    }), [debouncedSearch, status, priority, type]);

    /**
     * Data Fetching
     * Uses regular query for desktop table and infinite query for mobile list.
     */
    
    // Desktop View Data
    const desktopData = useFeedbacks({
        ...filters,
        page,
    }, { enabled: !isMobile });

    // Mobile View Data
    const mobileData = useInfiniteFeedbacks(filters, { enabled: isMobile });

    // Mutations
    const createMutation = useCreateFeedback();
    const updateMutation = useUpdateFeedback();

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [selectedFeedback, setSelectedFeedback] = React.useState<Feedback | null>(null);

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const handleStatusChange = (value: FeedbackFilters['status']) => {
        setStatus(value);
        setPage(1);
    };

    const handlePriorityChange = (value: FeedbackFilters['priority']) => {
        setPriority(value);
        setPage(1);
    };

    const handleTypeChange = (value: FeedbackFilters['type']) => {
        setType(value);
        setPage(1);
    };

    const handleCreateClick = () => {
        setSelectedFeedback(null);
        setIsFormOpen(true);
    };

    const handleEditClick = (feedback: Feedback) => {
        setSelectedFeedback(feedback);
        setIsFormOpen(true);
    };

    const handleFormSubmit = async (formData: CreateFeedbackInput | UpdateFeedbackInput) => {
        if (selectedFeedback) {
            await updateMutation.mutateAsync({
                id: selectedFeedback.id,
                data: formData as UpdateFeedbackInput
            });
        } else {
            await createMutation.mutateAsync(formData as CreateFeedbackInput);
        }
        setIsFormOpen(false);
        setSelectedFeedback(null);
    };

    return {
        isMobile,
        filters: {
            search,
            status,
            priority,
            type,
        },
        pagination: {
            page,
            setPage,
            total: desktopData.data?.total || 0,
            limit: 10,
        },
        data: {
            desktop: {
                items: desktopData.data?.items || [],
                isLoading: desktopData.isLoading,
                isFetching: desktopData.isFetching,
            },
            mobile: {
                items: mobileData.data?.pages.flatMap(p => p.items) || [],
                isLoading: mobileData.isLoading,
                isFetchingNextPage: mobileData.isFetchingNextPage,
                hasNextPage: !!mobileData.hasNextPage,
                fetchNextPage: mobileData.fetchNextPage,
            }
        },
        actions: {
            handleSearchChange,
            handleStatusChange,
            handlePriorityChange,
            handleTypeChange,
            handleCreateClick,
            handleEditClick,
            handleFormSubmit,
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            selectedFeedback,
            isSaving: createMutation.isPending || updateMutation.isPending,
        }
    };
}
