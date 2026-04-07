// src/features/rules/hooks/useRuleMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createRule, updateRule, deleteRule } from '../api/rules-api';
import { CreateReferenceInput, UpdateReferenceInput, Reference } from '../types/rules.types';
import { invalidateSearchCache } from '@/core/utils/search-engine';

export function useRuleMutations() {
  const queryClient = useQueryClient();

  const createRuleMutation = useMutation<Reference, Error, CreateReferenceInput>({
      mutationFn: createRule,
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["rules"] })
          queryClient.invalidateQueries({ queryKey: ["rules-infinite"] })
          invalidateSearchCache()
      },
  })

  const updateRuleMutation = useMutation<Reference, Error, { id: string; data: UpdateReferenceInput }>({
      mutationFn: ({ id, data }) => updateRule(id, data),
      onSuccess: (_, { id }) => {
          queryClient.invalidateQueries({ queryKey: ["rules"] })
          queryClient.invalidateQueries({ queryKey: ["rules-infinite"] })
          queryClient.invalidateQueries({ queryKey: ["rule", id] })
          invalidateSearchCache()
      },
  })

  const deleteRuleMutation = useMutation<void, Error, string>({
      mutationFn: deleteRule,
      onSuccess: (_, id) => {
          queryClient.invalidateQueries({ queryKey: ["rules"] })
          queryClient.invalidateQueries({ queryKey: ["rules-infinite"] })
          queryClient.invalidateQueries({ queryKey: ["rule", id] })
          invalidateSearchCache()
      },
  })

  return {
    createRule: createRuleMutation,
    updateRule: updateRuleMutation,
    deleteRule: deleteRuleMutation,
  };
}
