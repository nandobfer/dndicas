"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { MEMORY_SUMMARY_FEATURE } from "../constants"
import type { MemorySummarySettings } from "../schemas"
import type { MemorySummarySettingsDto } from "../types"
import { AI_QUERY_KEY } from "./useAi"

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
const KEY = [AI_QUERY_KEY, "feature", MEMORY_SUMMARY_FEATURE] as const
const PATH = `/ai/features/${MEMORY_SUMMARY_FEATURE}`

export const useMemorySummarySettings = () => useQuery({ queryKey: KEY, queryFn: async () => unwrapApi((await api.get<ApiResponse<MemorySummarySettingsDto>>(PATH)).data) })

export function useSaveMemorySummarySettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: MemorySummarySettings) => unwrapApi((await api.put<ApiResponse<MemorySummarySettingsDto>>(PATH, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(KEY, saved)
            toast.success('Configuração do "Resumo de memórias" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}
