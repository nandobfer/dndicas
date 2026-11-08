"use client"

import { useEffect, useLayoutEffect } from "react"
import axios from "axios"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { DEFAULT_UNIVERSE_LAYOUT, type UniverseLayoutConfig, type UniverseLayoutIssue } from "@engramind/client"
import { subscribeLive } from "@engramind/client/react"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import type { ApiResponse } from "@/lib/types/api"
import { UNIVERSE_LAYOUT_LIVE_EVENT } from "../constants"
import type { UniverseLayoutDto } from "../types"
import { ENGRAMIND_QUERY_KEY } from "./useEngramind"

/**
 * Layout dos universos da rede (DND-34). A consulta alimenta o `MemoriesProvider` (a rede de `/memorias`)
 * e a aba Visualização da integração. Muda em tempo real: na rede, pelo SSE `/api/engramind/events`
 * (`universe-layout.updated`, a mesma conexão da lib); na aba, pelo `useEngramindRealtime`.
 */

export const UNIVERSE_LAYOUT_ROUTE = "/engramind/universe-layout"
export const UNIVERSE_LAYOUT_QUERY_KEY = [ENGRAMIND_QUERY_KEY, "universe-layout"] as const
const ENGRAMIND_EVENTS_URL = withBasePath("/api/engramind/events")

const fetchLayout = async () => unwrapApi((await api.get<ApiResponse<UniverseLayoutDto>>(UNIVERSE_LAYOUT_ROUTE)).data)

/** DTO a partir do que a página leu no servidor (`null` = padrão da lib). */
export const layoutDtoFrom = (config: UniverseLayoutConfig | null): UniverseLayoutDto => (config ? { config, isDefault: false, updatedAt: null } : { config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null })

/**
 * `initial` (o layout lido pela página no servidor) prevalece sobre o cache ao montar e quando muda: voltar a
 * `/memorias` pela navegação do cliente com um cache ainda fresco (outro admin importou enquanto a rede
 * estava desmontada, sem o SSE) não mantém o layout antigo. Antes da pintura, para não piscar o antigo.
 */
export function useUniverseLayout(options: { initial?: UniverseLayoutConfig | null; live?: boolean } = {}) {
    const queryClient = useQueryClient()
    const live = options.live === true
    const hasInitial = options.initial !== undefined
    const initialKey = hasInitial ? JSON.stringify(options.initial) : null
    useLayoutEffect(() => {
        if (initialKey === null) return
        const fromServer = layoutDtoFrom(JSON.parse(initialKey) as UniverseLayoutConfig | null)
        const cached = queryClient.getQueryData<UniverseLayoutDto>(UNIVERSE_LAYOUT_QUERY_KEY)
        if (!cached || cached.isDefault !== fromServer.isDefault || JSON.stringify(cached.config) !== JSON.stringify(fromServer.config)) queryClient.setQueryData(UNIVERSE_LAYOUT_QUERY_KEY, fromServer)
    }, [initialKey, queryClient])
    useEffect(() => {
        if (!live) return
        return subscribeLive(ENGRAMIND_EVENTS_URL, {
            onEvent: (event) => {
                if (event.type === UNIVERSE_LAYOUT_LIVE_EVENT) void queryClient.invalidateQueries({ queryKey: UNIVERSE_LAYOUT_QUERY_KEY })
            },
            onReconnect: () => void queryClient.invalidateQueries({ queryKey: UNIVERSE_LAYOUT_QUERY_KEY }),
        })
    }, [live, queryClient])
    return useQuery({
        queryKey: UNIVERSE_LAYOUT_QUERY_KEY,
        queryFn: fetchLayout,
        ...(options.initial !== undefined ? { initialData: layoutDtoFrom(options.initial) } : {}),
        staleTime: 5 * 60_000,
        retry: 1,
    })
}

/** Erros por campo devolvidos pelo servidor (`details` do `UNIVERSE_LAYOUT_INVALID`), ou `null`. */
export function universeLayoutErrorsOf(error: unknown): UniverseLayoutIssue[] | null {
    if (!axios.isAxiosError(error)) return null
    const details = (error.response?.data as { details?: unknown } | undefined)?.details
    if (!Array.isArray(details)) return null
    const issues = details.filter((item): item is UniverseLayoutIssue => typeof item === "object" && item !== null && typeof (item as UniverseLayoutIssue).message === "string")
    return issues.length > 0 ? issues.map((issue) => ({ path: typeof issue.path === "string" ? issue.path : "", message: issue.message })) : null
}

function useLayoutMutation<I>(run: (input: I) => Promise<UniverseLayoutDto>, success: string, toastErrors: boolean) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: run,
        onSuccess: (data) => {
            queryClient.setQueryData(UNIVERSE_LAYOUT_QUERY_KEY, data)
            toast.success(success)
        },
        onError: (error) => {
            if (toastErrors || !universeLayoutErrorsOf(error)) toast.error(apiErrorMessage(error))
        },
    })
}

/** Grava a configuração importada (o servidor recusa campo desconhecido ou fora do intervalo, sem gravar nada). */
export const useSaveUniverseLayout = () =>
    useLayoutMutation((config: UniverseLayoutConfig) => api.put<ApiResponse<UniverseLayoutDto>>(UNIVERSE_LAYOUT_ROUTE, config).then((response) => unwrapApi(response.data)), "Visualização importada e aplicada", false)

/** Volta ao padrão (apaga a configuração gravada). */
export const useResetUniverseLayout = () => useLayoutMutation((_: void) => api.delete<ApiResponse<UniverseLayoutDto>>(UNIVERSE_LAYOUT_ROUTE).then((response) => unwrapApi(response.data)), "Visualização restaurada ao padrão", true)
