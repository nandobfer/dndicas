/**
 * @fileoverview TanStack Query hooks for fetching feats data.
 * Manages server state with caching and automatic refetching.
 *
 * @see specs/003-feats-catalog/quickstart.md
 */

import { useQuery } from '@tanstack/react-query';
import { fetchFeats, fetchFeat } from '../api/feats-api';
import { FeatsFilters, FeatsResponse, Feat } from '../types/feats.types';

export function useFeats(filters: FeatsFilters = { page: 1, limit: 10, status: 'all' }) {
  return useQuery<FeatsResponse>({
    queryKey: ['feats', filters],
    queryFn: () => fetchFeats(filters),
    placeholderData: (previousData) => previousData, // Keep previous data while fetching
  });
}

export function useFeat(id: string | null) {
  return useQuery<Feat>({
    queryKey: ['feat', id],
    queryFn: () => fetchFeat(id!),
    enabled: !!id,
  });
}
