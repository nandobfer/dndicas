// src/features/traits/hooks/useTraits.ts
import { useQuery } from '@tanstack/react-query';
import { fetchTraits, fetchTraitById } from '../api/traits-api';
import { TraitFilterParams, TraitsResponse, Trait } from "../types/traits.types"

export const traitKeys = {
    all: ["traits"] as const,
    lists: () => [...traitKeys.all, "list"] as const,
    list: (filters: TraitFilterParams) => [...traitKeys.lists(), filters] as const,
    details: () => [...traitKeys.all, "detail"] as const,
    detail: (id: string) => [...traitKeys.details(), id] as const,
}

export function useTraits(filters: TraitFilterParams = { page: 1, limit: 10, status: "all" }) {
    return useQuery<TraitsResponse>({
        queryKey: traitKeys.list(filters),
        queryFn: () => fetchTraits(filters),
        placeholderData: (previousData) => previousData, // Keep previous data while fetching
    })
}

export function useTrait(id: string | null) {
  return useQuery<Trait>({
    queryKey: traitKeys.detail(id!),
    queryFn: () => fetchTraitById(id!),
    enabled: !!id,
  });
}
