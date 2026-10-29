"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import type { AxiosInstance } from "axios"
import { api, unwrapApi } from "@/lib/api"
import { opexChannel } from "@/lib/pusher/channel-names"
import type { ApiResponse } from "@/lib/types/api"
import { useAuth } from "@/core/hooks/useAuth"
import { OPEX_AI_TAB } from "../constants"
import { opexTabsStorageKey, type OpexRole } from "../scope"
import type { OpexStatusDto } from "../types"

/**
 * Escopo da interface do Agente Opex: quem está vendo (administrador, usuário ou visitante). A
 * situação vem de `GET /api/opex/status` (que também cria o cookie do visitante) e decide o canal do
 * Pusher (`private-opex-{u|a}-{id}`), a chave do cache e as abas guardadas no navegador — trocar de
 * conta (ou sair) troca tudo.
 */
export interface OpexUiScope {
    role: OpexRole
    /** Prefixo das rotas, a partir de `/api`. */
    apiBase: string
    http: AxiosInstance
    /** Canal privado do Pusher do dono das sessões (`null` enquanto a situação carrega). */
    channel: string | null
    /** Prefixo das chaves do TanStack Query. */
    queryPrefix: string
    tabsKey: string
    /** Onde configurar o agente (só administradores). */
    settingsHref: string | null
    status: OpexStatusDto | undefined
    statusLoading: boolean
}

export const OPEX_SETTINGS_PAGE_HREF = `/integracoes/ia?aba=${OPEX_AI_TAB}`

const OPEX_STATUS_KEY = ["opex-agent", "status"] as const

const DEFAULT_SCOPE: OpexUiScope = {
    role: "anonymous",
    apiBase: "/opex",
    http: api,
    channel: null,
    queryPrefix: "opex-agent",
    tabsKey: opexTabsStorageKey(null),
    settingsHref: null,
    status: undefined,
    statusLoading: true,
}

const OpexScopeContext = createContext<OpexUiScope>(DEFAULT_SCOPE)

export function OpexScopeProvider({ children }: { children: ReactNode }) {
    const { userId, isLoaded } = useAuth()
    const status = useQuery({
        queryKey: [...OPEX_STATUS_KEY, userId ?? "anonymous"],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexStatusDto>>("/opex/status")).data),
        enabled: isLoaded,
        staleTime: 30_000,
    })
    const value = useMemo<OpexUiScope>(() => {
        const data = status.data
        if (!data) return { ...DEFAULT_SCOPE, statusLoading: status.isLoading || !isLoaded }
        return {
            role: data.role,
            apiBase: "/opex",
            http: api,
            channel: opexChannel(data.ownerKey),
            queryPrefix: `opex-agent:${data.ownerKey}`,
            tabsKey: opexTabsStorageKey(data.ownerKey),
            settingsHref: data.role === "admin" ? OPEX_SETTINGS_PAGE_HREF : null,
            status: data,
            statusLoading: false,
        }
    }, [status.data, status.isLoading, isLoaded])
    return <OpexScopeContext.Provider value={value}>{children}</OpexScopeContext.Provider>
}

export function useOpexScope(): OpexUiScope {
    return useContext(OpexScopeContext)
}
