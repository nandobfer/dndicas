"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { integrationChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { ENGRAMIND_INTEGRATION_ID, ENGRAMIND_UPDATED_EVENT, UNIVERSE_LAYOUT_EVENT_TYPE } from "../constants"
import type { CuratorRunInput, MigrationBulkInput, MigrationItemPatch } from "../schemas/migration"
import type { BootstrapDto, CampaignSyncDto, EngramindConnectionDto, MemoryMigrationDto } from "../types"

/** Consultas e mutações da integração Engramind (abas Conexão, Migração e Sincronização; Visualização em `useUniverseLayout`). */

export const ENGRAMIND_QUERY_KEY = "engramind-integration"
const key = (...parts: unknown[]) => [ENGRAMIND_QUERY_KEY, ...parts] as const
const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)
const send = async <T,>(method: "post" | "patch", path: string, body?: unknown) => unwrapApi((await api[method]<ApiResponse<T>>(path, body ?? {})).data)

export const useEngramindConnection = () => useQuery({ queryKey: key("connection"), queryFn: () => get<EngramindConnectionDto>("/engramind/connection") })
export const useEngramindMigration = () => useQuery({ queryKey: key("migration"), queryFn: () => get<MemoryMigrationDto>("/engramind/migration") })
export const useEngramindSync = () => useQuery({ queryKey: key("sync"), queryFn: () => get<CampaignSyncDto>("/engramind/sync") })

/** Mutação com toast de erro em pt-BR e a resposta gravada no cache da consulta. */
function useEngramindMutation<I, O>(target: "connection" | "migration" | "sync", run: (input: I) => Promise<O>, success?: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: run,
        onSuccess: (data) => {
            if (target === "migration" || target === "sync") queryClient.setQueryData(key(target), data)
            void queryClient.invalidateQueries({ queryKey: key(target) })
            if (success) toast.success(success)
        },
        onError: (error) => toast.error(apiErrorMessage(error)),
    })
}

export const useEngramindBootstrap = () => useEngramindMutation<void, BootstrapDto>("connection", () => send<BootstrapDto>("post", "/engramind/connection/bootstrap"))
export const useSyncNow = () => useEngramindMutation<void, CampaignSyncDto>("sync", () => send<CampaignSyncDto>("post", "/engramind/sync"), "Sincronização concluída")
export const useMigrationBackup = () => useEngramindMutation<void, MemoryMigrationDto>("migration", () => send("post", "/engramind/migration/backup"), "Backup gerado")
export const useMigrationCurator = () => useEngramindMutation<CuratorRunInput, MemoryMigrationDto>("migration", (input) => send("post", "/engramind/migration/triage", input))
export const useMigrationCompact = () => useEngramindMutation<string, MemoryMigrationDto>("migration", (combination) => send("post", "/engramind/migration/compact", { combination }))
export const useMigrationReview = () => useEngramindMutation<MigrationItemPatch, MemoryMigrationDto>("migration", (input) => send("patch", "/engramind/migration/items", input))
export const useMigrationBulk = () => useEngramindMutation<MigrationBulkInput, MemoryMigrationDto>("migration", (input) => send("post", "/engramind/migration/review/bulk", input))
export const useMigrationImport = () => useEngramindMutation<void, MemoryMigrationDto>("migration", () => send("post", "/engramind/migration/import", { confirm: true }))
export const useDiscardPendingWrite = () =>
    useEngramindMutation<string, CampaignSyncDto>("sync", async (id) => unwrapApi((await api.delete<ApiResponse<CampaignSyncDto>>("/engramind/sync", { data: { id } })).data), "Gravação descartada")
export const useMigrationHistory = () => useEngramindMutation<void, MemoryMigrationDto>("migration", () => send("post", "/engramind/migration/campaigns", { confirm: true }))

/** Tempo real da integração (`engramind-updated` em `private-integration-engramind`): relê a área avisada. */
export function useEngramindRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = integrationChannel(ENGRAMIND_INTEGRATION_ID)
        const channel = acquireChannel(name)
        const handler = (payload: { type?: string } | undefined) => {
            const type = payload?.type ?? ""
            if (type.startsWith("migration")) void queryClient.invalidateQueries({ queryKey: key("migration") })
            else if (type.startsWith("sync")) void queryClient.invalidateQueries({ queryKey: key("sync") })
            else if (type === UNIVERSE_LAYOUT_EVENT_TYPE) void queryClient.invalidateQueries({ queryKey: key("universe-layout") })
            else void queryClient.invalidateQueries({ queryKey: key() })
        }
        channel.bind(ENGRAMIND_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(ENGRAMIND_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
