"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FeedbackFilters, FeedbackResponse, Feedback, CreateFeedbackInput, UpdateFeedbackInput } from '../types/feedback.types';
import { fetchFeedbacks, createFeedback, updateFeedback } from '../api/feedback-api';

export const feedbackKeys = {
  all: ['feedbacks'] as const,
  lists: () => [...feedbackKeys.all, 'list'] as const,
  list: (filters: FeedbackFilters) => [...feedbackKeys.lists(), filters] as const,
};

export function useFeedbacks(filters: FeedbackFilters) {
  return useQuery<FeedbackResponse, Error>({
    queryKey: feedbackKeys.list(filters),
    queryFn: () => fetchFeedbacks(filters),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFeedbackInput) => createFeedback(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() });
    },
  });
}

export function useUpdateFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFeedbackInput }) => updateFeedback(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() });
    },
  });
}
