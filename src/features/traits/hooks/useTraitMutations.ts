// src/features/traits/hooks/useTraitMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTrait, updateTrait, deleteTrait } from '../api/traits-api';
import { CreateTraitInput, UpdateTraitInput, Trait } from '../types/traits.types';
import { traitKeys } from './useTraits';
import { invalidateSearchCache } from '@/core/utils/search-engine';

export function useTraitMutations() {
  const queryClient = useQueryClient();

  const create = useMutation<Trait, Error, CreateTraitInput>({
    mutationFn: createTrait,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traitKeys.all })
      invalidateSearchCache()
    },
  });

  const update = useMutation<Trait, Error, { id: string; data: UpdateTraitInput }>({
    mutationFn: ({ id, data }) => updateTrait(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: traitKeys.all });
      invalidateSearchCache()
    },
  });

  const remove = useMutation<void, Error, string>({
    mutationFn: deleteTrait,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: traitKeys.all });
      invalidateSearchCache()
    },
  });

  return { create, update, remove };
}
