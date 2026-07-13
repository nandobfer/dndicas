"use client";

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query"
import { FeedbackFilters, FeedbackResponse, Feedback, CreateFeedbackInput, UpdateFeedbackInput, CreateFeedbackCommentInput, CreateFeedbackPlanInput, FeedbackTimelineEvent, OpenCodeModelOption, FeedbackAgentRun } from '../types/feedback.types';
import { fetchFeedbacks, createFeedback, updateFeedback, fetchFeedback, fetchFeedbackTimeline, createFeedbackComment, fetchOpenCodeModels, queueFeedbackPlan, queueFeedbackImplementation, queueFeedbackIteration, approveFeedback } from '../api/feedback-api';

export const feedbackKeys = {
    all: ["feedbacks"] as const,
    lists: () => [...feedbackKeys.all, "list"] as const,
    list: (filters: FeedbackFilters) => [...feedbackKeys.lists(), filters] as const,
    infinite: (filters: Omit<FeedbackFilters, "page">) => [...feedbackKeys.lists(), "infinite", filters] as const,
    detail: (id: string) => [...feedbackKeys.all, "detail", id] as const,
    timeline: (id: string) => [...feedbackKeys.detail(id), "timeline"] as const,
    opencodeModels: () => [...feedbackKeys.all, "opencode-models"] as const,
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
    onSuccess: (_feedback, variables) => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.detail(variables.id) });
    },
  });
}

export function useFeedback(id: string, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery<Feedback, Error>({
    queryKey: feedbackKeys.detail(id),
    queryFn: () => fetchFeedback(id),
    enabled: options?.enabled ?? Boolean(id),
    refetchInterval: options?.refetchInterval,
  });
}

export function useFeedbackTimeline(id: string, options?: { enabled?: boolean; refetchInterval?: number | false }) {
  return useQuery<FeedbackTimelineEvent[], Error>({
    queryKey: feedbackKeys.timeline(id),
    queryFn: () => fetchFeedbackTimeline(id),
    enabled: options?.enabled ?? Boolean(id),
    refetchInterval: options?.refetchInterval ?? 5000,
  });
}

export function useCreateFeedbackComment(id: string) {
  const queryClient = useQueryClient();

  return useMutation<FeedbackTimelineEvent, Error, CreateFeedbackCommentInput>({
    mutationFn: (data) => createFeedbackComment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.timeline(id) });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() });
    },
  });
}

export function useOpenCodeModels(options?: { enabled?: boolean }) {
  return useQuery<OpenCodeModelOption[], Error>({
    queryKey: feedbackKeys.opencodeModels(),
    queryFn: fetchOpenCodeModels,
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useQueueFeedbackPlan(id: string) {
  const queryClient = useQueryClient();

  return useMutation<FeedbackAgentRun, Error, CreateFeedbackPlanInput>({
    mutationFn: (data) => queueFeedbackPlan(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.timeline(id) });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() });
    },
  });
}

export function useQueueFeedbackImplementation(id: string) {
  const queryClient = useQueryClient();

  return useMutation<FeedbackAgentRun, Error, CreateFeedbackPlanInput>({
    mutationFn: (data) => queueFeedbackImplementation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.timeline(id) });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() });
    },
  });
}

export function useQueueFeedbackIteration(id: string) {
  const queryClient = useQueryClient();

  return useMutation<FeedbackAgentRun, Error, CreateFeedbackPlanInput & { message: string }>({
    mutationFn: (data) => queueFeedbackIteration(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.timeline(id) });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() });
    },
  });
}

export function useApproveFeedback(id: string) {
  const queryClient = useQueryClient();

  return useMutation<FeedbackAgentRun, Error>({
    mutationFn: () => approveFeedback(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.timeline(id) });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.lists() });
    },
  });
}
