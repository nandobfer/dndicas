"use client";

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query"
import { FeedbackFilters, FeedbackResponse, Feedback, CreateFeedbackInput, UpdateFeedbackInput } from '../types/feedback.types';
import { fetchFeedbacks, createFeedback, updateFeedback } from '../api/feedback-api';

export const feedbackKeys = {
    all: ["feedbacks"] as const,
    lists: () => [...feedbackKeys.all, "list"] as const,
    list: (filters: FeedbackFilters) => [...feedbackKeys.lists(), filters] as const,
    infinite: (filters: Omit<FeedbackFilters, "page">) => [...feedbackKeys.lists(), "infinite", filters] as const
}

export function useFeedbacks(filters: FeedbackFilters, options?: { enabled?: boolean }) {
    return useQuery<FeedbackResponse, Error>({
        queryKey: feedbackKeys.list(filters),
        queryFn: () => fetchFeedbacks(filters),
        staleTime: 30 * 1000,
        placeholderData: (previousData) => previousData,
        ...options
    })
}

export function useInfiniteFeedbacks(filters: Omit<FeedbackFilters, "page">, options?: { enabled?: boolean }) {
    return useInfiniteQuery<FeedbackResponse, Error>({
        queryKey: feedbackKeys.infinite(filters),
        queryFn: ({ pageParam = 1 }) => fetchFeedbacks({ ...filters, page: pageParam as number }),
        getNextPageParam: (lastPage) => {
            const totalPages = Math.ceil(lastPage.total / lastPage.limit)
            return lastPage.page < totalPages ? lastPage.page + 1 : undefined
        },
        initialPageParam: 1,
        ...options
    })
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
