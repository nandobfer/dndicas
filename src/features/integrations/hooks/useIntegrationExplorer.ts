"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { IntegrationId } from "@/lib/integrations/catalog"
import type { ExplorerExecuteInput, ExplorerExecuteResult, ExplorerSpecDto } from "../openapi/types"
import { INTEGRATIONS_QUERY_KEY } from "./useIntegrations"

export const explorerSpecKey = (id: IntegrationId, swaggerUrl: string | null) =>
    [INTEGRATIONS_QUERY_KEY, "openapi", id, swaggerUrl] as const

/** Especificação normalizada; a chave inclui a URL para trocar de documentação sem cache velho. */
export function useExplorerSpec(id: IntegrationId, swaggerUrl: string | null, enabled: boolean) {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: explorerSpecKey(id, swaggerUrl),
        queryFn: async () => {
            const { data } = await api.get<{ data: ExplorerSpecDto }>(`/integrations/${id}/openapi`)
            return data.data
        },
        enabled: enabled && Boolean(swaggerUrl),
        staleTime: 5 * 60_000,
        retry: false,
    })
    const reload = async () => {
        const { data } = await api.get<{ data: ExplorerSpecDto }>(`/integrations/${id}/openapi`, { params: { refresh: 1 } })
        queryClient.setQueryData(explorerSpecKey(id, swaggerUrl), data.data)
        return data.data
    }
    return { ...query, reload }
}

export function useExecuteOperation(id: IntegrationId) {
    return useMutation({
        mutationFn: async (input: ExplorerExecuteInput) => {
            const { data } = await api.post<{ data: ExplorerExecuteResult }>(`/integrations/${id}/explore`, input)
            return data.data
        },
    })
}
