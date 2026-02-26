/**
 * @fileoverview Hook for fetching users with TanStack Query.
 *
 * @see specs/000/spec.md - FR-013
 */

"use client";

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import type {
  User,
  UserResponse,
  UserFilters,
  UsersListResponse,
  CreateUserInput,
  UpdateUserInput,
} from '../types/user.types';
import {
  fetchUsers,
  fetchUser,
  createUser,
  updateUser,
  deleteUser,
} from '../api/users';

/**
 * Query keys for users.
 */
export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (filters: UserFilters) => [...usersKeys.lists(), filters] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (id: string) => [...usersKeys.details(), id] as const,
};

/**
 * Hook for fetching users list with pagination and filters.
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useUsers(filters);
 * ```
 */
export function useUsers(filters: UserFilters, options: { enabled?: boolean } = {}) {
  return useQuery<UsersListResponse, Error>({
    queryKey: usersKeys.list(filters),
    queryFn: () => fetchUsers(filters),
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData,
    ...options
  });
}

/**
 * Hook for fetching users list with infinite scrolling.
 */
export function useInfiniteUsers(filters: UserFilters, options: { enabled?: boolean } = {}) {
  return useInfiniteQuery<UsersListResponse, Error>({
    queryKey: [...usersKeys.list(filters), 'infinite'],
    queryFn: ({ pageParam = 1 }) => fetchUsers({ ...filters, page: pageParam as number }),
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
    staleTime: 30 * 1000,
    ...options
  });
}

/**
 * Hook for fetching a single user.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useUser(userId);
 * ```
 */
export function useUser(id: string | null) {
  return useQuery<UserResponse, Error>({
    queryKey: usersKeys.detail(id || ''),
    queryFn: () => fetchUser(id!),
    enabled: !!id,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook for creating a user.
 *
 * @example
 * ```tsx
 * const mutation = useCreateUser();
 * mutation.mutate(userData);
 * ```
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserInput) => createUser(data),
    onSuccess: () => {
      // Invalidate all user lists
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
    },
  });
}

/**
 * Hook for updating a user.
 *
 * @example
 * ```tsx
 * const mutation = useUpdateUser();
 * mutation.mutate({ id: userId, data: updateData });
 * ```
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserInput }) =>
      updateUser(id, data),
    onSuccess: (_, { id }) => {
      // Invalidate lists and the specific user
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(id) });
    },
  });
}

/**
 * Hook for deleting a user.
 *
 * @example
 * ```tsx
 * const mutation = useDeleteUser();
 * mutation.mutate(userId);
 * ```
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      // Invalidate all user lists
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
    },
  });
}
