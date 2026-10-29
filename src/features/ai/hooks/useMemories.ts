"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { integrationChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { AiAgentId } from "../agents"
import { AI_MEMORIES_UPDATED_EVENT } from "../constants"
import type { MemoryDto, MemoryMutationResult } from "../types"

/** Origem das memórias de uma lista: chave do cache e rota base (sem `/api`). */
export interface MemorySource {
    queryKey: QueryKey
    basePath: string
    enabled?: boolean
}

export type MemoryAction = { type: "create"; texto: string } | { type: "update"; id: string; texto: string } | { type: "delete"; id: string }

/** Marca de memória ainda sem resumo (o "Resumo de memórias" está formatando). */
export const PENDING_PREFIX = "pendente-"

/** Memórias de uma lista do catálogo `agents.ts`. */
export const agentMemoriesSource = (agentId: AiAgentId, enabled = true): MemorySource => ({ queryKey: ["ai", "memories", agentId], basePath: `/ai/agents/${agentId}/memories`, enabled })

export function optimisticMemories(list: MemoryDto[], action: MemoryAction): MemoryDto[] {
    const now = new Date().toISOString()
    if (action.type === "create") return [{ id: `${PENDING_PREFIX}${Date.now()}`, texto: action.texto, resumo: "", autor: null, criadaEm: now, atualizadaEm: now }, ...list]
    if (action.type === "update") return list.map((item) => (item.id === action.id ? { ...item, texto: action.texto, resumo: "", atualizadaEm: now } : item))
    return list.filter((item) => item.id !== action.id)
}

/**
 * Lista de memórias com criar/editar/excluir otimistas: a linha entra (ou muda) na hora com o
 * resumo "carregando" e, ao responder, mostra o resumo do "Resumo de memórias". Falha → volta ao
 * estado anterior com toast. Copiado do Ciliar.
 */
export function useMemories(source: MemorySource) {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: source.queryKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MemoryDto[]>>(source.basePath)).data),
        enabled: source.enabled !== false,
    })
    const mutation = useMutation({
        mutationFn: async (action: MemoryAction): Promise<MemoryMutationResult | null> => {
            if (action.type === "create") return unwrapApi((await api.post<ApiResponse<MemoryMutationResult>>(source.basePath, { texto: action.texto })).data)
            if (action.type === "update") return unwrapApi((await api.patch<ApiResponse<MemoryMutationResult>>(`${source.basePath}/${action.id}`, { texto: action.texto })).data)
            await api.delete(`${source.basePath}/${action.id}`)
            return null
        },
        onMutate: async (action) => {
            await queryClient.cancelQueries({ queryKey: source.queryKey })
            const previous = queryClient.getQueryData<MemoryDto[]>(source.queryKey)
            if (previous) queryClient.setQueryData<MemoryDto[]>(source.queryKey, optimisticMemories(previous, action))
            return { previous }
        },
        onError: (error, _action, context) => {
            if (context?.previous) queryClient.setQueryData(source.queryKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível salvar a memória"))
        },
        onSuccess: (result, action) => {
            if (result) {
                queryClient.setQueryData<MemoryDto[]>(source.queryKey, (current) => {
                    const list = current ?? []
                    if (action.type === "create") return [result.memoria, ...list.filter((item) => !item.id.startsWith(PENDING_PREFIX))]
                    return list.map((item) => (item.id === result.memoria.id ? result.memoria : item))
                })
                if (!result.formatadaPorIa) toast.warning('Memória salva sem formatação: o uso "Resumo de memórias" da IA está indisponível.')
                else toast.success(action.type === "create" ? "Memória adicionada" : "Memória atualizada")
            } else toast.success("Memória excluída")
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: source.queryKey }),
    })
    return { query, memories: query.data ?? [], mutate: mutation.mutate, pending: mutation.isPending }
}

/** Memórias alteradas em outra aba ou pelo Agente Opex: só invalida e relê. */
export function useMemoriesRealtime(enabled: boolean): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = integrationChannel("ai")
        const channel = acquireChannel(name)
        const handler = (payload: { agentId?: string }) => void queryClient.invalidateQueries({ queryKey: payload?.agentId ? ["ai", "memories", payload.agentId] : ["ai", "memories"] })
        channel.bind(AI_MEMORIES_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(AI_MEMORIES_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, queryClient])
}
