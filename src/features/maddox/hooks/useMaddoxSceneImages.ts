"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { MaddoxGameSceneImageDto } from "../game-types"
import { MADDOX_CAMPAIGNS_KEY } from "./useMaddoxCampaigns"

/**
 * Pedidos do dono nas imagens das cenas (Maddox 10): "Gerar imagem da cena" e "Gerar retrato" de NPC. A imagem é pintada
 * em segundo plano; a mesa recarrega agora (placeholder) e de novo quando o servidor avisa que ficou pronta.
 */
export function useRequestMaddoxSceneImage(campaignId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<MaddoxGameSceneImageDto>>(`/maddox/campaigns/${campaignId}/scene-images`)).data),
        onSuccess: () => {
            toast.success("O Maddox está pintando a cena")
            void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível pedir a imagem da cena")),
    })
}

export function useRequestMaddoxNpcPortrait(campaignId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (npcId: string) => unwrapApi((await api.post<ApiResponse<{ npcId: string; status: "pending" }>>(`/maddox/campaigns/${campaignId}/npcs/${npcId}/portrait`)).data),
        onSuccess: () => {
            toast.success("O Maddox está pintando o retrato")
            void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível pedir o retrato")),
    })
}
