"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { 
    backgroundsKeys, 
    useBackground, 
    useCreateBackground, 
    useUpdateBackground 
} from "../api/backgrounds-queries"

export function useBackgrounds(id?: string) {
  const queryClient = useQueryClient()

  const { data: background, isLoading } = useBackground(id || null)

  const { mutateAsync: createMutate, isPending: isCreating } = useCreateBackground()

  const { mutateAsync: updateMutate, isPending: isUpdating } = useUpdateBackground()

  return {
    background,
    isLoading,
    createBackground: createMutate,
    updateBackground: updateMutate,
    isCreating,
    isUpdating,
  }
}
