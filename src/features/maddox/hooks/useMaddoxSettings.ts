"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { MADDOX_FEATURE, MADDOX_SCRIPT_KIND_LABELS, type MaddoxScriptKind } from "../constants"
import type { MaddoxSettings, SaveMaddoxScriptInput } from "../schemas"
import type { MaddoxGeneratedAvatarDto, MaddoxOpencodeSessionDto, MaddoxScriptStateDto, MaddoxScriptVersionDto, MaddoxSettingsDto } from "../types"

const BASE = `/ai/features/${MADDOX_FEATURE}`

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
export const MADDOX_SETTINGS_KEY = [AI_QUERY_KEY, "feature", MADDOX_FEATURE] as const
export const MADDOX_SESSIONS_KEY = [AI_QUERY_KEY, "feature", MADDOX_FEATURE, "opencode-sessions"] as const

export const useMaddoxSettings = () =>
    useQuery({
        queryKey: MADDOX_SETTINGS_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxSettingsDto>>(BASE)).data),
    })

export function useSaveMaddoxSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: MaddoxSettings) => unwrapApi((await api.put<ApiResponse<MaddoxSettingsDto>>(BASE, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(MADDOX_SETTINGS_KEY, saved)
            toast.success('Configuração do "Agente Maddox" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

/** Uma versão do roteiro (diálogo "Roteiro vN"); `null` não busca. */
export const useMaddoxScriptVersion = (kind: MaddoxScriptKind, version: number | null) =>
    useQuery({
        queryKey: [...MADDOX_SETTINGS_KEY, "script", kind, version],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxScriptVersionDto>>(`${BASE}/scripts/${kind}`, { params: { version } })).data),
        enabled: version !== null,
    })

export function useSaveMaddoxScript(kind: MaddoxScriptKind) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: SaveMaddoxScriptInput) => unwrapApi((await api.put<ApiResponse<MaddoxScriptStateDto>>(`${BASE}/scripts/${kind}`, input)).data),
        onSuccess: (state) => {
            queryClient.setQueryData<MaddoxSettingsDto>(MADDOX_SETTINGS_KEY, (old) => (old ? { ...old, scripts: { ...old.scripts, [kind]: state } } : old))
            toast.success(`${MADDOX_SCRIPT_KIND_LABELS[kind]}: roteiro salvo (versão ${state.current.version})`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o roteiro")),
    })
}

export function useGenerateMaddoxAvatar() {
    return useMutation({
        mutationFn: async (persona: string) => unwrapApi((await api.post<ApiResponse<MaddoxGeneratedAvatarDto>>(`${BASE}/avatar`, { persona })).data),
        onSuccess: () => toast.success("Avatar gerado: salve para aplicar"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar o avatar")),
    })
}

export const useMaddoxSessions = () =>
    useQuery({
        queryKey: MADDOX_SESSIONS_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxOpencodeSessionDto[]>>(`${BASE}/opencode-sessions`)).data),
    })

export function useDeleteMaddoxSession() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ deleted: boolean }>>(`${BASE}/opencode-sessions/${id}`)).data),
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: MADDOX_SESSIONS_KEY })
            if (result.deleted) toast.success("Sessão excluída do OpenCode")
            else toast.warning("O OpenCode não respondeu: a exclusão ficou pendente e será retomada pela rotina")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir a sessão")),
    })
}
