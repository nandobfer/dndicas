"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { maddoxUserChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { MADDOX_CAMPAIGN_CHANGED_EVENT, MADDOX_GAME_CHANGED_EVENT } from "../constants"
import type { CreateMaddoxCampaignInput, MaddoxCharacterDraftInput, UpdateMaddoxCampaignInput } from "../campaign-schemas"
import type { MaddoxCampaignDetailDto, MaddoxCampaignListItemDto, MaddoxInviteLinkDto, MaddoxInvitePreviewDto } from "../campaign-types"

const BASE = "/maddox/campaigns"

export const MADDOX_CAMPAIGNS_KEY = ["maddox", "campaigns"] as const
const campaignKey = (id: string) => [...MADDOX_CAMPAIGNS_KEY, "detail", id] as const
const inviteKey = (id: string) => [...MADDOX_CAMPAIGNS_KEY, "invite", id] as const

/** URL absoluta do link de convite (para copiar). */
export function maddoxInviteUrl(token: string): string {
    const origin = typeof window === "undefined" ? "" : window.location.origin
    return `${origin}/campanhas/convite/${token}`
}

/**
 * Mantém lista e campanha em dia: o servidor avisa no canal do usuário (`private-maddox-u-{id}`) quando
 * uma campanha da qual ele participa muda (entrada, saída, personagem, nome).
 */
export function useMaddoxCampaignsRealtime(userId: string | null) {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!userId || !isPusherClientAvailable()) return
        const name = maddoxUserChannel(userId)
        const channel = acquireChannel(name)
        const refresh = () => void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
        channel.bind(MADDOX_CAMPAIGN_CHANGED_EVENT, refresh)
        // A mesa (Maddox 3) também muda o lobby: início da campanha, número e fase do turno.
        channel.bind(MADDOX_GAME_CHANGED_EVENT, refresh)
        // Cada nova assinatura (inclusive reconexão) repõe os eventos que podem ter sido perdidos.
        channel.bind("pusher:subscription_succeeded", refresh)
        return () => {
            channel.unbind(MADDOX_CAMPAIGN_CHANGED_EVENT, refresh)
            channel.unbind(MADDOX_GAME_CHANGED_EVENT, refresh)
            channel.unbind("pusher:subscription_succeeded", refresh)
            releaseChannel(name)
        }
    }, [queryClient, userId])
}

export const useMaddoxCampaigns = () =>
    useQuery({
        queryKey: [...MADDOX_CAMPAIGNS_KEY, "list"],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxCampaignListItemDto[]>>(BASE)).data),
    })

export const useMaddoxCampaign = (id: string) =>
    useQuery({
        queryKey: campaignKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxCampaignDetailDto>>(`${BASE}/${id}`)).data),
        retry: false,
    })

export const useMaddoxInviteLink = (id: string, enabled: boolean) =>
    useQuery({
        queryKey: inviteKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxInviteLinkDto>>(`${BASE}/${id}/invite`)).data),
        enabled,
    })

export const useMaddoxInvitePreview = (token: string) =>
    useQuery({
        queryKey: [...MADDOX_CAMPAIGNS_KEY, "invite-preview", token],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxInvitePreviewDto>>(`${BASE}/invites/${token}`)).data),
        retry: false,
    })

export function useCreateMaddoxCampaign() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: CreateMaddoxCampaignInput) => unwrapApi((await api.post<ApiResponse<MaddoxCampaignDetailDto>>(BASE, input)).data),
        onSuccess: (campaign) => {
            queryClient.setQueryData(campaignKey(campaign.id), campaign)
            void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
            toast.success(`Campanha "${campaign.name}" criada`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar a campanha")),
    })
}

export function useUpdateMaddoxCampaign(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: UpdateMaddoxCampaignInput) => unwrapApi((await api.patch<ApiResponse<MaddoxCampaignDetailDto>>(`${BASE}/${id}`, input)).data),
        onSuccess: (campaign) => {
            queryClient.setQueryData(campaignKey(id), campaign)
            void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
            toast.success("Campanha atualizada")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível atualizar a campanha")),
    })
}

export function useRotateMaddoxInvite(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<MaddoxInviteLinkDto>>(`${BASE}/${id}/invite`)).data),
        onSuccess: (link) => {
            queryClient.setQueryData(inviteKey(id), link)
            toast.success("Novo link gerado. O link anterior não funciona mais.")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar outro link")),
    })
}

export function useJoinMaddoxCampaign(token: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<{ campaignId: string }>>(`${BASE}/invites/${token}`)).data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
            toast.success("Você entrou na campanha")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível entrar na campanha")),
    })
}

export function useRemoveMaddoxMember(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (memberId: string) => unwrapApi((await api.delete<ApiResponse<{ left: boolean }>>(`${BASE}/${id}/members/${memberId}`)).data),
        onSuccess: ({ left }) => {
            void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
            toast.success(left ? "Você saiu da campanha" : "Jogador removido da campanha")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir")),
    })
}

export function useSaveMaddoxCharacterDraft(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: MaddoxCharacterDraftInput) => unwrapApi((await api.put<ApiResponse<MaddoxCampaignDetailDto>>(`${BASE}/${id}/character`, input)).data),
        onSuccess: (campaign) => {
            queryClient.setQueryData(campaignKey(id), campaign)
            void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
            toast.success("Personagem salvo")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o personagem")),
    })
}
