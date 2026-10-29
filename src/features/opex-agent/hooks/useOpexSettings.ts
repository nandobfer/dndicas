"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { OPEX_FEATURE } from "../constants"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { useOpexScope } from "../components/OpexScopeProvider"
import type { OpexAgentSettings } from "../schemas"
import type { OpexAgentSettingsDto } from "../types"
import type { OpexFilesSettings } from "../schemas"

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
export const OPEX_SETTINGS_KEY = [AI_QUERY_KEY, "feature", OPEX_FEATURE] as const

export const useOpexSettings = (enabled = true) =>
    useQuery({
        queryKey: OPEX_SETTINGS_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexAgentSettingsDto>>(`/ai/features/${OPEX_FEATURE}`)).data),
        enabled,
    })

/** O que o painel precisa saber do agente para quem está vendo (situação pública `GET /api/opex/status`). */
export interface OpexView {
    availability: AiFeatureAvailability
    files: OpexFilesSettings
    modelLabel: string | null
}

export function useOpexView(): { data: OpexView | undefined; isLoading: boolean } {
    const { status, statusLoading } = useOpexScope()
    return {
        data: status ? { availability: { available: status.available, reason: status.reason }, files: status.files, modelLabel: status.modelLabel } : undefined,
        isLoading: statusLoading,
    }
}

export function useSaveOpexSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: OpexAgentSettings) => unwrapApi((await api.put<ApiResponse<OpexAgentSettingsDto>>(`/ai/features/${OPEX_FEATURE}`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(OPEX_SETTINGS_KEY, saved)
            toast.success('Configuração do "Agente Opex" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}
