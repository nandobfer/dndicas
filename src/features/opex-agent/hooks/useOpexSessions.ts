"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AxiosInstance } from "axios"
import { toast } from "sonner"
import { apiErrorMessage, unwrapApi } from "@/lib/api"
import { randomId } from "@/lib/random-id"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { OPEX_SESSION_DELETED_EVENT, OPEX_SESSION_UPDATED_EVENT } from "../constants"
import type { OpexConfirmationDto, OpexFileDto, OpexMessageDto, OpexSessionDetailDto, OpexSessionDto } from "../types"
import { useOpexScope } from "../components/OpexScopeProvider"

/**
 * Consultas e mutações das sessões do Agente Opex. Tudo passa pelo escopo da interface: o dono usa
 * `/opex` e `private-app`; o portal usa `/cliente/opex` (axios com `x-client-id`) e o canal privado
 * do próprio usuário. As chaves do cache também são separadas por escopo.
 */

export const OPEX_QUERY_KEY = "opex-agent"
export const opexSessionsKey = (prefix: string) => [prefix, "sessions"] as const
export const opexSessionKey = (prefix: string, id: string) => [prefix, "session", id] as const

const get = async <T,>(http: AxiosInstance, path: string) => unwrapApi((await http.get<ApiResponse<T>>(path)).data)

export const useOpexSessions = (enabled = true) => {
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useQuery({ queryKey: opexSessionsKey(queryPrefix), queryFn: () => get<OpexSessionDto[]>(http, `${apiBase}/sessions`), enabled, staleTime: 30_000 })
}

export const useOpexSession = (id: string | null) => {
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useQuery({
        queryKey: opexSessionKey(queryPrefix, id ?? ""),
        queryFn: () => get<OpexSessionDetailDto>(http, `${apiBase}/sessions/${id}`),
        enabled: Boolean(id),
        staleTime: 30_000,
    })
}

function patchSessionInList(list: OpexSessionDto[] | undefined, session: OpexSessionDto): OpexSessionDto[] {
    if (!list) return [session]
    const exists = list.some((item) => item.id === session.id)
    const next = exists ? list.map((item) => (item.id === session.id ? session : item)) : [session, ...list]
    return [...next].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

export function useCreateOpexSession() {
    const queryClient = useQueryClient()
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useMutation({
        mutationFn: async (text?: string) =>
            unwrapApi((await http.post<ApiResponse<{ session: OpexSessionDto; message: OpexMessageDto | null }>>(`${apiBase}/sessions`, text ? { text } : {})).data),
        onSuccess: ({ session, message }) => {
            queryClient.setQueryData<OpexSessionDto[]>(opexSessionsKey(queryPrefix), (list) => patchSessionInList(list, message ? { ...session, status: "running", messageCount: 2 } : session))
            queryClient.setQueryData<OpexSessionDetailDto>(opexSessionKey(queryPrefix, session.id), { session: message ? { ...session, status: "running" } : session, messages: message ? [message] : [] })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar a sessão")),
    })
}

const OPTIMISTIC_PREFIX = "optimistic-"

export interface OpexSendInput {
    text: string
    files?: OpexFileDto[]
}

/** Envia a mensagem com resposta otimista: aparece na hora e some (com toast) se falhar. */
export function useSendOpexMessage(sessionId: string) {
    const queryClient = useQueryClient()
    const { http, apiBase, queryPrefix } = useOpexScope()
    const key = opexSessionKey(queryPrefix, sessionId)
    return useMutation({
        mutationFn: async ({ text, files = [] }: OpexSendInput) =>
            unwrapApi((await http.post<ApiResponse<OpexMessageDto>>(`${apiBase}/sessions/${sessionId}/messages`, { text, fileIds: files.map((file) => file.id) })).data),
        onMutate: async ({ text, files = [] }) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<OpexSessionDetailDto>(key)
            const optimistic: OpexMessageDto = {
                id: `${OPTIMISTIC_PREFIX}${randomId()}`,
                role: "user",
                kind: "message",
                job: null,
                text,
                files,
                parts: [],
                status: "complete",
                error: null,
                usage: null,
                durationMs: null,
                model: null,
                createdAt: new Date().toISOString(),
            }
            if (previous) queryClient.setQueryData<OpexSessionDetailDto>(key, { session: { ...previous.session, status: "running", lastError: null }, messages: [...previous.messages, optimistic] })
            return { previous, optimisticId: optimistic.id }
        },
        onSuccess: (message, _input, context) => {
            queryClient.setQueryData<OpexSessionDetailDto>(key, (current) =>
                current ? { ...current, messages: current.messages.map((item) => (item.id === context?.optimisticId ? message : item)) } : current,
            )
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível enviar a mensagem"))
        },
    })
}

export function useUpdateOpexSession() {
    const queryClient = useQueryClient()
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useMutation({
        mutationFn: async ({ id, ...input }: { id: string; title?: string; archived?: boolean }) =>
            unwrapApi((await http.patch<ApiResponse<OpexSessionDto>>(`${apiBase}/sessions/${id}`, input)).data),
        onMutate: async ({ id, ...input }) => {
            await queryClient.cancelQueries({ queryKey: opexSessionsKey(queryPrefix) })
            const previous = queryClient.getQueryData<OpexSessionDto[]>(opexSessionsKey(queryPrefix))
            queryClient.setQueryData<OpexSessionDto[]>(opexSessionsKey(queryPrefix), (list) =>
                list?.map((item) => (item.id === id ? { ...item, ...input, titleSource: input.title !== undefined ? "manual" : item.titleSource } : item)),
            )
            return { previous }
        },
        onSuccess: (session) => {
            queryClient.setQueryData<OpexSessionDto[]>(opexSessionsKey(queryPrefix), (list) => list?.map((item) => (item.id === session.id ? session : item)))
            queryClient.setQueryData<OpexSessionDetailDto>(opexSessionKey(queryPrefix, session.id), (current) => (current ? { ...current, session } : current))
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(opexSessionsKey(queryPrefix), context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível alterar a sessão"))
        },
    })
}

export function useDeleteOpexSession() {
    const queryClient = useQueryClient()
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await http.delete<ApiResponse<{ id: string }>>(`${apiBase}/sessions/${id}`)).data),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: opexSessionsKey(queryPrefix) })
            const previous = queryClient.getQueryData<OpexSessionDto[]>(opexSessionsKey(queryPrefix))
            queryClient.setQueryData<OpexSessionDto[]>(opexSessionsKey(queryPrefix), (list) => list?.filter((item) => item.id !== id))
            return { previous }
        },
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: opexSessionKey(queryPrefix, id) })
            toast.success("Sessão excluída")
        },
        onError: (error, _id, context) => {
            if (context?.previous) queryClient.setQueryData(opexSessionsKey(queryPrefix), context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível excluir a sessão"))
        },
    })
}

