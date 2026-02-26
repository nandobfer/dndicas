// src/features/rules/hooks/useRuleMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createRule, updateRule, deleteRule } from '../api/rules-api';
import { CreateReferenceInput, UpdateReferenceInput, Reference } from '../types/rules.types';

export function useRuleMutations() {
  const queryClient = useQueryClient();

  const createRuleMutation = useMutation<Reference, Error, CreateReferenceInput>({
      mutationFn: createRule,
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["rules"] })
          queryClient.invalidateQueries({ queryKey: ["rules-infinite"] })
      },
  })

  const updateRuleMutation = useMutation<Reference, Error, { id: string; data: UpdateReferenceInput }>({
      mutationFn: ({ id, data }) => updateRule(id, data),
      onSuccess: (_, { id }) => {
          queryClient.invalidateQueries({ queryKey: ["rules"] })
          queryClient.invalidateQueries({ queryKey: ["rules-infinite"] })
          queryClient.invalidateQueries({ queryKey: ["rule", id] })
      },
  })

  const deleteRuleMutation = useMutation<void, Error, string>({
      mutationFn: deleteRule,
      onSuccess: (_, id) => {
          queryClient.invalidateQueries({ queryKey: ["rules"] })
          queryClient.invalidateQueries({ queryKey: ["rules-infinite"] })
          queryClient.invalidateQueries({ queryKey: ["rule", id] })
      },
  })

  return {
    createRule: createRuleMutation,
    updateRule: updateRuleMutation,
    deleteRule: deleteRuleMutation,
  };
}
