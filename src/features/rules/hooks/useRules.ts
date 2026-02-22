// src/features/rules/hooks/useRules.ts
import { useQuery } from '@tanstack/react-query';
import { fetchRules, fetchRule } from '../api/rules-api';
import { RulesFilters, RulesResponse, Reference } from '../types/rules.types';

export function useRules(filters: RulesFilters = { page: 1, limit: 10, status: 'all' }) {
  return useQuery<RulesResponse>({
    queryKey: ['rules', filters],
    queryFn: () => fetchRules(filters),
    placeholderData: (previousData) => previousData, // Keep previous data while fetching
  });
}

export function useRule(id: string | null) {
  return useQuery<Reference>({
    queryKey: ['rule', id],
    queryFn: () => fetchRule(id!),
    enabled: !!id,
  });
}