export function useInterruptOpex(sessionId: string) {
    const { http, apiBase } = useOpexScope()
    return useMutation({
        mutationFn: async () => unwrapApi((await http.post<ApiResponse<{ id: string }>>(`${apiBase}/sessions/${sessionId}/interrupt`, {})).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível parar a resposta")),
    })
}

/** Confirma ou cancela a ação pendente (o card muda na hora; volta se falhar). */
export function useDecideOpexAction(sessionId: string) {
    const queryClient = useQueryClient()
    const { http, apiBase, queryPrefix } = useOpexScope()
    const key = opexSessionKey(queryPrefix, sessionId)
    const setStatus = (actionId: string, status: OpexConfirmationDto["status"]) =>
        queryClient.setQueryData<OpexSessionDetailDto>(key, (current) =>
            current
                ? {
                      ...current,
                      messages: current.messages.map((message) => ({
                          ...message,
                          parts: message.parts.map((part) => (part.type === "tool" && part.confirmation?.actionId === actionId ? { ...part, confirmation: { ...part.confirmation, status } } : part)),
                      })),
                  }
                : current,
        )
    return useMutation({
        mutationFn: async ({ actionId, decision }: { actionId: string; decision: "confirm" | "cancel" }) =>
            unwrapApi((await http.post<ApiResponse<OpexConfirmationDto>>(`${apiBase}/actions/${actionId}`, { decision })).data),
        onMutate: ({ actionId, decision }) => {
            setStatus(actionId, decision === "confirm" ? "confirmed" : "cancelled")
            return { actionId }
        },
        onSuccess: (confirmation) => {
            setStatus(confirmation.actionId, confirmation.status)
            void queryClient.invalidateQueries({ queryKey: key })
        },
        onError: (error, { actionId }) => {
            setStatus(actionId, "pending")
            toast.error(apiErrorMessage(error, "Não foi possível registrar a decisão"))
            void queryClient.invalidateQueries({ queryKey: key })
        },
    })
}

/** Título, resumo e situação das sessões ao vivo (Pusher), no canal do escopo. */
export function useOpexRealtime(enabled: boolean): void {
    const queryClient = useQueryClient()
    const { channel: name, queryPrefix } = useOpexScope()
    useEffect(() => {
        if (!enabled || !name || !isPusherClientAvailable()) return
        const channel = acquireChannel(name)
        const onUpdated = (payload: { id?: string }) => {
            void queryClient.invalidateQueries({ queryKey: opexSessionsKey(queryPrefix) })
            if (payload?.id) void queryClient.invalidateQueries({ queryKey: opexSessionKey(queryPrefix, payload.id) })
        }
        const onDeleted = (payload: { id?: string }) => {
            queryClient.setQueryData<OpexSessionDto[]>(opexSessionsKey(queryPrefix), (list) => list?.filter((item) => item.id !== payload?.id))
            if (payload?.id) queryClient.removeQueries({ queryKey: opexSessionKey(queryPrefix, payload.id) })
        }
        channel.bind(OPEX_SESSION_UPDATED_EVENT, onUpdated)
        channel.bind(OPEX_SESSION_DELETED_EVENT, onDeleted)
        return () => {
            channel.unbind(OPEX_SESSION_UPDATED_EVENT, onUpdated)
            channel.unbind(OPEX_SESSION_DELETED_EVENT, onDeleted)
            releaseChannel(name)
        }
    }, [enabled, queryClient, name, queryPrefix])
}
