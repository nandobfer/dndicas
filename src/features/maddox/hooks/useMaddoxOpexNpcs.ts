"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { MaddoxGameStateDto } from "../game-types"
import { MADDOX_CAMPAIGNS_KEY } from "./useMaddoxCampaigns"
import { maddoxGameKey } from "./useMaddoxGame"

/** NPCs Opex (DND-27): "Promover a NPC Opex" e "Remover Opex" do dono. Atualiza a mesa e o Diário. */
export function useMaddoxOpexNpcActions(campaignId: string) {
    const queryClient = useQueryClient()
    const done = (state: MaddoxGameStateDto) => {
        queryClient.setQueryData(maddoxGameKey(campaignId), state)
        void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
    }
    const promote = useMutation({
        mutationFn: async (npcId: string) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`/maddox/campaigns/${campaignId}/npcs/${npcId}/opex`, {})).data),
        onSuccess: done,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível promover o NPC")),
    })
    const remove = useMutation({
        mutationFn: async (npcId: string) => unwrapApi((await api.delete<ApiResponse<MaddoxGameStateDto>>(`/maddox/campaigns/${campaignId}/npcs/${npcId}/opex`)).data),
        onSuccess: done,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível remover o Opex do NPC")),
    })
    return { promote, remove }
}
