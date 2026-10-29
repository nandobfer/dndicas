"use client"

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import axios from "axios"
import { api } from "@/lib/api"
import { isPusherClientAvailable } from "@/lib/pusher/client"
import type { IntegrationId } from "@/lib/integrations/catalog"
import type { IntegrationUpdateInput } from "../schemas/integration.schema"
import type { IntegrationDetailDto, IntegrationHealthDto, IntegrationListItemDto } from "../types"

export const INTEGRATIONS_QUERY_KEY = "integrations"
export const integrationsListKey = [INTEGRATIONS_QUERY_KEY, "list"] as const
export const integrationDetailKey = (id: IntegrationId) => [INTEGRATIONS_QUERY_KEY, "detail", id] as const

/** Com Pusher o status chega por evento; o polling fica só como rede de segurança. */
export const STATUS_POLL_REALTIME_MS = 60_000
/** Sem Pusher, o polling é o único canal de atualização do status. */
export const STATUS_POLL_FALLBACK_MS = 15_000

export function statusPollInterval(): number {
    return isPusherClientAvailable() ? STATUS_POLL_REALTIME_MS : STATUS_POLL_FALLBACK_MS
}

/** Mensagem de erro da API em pt-BR, com fallback. */
export function integrationErrorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError(error)) {
        const message = (error.response?.data as { error?: string } | undefined)?.error
        if (message) return message
    }
    return fallback
}

/**
 * Aplica um status novo (ou parcial, ex.: só `checking`) no cache da lista e do detalhe, sem
 * nova requisição. Ignora resultados mais antigos que o já exibido.
 */
export function applyIntegrationHealth(
    queryClient: QueryClient,
    id: IntegrationId,
    patch: Partial<IntegrationHealthDto>,
): void {
    const merge = (current: IntegrationHealthDto): IntegrationHealthDto => {
        if (patch.checkedAt && current.checkedAt && patch.checkedAt < current.checkedAt) {
            return { ...current, checking: patch.checking ?? current.checking }
        }
        return { ...current, ...patch }
    }
    queryClient.setQueryData<IntegrationListItemDto[]>(integrationsListKey, (list) =>
        list?.map((item) => (item.id === id ? { ...item, health: merge(item.health) } : item)),
    )
    queryClient.setQueryData<IntegrationDetailDto>(integrationDetailKey(id), (detail) =>
        detail ? { ...detail, health: merge(detail.health) } : detail,
    )
}

export function useIntegrations() {
    return useQuery({
        queryKey: integrationsListKey,
        queryFn: async () => {
            const { data } = await api.get<{ data: IntegrationListItemDto[] }>("/integrations")
            return data.data
        },
        // Status também muda pelo health check periódico do servidor. Só com a aba visível.
        refetchInterval: statusPollInterval,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
    })
}

export function useIntegration(id: IntegrationId) {
    return useQuery({
        queryKey: integrationDetailKey(id),
        queryFn: async () => {
            const { data } = await api.get<{ data: IntegrationDetailDto }>(`/integrations/${id}`)
            return data.data
        },
        // Crons mostra o estado das rotinas, que muda sozinho: mantém 30s.
        refetchInterval: () => (id === "crons" ? Math.min(30_000, statusPollInterval()) : statusPollInterval()),
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
    })
}

export function useUpdateIntegration(id: IntegrationId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: IntegrationUpdateInput) => {
            const { data } = await api.patch<{ data: IntegrationDetailDto }>(`/integrations/${id}`, input)
            return data.data
        },
        onSuccess: (detail) => {
            queryClient.setQueryData(integrationDetailKey(id), detail)
            void queryClient.invalidateQueries({ queryKey: integrationsListKey })
        },
    })
}

export interface CronJobRunResult {
    ok: boolean
    message: string
    durationMs: number
}

/** "Executar agora" de uma rotina salva dos Crons. Atualiza o estado das rotinas ao terminar. */
export function useRunCronJob() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (jobId: string) => {
            const { data } = await api.post<{ data: CronJobRunResult }>(
                `/integrations/crons/jobs/${encodeURIComponent(jobId)}/run`,
            )
            return data.data
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: integrationDetailKey("crons") })
        },
    })
}
