"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxGameStateDto } from "../game-types"
import { maddoxGameKey } from "./useMaddoxGame"
import { MADDOX_CAMPAIGNS_KEY } from "./useMaddoxCampaigns"

/** Ações do balão do descanso (DND-58): dados de vida, trocas e, para o dono, a preparação que falhou. */

const restPath = (campaignId: string, restId: string, characterId: string) => `/maddox/campaigns/${campaignId}/game/rests/${restId}/characters/${characterId}`

export interface RestTarget {
    restId: string
    characterId: string
}

export function useMaddoxRest(campaignId: string) {
    const queryClient = useQueryClient()
    const setState = (state: MaddoxGameStateDto) => queryClient.setQueryData(maddoxGameKey(campaignId), state)
    const fail = (fallback: string) => (error: unknown) => {
        toast.error(apiErrorMessage(error, fallback))
        void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
    }
    const post = async <T>(target: RestTarget, path: string, body: Record<string, unknown> = {}) => unwrapApi((await api.post<ApiResponse<T>>(`${restPath(campaignId, target.restId, target.characterId)}/${path}`, body)).data)

    const roll = useMutation({
        mutationFn: (target: RestTarget) => post<{ roll: DiceRollResponse; state: MaddoxGameStateDto }>(target, "hit-dice/roll"),
        // A mesa nova só entra depois da animação (o painel segura o dado): aqui só o resultado volta ao painel.
        onSuccess: (result) => setState(result.state),
        onError: fail("Não foi possível rolar o dado de vida"),
    })
    const decline = useMutation({ mutationFn: (target: RestTarget) => post<MaddoxGameStateDto>(target, "hit-dice/decline"), onSuccess: setState, onError: fail("Não foi possível encerrar os dados de vida") })
    const exchange = useMutation({ mutationFn: (input: RestTarget & { text: string }) => post<MaddoxGameStateDto>(input, "exchange", { text: input.text }), onSuccess: setState, onError: fail("Não foi possível enviar o pedido de troca") })
    const finish = useMutation({ mutationFn: (input: RestTarget & { nothing: boolean }) => post<MaddoxGameStateDto>(input, "exchange/finish", { nothing: input.nothing }), onSuccess: setState, onError: fail("Não foi possível concluir as trocas") })
    const retry = useMutation({ mutationFn: (target: RestTarget) => post<MaddoxGameStateDto>(target, "prep/retry"), onSuccess: setState, onError: fail("Não foi possível tentar de novo") })
    const skip = useMutation({ mutationFn: (target: RestTarget) => post<MaddoxGameStateDto>(target, "prep/skip"), onSuccess: setState, onError: fail("Não foi possível seguir sem o catálogo") })
    return { roll, decline, exchange, finish, retry, skip, busy: decline.isPending || exchange.isPending || finish.isPending || retry.isPending || skip.isPending }
}
