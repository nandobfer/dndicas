/**
 * @fileoverview TanStack Query mutations for feat CRUD operations.
 * Manages create/update/delete with automatic cache invalidation.
 *
 * @see specs/003-feats-catalog/quickstart.md
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFeat, updateFeat, deleteFeat } from '../api/feats-api';
import { CreateFeatInput, UpdateFeatInput, Feat } from '../types/feats.types';
import { featKeys } from "./useFeats"

export function useFeatMutations() {
    const queryClient = useQueryClient()

    const createFeatMutation = useMutation<Feat, Error, CreateFeatInput>({
        mutationFn: createFeat,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: featKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        },
    })

    const updateFeatMutation = useMutation<Feat, Error, { id: string; data: UpdateFeatInput }>({
        mutationFn: ({ id, data }) => updateFeat(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: featKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        },
    })

    const deleteFeatMutation = useMutation<void, Error, string>({
        mutationFn: deleteFeat,
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: featKeys.all })
            queryClient.invalidateQueries({ queryKey: ["audit-logs"] })
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
        },
    })

    return {
        createFeat: createFeatMutation,
        updateFeat: updateFeatMutation,
        deleteFeat: deleteFeatMutation,
    }
}
