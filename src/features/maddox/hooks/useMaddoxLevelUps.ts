"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { MaddoxGameStateDto } from "../game-types"
import { maddoxGameKey } from "./useMaddoxGame"

/** "Tentar de novo" do dono na subida de nível do Personagem Opex que falhou (DND-56): devolve a mesa nova. */
export function useRetryOpexLevelUp(campaignId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (stepId: string) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`/maddox/campaigns/${campaignId}/game/level-ups/${stepId}/retry`, {})).data),
        onSuccess: (state) => queryClient.setQueryData(maddoxGameKey(campaignId), state),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível tentar de novo")),
    })
}
