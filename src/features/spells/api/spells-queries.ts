/**
 * @fileoverview TanStack Query hooks for Spells feature.
 *
 * @see specs/004-spells-catalog/spec.md - FR-004 to FR-010
 */

"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Spell,
  CreateSpellInput,
  UpdateSpellInput,
  SpellsFilters,
  SpellsListResponse,
} from '../types/spells.types';
import {
  fetchSpells,
  fetchSpell,
  createSpell,
  updateSpell,
  deleteSpell,
} from './spells-api';

/**
 * Query keys factory for spells.
 */
export const spellsKeys = {
  all: ['spells'] as const,
  lists: () => [...spellsKeys.all, 'list'] as const,
  list: (filters: SpellsFilters & { page?: number; limit?: number }) =>
    [...spellsKeys.lists(), filters] as const,
  details: () => [...spellsKeys.all, 'detail'] as const,
  detail: (id: string) => [...spellsKeys.details(), id] as const,
};

/**
 * Hook for fetching spells list with pagination and filters.
 *
 * @param filters - Query filters (search, circles, schools, saveAttributes, diceTypes, status)
 * @param page - Current page number
 * @param limit - Items per page
 * @returns TanStack Query result with paginated spells
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useSpells(
 *   { search: 'fogo', circles: [3], schools: ['Evocação'] },
 *   1,
 *   10
 * );
 * ```
 */
export function useSpells(
  filters: SpellsFilters = {},
  page = 1,
  limit = 10
) {
  return useQuery<SpellsListResponse, Error>({
    queryKey: spellsKeys.list({ ...filters, page, limit }),
    queryFn: () => fetchSpells({ ...filters, page, limit }),
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData, // Keep previous data while fetching
  });
}

/**
 * Hook for fetching a single spell by ID.
 *
 * @param id - Spell ID (null disables the query)
 * @returns TanStack Query result with single spell
 *
 * @example
 * ```tsx
 * const { data: spell, isLoading } = useSpell(spellId);
 * ```
 */
export function useSpell(id: string | null) {
  return useQuery<Spell, Error>({
    queryKey: spellsKeys.detail(id || ''),
    queryFn: () => fetchSpell(id!),
    enabled: !!id, // Only run query if id is provided
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook for creating a spell (admin only).
 *
 * Automatically invalidates the spells list on success.
 *
 * @returns TanStack Mutation for creating spells
 *
 * @example
 * ```tsx
 * const mutation = useCreateSpell();
 * 
 * const handleCreate = () => {
 *   mutation.mutate({
 *     name: 'Bola de Fogo',
 *     description: 'Uma explosão...',
 *     circle: 3,
 *     school: 'Evocação',
 *     baseDice: { quantidade: 8, tipo: 'd6' },
 *     status: 'active'
 *   });
 * };
 * ```
 */
export function useCreateSpell() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSpellInput) => createSpell(data),
    onSuccess: () => {
      // Invalidate all spell lists to refetch with new spell
      queryClient.invalidateQueries({ queryKey: spellsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

/**
 * Hook for updating a spell (admin only).
 *
 * Automatically invalidates the spell lists and the specific spell detail on success.
 *
 * @returns TanStack Mutation for updating spells
 *
 * @example
 * ```tsx
 * const mutation = useUpdateSpell();
 * 
 * const handleUpdate = () => {
 *   mutation.mutate({
 *     id: spellId,
 *     data: { description: 'Descrição atualizada', status: 'inactive' }
 *   });
 * };
 * ```
 */
export function useUpdateSpell() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSpellInput }) =>
      updateSpell(id, data),
    onSuccess: (_, { id }) => {
      // Invalidate lists to reflect the update
      queryClient.invalidateQueries({ queryKey: spellsKeys.lists() });
      // Invalidate the specific spell detail
      queryClient.invalidateQueries({ queryKey: spellsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

/**
 * Hook for deleting a spell (admin only).
 *
 * Automatically invalidates the spell lists on success.
 *
 * @returns TanStack Mutation for deleting spells
 *
 * @example
 * ```tsx
 * const mutation = useDeleteSpell();
 * 
 * const handleDelete = () => {
 *   mutation.mutate(spellId);
 * };
 * ```
 */
export function useDeleteSpell() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSpell(id),
    onSuccess: (_, id) => {
      // Invalidate all spell lists to refetch without deleted spell
      queryClient.invalidateQueries({ queryKey: spellsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: spellsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}
