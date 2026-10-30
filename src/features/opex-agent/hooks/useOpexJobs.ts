"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { useOpexScope } from "../components/OpexScopeProvider"
import {
    OPEX_JOB_FINISHED_EVENT,
    OPEX_JOB_UPDATED_EVENT,
    type OpexJobDto,
    type OpexJobFilter,
    type OpexJobFinishedPayload,
    type OpexJobInput,
    type OpexJobOriginFilter,
} from "../jobs"
import { requestOpenOpexSession } from "../open-session"

/**
 * Jobs do Agente Opex na interface. Tudo passa pelo escopo (`useOpexScope`): a aba Jobs vive no app
 * do dono (`/opex/jobs`, `private-app`); no portal, só os avisos de job terminado (canal do usuário).
 */

export interface OpexJobsQuery {
    filter: OpexJobFilter
    origin?: OpexJobOriginFilter
}

export const opexJobsKey = (prefix: string) => [prefix, "jobs"] as const
export const opexJobsFilterKey = (prefix: string, query: OpexJobsQuery) => [...opexJobsKey(prefix), query.filter, query.origin ?? "all"] as const

export function useOpexJobs(query: OpexJobsQuery) {
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useQuery({
        queryKey: opexJobsFilterKey(queryPrefix, query),
        queryFn: async () =>
            unwrapApi(
                (await http.get<ApiResponse<OpexJobDto[]>>(`${apiBase}/jobs`, { params: { filter: query.filter, origin: query.origin ?? "all" } }))
                    .data,
            ),
        staleTime: 15_000,
    })
}

/** Cria (ou reexecuta) e edita um job. */
export function useSaveOpexJob() {
    const queryClient = useQueryClient()
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useMutation({
        mutationFn: async ({ id, input }: { id?: string; input: OpexJobInput }) =>
            id
                ? unwrapApi((await http.patch<ApiResponse<OpexJobDto>>(`${apiBase}/jobs/${id}`, input)).data)
                : unwrapApi((await http.post<ApiResponse<OpexJobDto>>(`${apiBase}/jobs`, input)).data),
        onSuccess: (job, { id }) => {
            if (job.status === "error") toast.error(`O job "${job.title}" falhou ao iniciar`, { description: job.error ?? undefined })
            else if (job.status === "running") toast.success(`Job "${job.title}" em execução`)
            else toast.success(id ? "Job atualizado" : "Job agendado")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o job")),
        onSettled: () => void queryClient.invalidateQueries({ queryKey: opexJobsKey(queryPrefix) }),
    })
}

/** Cancela com resposta otimista (o job some de "Agendados" na hora; volta com toast se falhar). */
export function useCancelOpexJob() {
    const queryClient = useQueryClient()
    const { http, apiBase, queryPrefix } = useOpexScope()
    const key = opexJobsKey(queryPrefix)
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await http.delete<ApiResponse<OpexJobDto>>(`${apiBase}/jobs/${id}`)).data),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueriesData<OpexJobDto[]>({ queryKey: key })
            for (const [queryKey, list] of previous) {
                const filter = (queryKey as readonly unknown[])[2]
                queryClient.setQueryData<OpexJobDto[]>(queryKey, filter === "scheduled" ? list?.filter((job) => job.id !== id) : list?.map((job) => (job.id === id ? { ...job, status: "canceled" } : job)))
            }
            return { previous }
        },
        onSuccess: () => toast.success("Job cancelado"),
        onError: (error, _id, context) => {
            for (const [queryKey, data] of context?.previous ?? []) queryClient.setQueryData(queryKey, data)
            toast.error(apiErrorMessage(error, "Não foi possível cancelar o job"))
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
    })
}

/** Lista de jobs ao vivo: qualquer mudança só invalida e relê. */
export function useOpexJobsRealtime(enabled: boolean): void {
    const queryClient = useQueryClient()
    const { channel: name, queryPrefix } = useOpexScope()
    useEffect(() => {
        if (!enabled || !name || !isPusherClientAvailable()) return
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: opexJobsKey(queryPrefix) })
        channel.bind(OPEX_JOB_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(OPEX_JOB_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, queryClient, name, queryPrefix])
}

/** Toast do job terminado, com "Abrir sessão". */
export function notifyJobFinished(payload: OpexJobFinishedPayload): void {
    const action = payload.sessionId ? { label: "Abrir sessão", onClick: () => requestOpenOpexSession(payload.sessionId!) } : undefined
    if (payload.status === "error") toast.error(`O job "${payload.title}" falhou`, { description: payload.error ?? undefined, action })
    else if (payload.status === "awaiting_confirmation") toast.warning(`O job "${payload.title}" aguarda sua confirmação`, { action })
    else toast.success(`Job "${payload.title}" concluído`, { action })
}

/**
 * Avisos dos jobs em qualquer tela (montado no botão flutuante do agente). Chegam no canal do
 * próprio usuário, então só os jobs dele avisam.
 */
export function useOpexJobNotifications(enabled: boolean): void {
    const { channel: name } = useOpexScope()
    useEffect(() => {
        if (!enabled || !name || !isPusherClientAvailable()) return
        const channel = acquireChannel(name)
        const handler = (payload: OpexJobFinishedPayload) => {
            if (!payload?.id) return
            notifyJobFinished(payload)
        }
        channel.bind(OPEX_JOB_FINISHED_EVENT, handler)
        return () => {
            channel.unbind(OPEX_JOB_FINISHED_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, name])
}
