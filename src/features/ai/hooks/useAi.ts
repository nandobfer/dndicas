"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AI_PROVIDERS, type AiImageProviderId, type AiProviderId, type AiProviderStatusDto } from "@/lib/ai/providers"
import type { IntegrationListItemDto } from "@/features/integrations/types"
import { useIntegrations } from "@/features/integrations/hooks/useIntegrations"
import { AI_FEATURE_UPDATED_EVENT, ENTITY_IMPORT_FEATURE, ENTITY_UNDERSTANDING_FEATURE, IMAGE_GENERATOR_FEATURE } from "../constants"
import type { EntityImportSettings, EntityUnderstandingSettings, ImageGeneratorSettings } from "../schemas"
import type { AiAgentDto, AiModelDto, EntityImportSettingsDto, EntityUnderstandingSettingsDto, ImageGeneratorSettingsDto } from "../types"

/** Consultas e mutações dos provedores e features de IA. */

export const AI_QUERY_KEY = "ai"
const key = (...parts: unknown[]) => [AI_QUERY_KEY, ...parts] as const
const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

/** Situação dos provedores de texto, derivada da lista de integrações (status ao vivo). Com
 * `includeAll`, inclui também o JEV (decisão estruturada). */
export function toProviderStatuses(integrations: readonly IntegrationListItemDto[], includeAll = false): AiProviderStatusDto[] {
    return AI_PROVIDERS.filter((provider) => includeAll || provider.supportsTextGeneration).map((provider) => {
        const item = integrations.find((integration) => integration.id === provider.integrationId)
        const configured = item?.configured === true
        return {
            id: provider.id,
            integrationId: provider.integrationId,
            name: provider.name,
            configured,
            connected: configured && (item?.health.status === "ok" || item?.health.status === "warn"),
        }
    })
}

export function useAiProviderStatuses(includeAll = false) {
    const query = useIntegrations()
    return { ...query, providers: toProviderStatuses(query.data ?? [], includeAll) }
}

export const useAiModels = (provider: AiProviderId | null, enabled = true) =>
    useQuery({ queryKey: key("models", provider), queryFn: () => get<AiModelDto[]>(`/ai/providers/${provider}/models`), enabled: enabled && provider !== null, staleTime: 2 * 60_000, retry: false })

/** Recarrega a lista ignorando o cache do servidor. */
export function useRefreshAiModels(provider: AiProviderId) {
    const queryClient = useQueryClient()
    return () =>
        queryClient
            .fetchQuery({ queryKey: key("models", provider), queryFn: () => get<AiModelDto[]>(`/ai/providers/${provider}/models?refresh=1`) })
            .catch((error: unknown) => toast.error(apiErrorMessage(error, "Não foi possível atualizar os modelos")))
}

export const useAiAgents = (enabled: boolean) => useQuery({ queryKey: key("agents"), queryFn: () => get<AiAgentDto[]>("/ai/agents"), enabled, staleTime: 2 * 60_000, retry: false })

/** Modelos de IMAGEM do provedor (Gemini e OpenAI) — agente "Gerador de imagens". */
export const useAiImageModels = (provider: AiImageProviderId | null, enabled = true) =>
    useQuery({ queryKey: key("image-models", provider), queryFn: () => get<AiModelDto[]>(`/ai/providers/${provider}/image-models`), enabled: enabled && provider !== null, staleTime: 2 * 60_000, retry: false })

/** Configuração e mutação de uma feature (`/ai/features/{feature}`), com o toast pt-BR do nome dela. */
function featureHooks<T, Dto extends { settings: T }>(feature: string, label: string) {
    const useSettings = () => useQuery({ queryKey: key("feature", feature), queryFn: () => get<Dto>(`/ai/features/${feature}`) })
    function useSave() {
        const queryClient = useQueryClient()
        return useMutation({
            mutationFn: async (input: T) => unwrapApi((await api.put<ApiResponse<Dto>>(`/ai/features/${feature}`, input)).data),
            onSuccess: (saved) => {
                queryClient.setQueryData(key("feature", feature), saved)
                toast.success(`Configuração de "${label}" salva`)
            },
            onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
        })
    }
    return { useSettings, useSave }
}

const imageGenerator = featureHooks<ImageGeneratorSettings, ImageGeneratorSettingsDto>(IMAGE_GENERATOR_FEATURE, "Gerador de imagens")
export const useImageGeneratorSettings = imageGenerator.useSettings
export const useSaveImageGeneratorSettings = imageGenerator.useSave

const entityUnderstanding = featureHooks<EntityUnderstandingSettings, EntityUnderstandingSettingsDto>(ENTITY_UNDERSTANDING_FEATURE, "Entender com IA")
export const useEntityUnderstandingSettings = entityUnderstanding.useSettings
export const useSaveEntityUnderstandingSettings = entityUnderstanding.useSave

const entityImport = featureHooks<EntityImportSettings, EntityImportSettingsDto>(ENTITY_IMPORT_FEATURE, "Importador 5etools")
export const useEntityImportSettings = entityImport.useSettings
export const useSaveEntityImportSettings = entityImport.useSave

/** Configuração de feature alterada (em outra aba/janela): recarrega. */
export function useAiFeatureRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: key("feature") })
        channel.bind(AI_FEATURE_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(AI_FEATURE_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
