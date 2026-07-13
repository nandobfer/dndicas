"use client";

import * as React from 'react';
import { useInfiniteFeedbacks, useCreateFeedback, useUpdateFeedback } from './useFeedback';
import { useDebounce } from '@/core/hooks/useDebounce';
import type { 
    Feedback, 
    FeedbackFilters, 
    CreateFeedbackInput, 
    UpdateFeedbackInput 
} from '../types/feedback.types';

/**
 * Hook for logic of the Feedback page, using cards with infinite loading for every viewport.
 */
export function useFeedbackPage() {
    // State
    const [search, setSearch] = React.useState("");
    const [status, setStatus] = React.useState<FeedbackFilters["status"]>("pendente")
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

    const feedbackData = useInfiniteFeedbacks(filters);

    // Mutations
    const createMutation = useCreateFeedback();
    const updateMutation = useUpdateFeedback();

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [selectedFeedback, setSelectedFeedback] = React.useState<Feedback | null>(null);

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value);
    };

    const handleStatusChange = (value: FeedbackFilters['status']) => {
        setStatus(value);
    };

    const handlePriorityChange = (value: FeedbackFilters['priority']) => {
        setPriority(value);
    };

    const handleTypeChange = (value: FeedbackFilters['type']) => {
        setType(value);
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
        filters: {
            search,
            status,
            priority,
            type,
        },
        data: {
            items: feedbackData.data?.pages.flatMap(p => p.items) || [],
            isLoading: feedbackData.isLoading,
            isFetchingNextPage: feedbackData.isFetchingNextPage,
            hasNextPage: !!feedbackData.hasNextPage,
            fetchNextPage: feedbackData.fetchNextPage,
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
