"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { maddoxUserChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { MADDOX_INTERVIEW_CHANGED_EVENT } from "../constants"
import type { MaddoxCampaignDetailDto } from "../campaign-types"
import type { MaddoxGameStateDto } from "../game-types"
import type { MaddoxOpexInterviewStateDto } from "../interview-types"
import type { AddMaddoxOpexInput, ApproveMaddoxOpexDraftInput } from "../opex-schemas"
import { MADDOX_CAMPAIGNS_KEY } from "./useMaddoxCampaigns"
import { maddoxGameKey } from "./useMaddoxGame"
import { INTERVIEW_GENERATING_REFETCH_MS, postInterviewStream } from "./useMaddoxInterview"

/** Personagens Opex (DND-26): adicionar, acompanhar a entrevista, aprovar respostas e destravar a mesa. */

const BASE = "/maddox/campaigns"
const opexInterviewKey = (campaignId: string, memberId: string) => [...MADDOX_CAMPAIGNS_KEY, "opex-interview", campaignId, memberId] as const

export function useAddMaddoxOpex(campaignId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: AddMaddoxOpexInput) => unwrapApi((await api.post<ApiResponse<MaddoxCampaignDetailDto>>(`${BASE}/${campaignId}/opex`, input)).data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
            toast.success("Personagem Opex adicionado: a entrevista com o Maddox começou")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível adicionar o Personagem Opex")),
    })
}

/** "Tentar de novo" da entrevista e "Gerar retrato de novo" do Opex. */
export function useMaddoxOpexLobbyActions(campaignId: string) {
    const queryClient = useQueryClient()
    const refresh = () => void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
    const retryInterview = useMutation({
        mutationFn: async (memberId: string) => unwrapApi((await api.post<ApiResponse<MaddoxCampaignDetailDto>>(`${BASE}/${campaignId}/opex/${memberId}/interview/retry`, {})).data),
        onSuccess: () => {
            refresh()
            toast.success("A entrevista do Personagem Opex continua")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível retomar a entrevista")),
    })
    const retryPortrait = useMutation({
        mutationFn: async (memberId: string) => unwrapApi((await api.post<ApiResponse<MaddoxCampaignDetailDto>>(`${BASE}/${campaignId}/opex/${memberId}/portrait`, {})).data),
        onSuccess: () => {
            refresh()
            toast.success("O Maddox está pintando o retrato do Personagem Opex")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar o retrato")),
    })
    return { retryInterview, retryPortrait }
}

/** Falha do Opex na mesa: "Tentar de novo" ou "Pular" (só o dono). */
export function useMaddoxOpexTableActions(campaignId: string) {
    const queryClient = useQueryClient()
    const done = (state: MaddoxGameStateDto) => {
        queryClient.setQueryData(maddoxGameKey(campaignId), state)
        void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
    }
    const retry = useMutation({
        mutationFn: async (memberId: string) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${BASE}/${campaignId}/game/opex/${memberId}/retry`, {})).data),
        onSuccess: done,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível tentar de novo")),
    })
    const skip = useMutation({
        mutationFn: async (memberId: string) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${BASE}/${campaignId}/game/opex/${memberId}/skip`, {})).data),
        onSuccess: done,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível pular")),
    })
    return { retry, skip }
}

/** Entrevista do Personagem Opex vista pelo dono, em dia pelo canal dele (`maddox.interview.changed`). */
export function useMaddoxOpexInterview(campaignId: string, memberId: string, userId: string | null) {
    const queryClient = useQueryClient()
    const key = opexInterviewKey(campaignId, memberId)
    const query = useQuery({
        queryKey: key,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxOpexInterviewStateDto>>(`${BASE}/${campaignId}/opex/${memberId}/interview`)).data),
        // Enquanto o Opex ou o Maddox geram, a tela relê (o tempo real também avisa).
        refetchInterval: (current) => {
            const data = current.state.data
            return data && (data.interview?.generating || data.interview?.opexDraft?.status === "generating" || data.status === "interviewing") ? INTERVIEW_GENERATING_REFETCH_MS : false
        },
    })
    useEffect(() => {
        if (!userId || !isPusherClientAvailable()) return
        const channelName = maddoxUserChannel(userId)
        const channel = acquireChannel(channelName)
        if (!channel) return
        const onChanged = (payload: { campaignId?: string; memberId?: string }) => {
            if (payload?.campaignId === campaignId) void queryClient.invalidateQueries({ queryKey: key })
        }
        channel.bind(MADDOX_INTERVIEW_CHANGED_EVENT, onChanged)
        return () => {
            channel.unbind(MADDOX_INTERVIEW_CHANGED_EVENT, onChanged)
            releaseChannel(channelName)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, campaignId, memberId, queryClient])

    const [streamText, setStreamText] = useState<string | null>(null)
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: key })
        void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
    }
    const approve = useMutation({
        mutationFn: async (input: ApproveMaddoxOpexDraftInput) => {
            setStreamText("")
            return postInterviewStream(`${BASE}/${campaignId}/opex/${memberId}/interview/draft/approve`, input, (line) => {
                if (line.type === "delta") setStreamText((current) => `${current ?? ""}${line.text}`)
                if (line.type === "error") toast.error(line.message)
            })
        },
        onSettled: () => {
            setStreamText(null)
            refresh()
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível aprovar a resposta"),
    })
    const regenerate = useMutation({
        mutationFn: async (orientacao: string) => unwrapApi((await api.post<ApiResponse<MaddoxOpexInterviewStateDto>>(`${BASE}/${campaignId}/opex/${memberId}/interview/draft/regenerate`, { orientacao })).data),
        onSuccess: (data) => queryClient.setQueryData(key, data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível pedir outra resposta")),
    })
    const complete = useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<MaddoxCampaignDetailDto>>(`${BASE}/${campaignId}/opex/${memberId}/interview/complete`, {})).data),
        onSuccess: () => {
            refresh()
            toast.success("Entrevista do Personagem Opex concluída")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a entrevista")),
    })
    const retry = useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<MaddoxCampaignDetailDto>>(`${BASE}/${campaignId}/opex/${memberId}/interview/retry`, {})).data),
        onSuccess: refresh,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível retomar a entrevista")),
    })
    return { query, approve, regenerate, complete, retry, streamText }
}
