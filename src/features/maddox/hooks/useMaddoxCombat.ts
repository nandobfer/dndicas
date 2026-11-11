"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxCombatActionInput, MaddoxCombatAdjustmentInput, MaddoxEndCombatTurnInput } from "../combat-schemas"
import type { MaddoxGameStateDto } from "../game-types"
import { MADDOX_CAMPAIGNS_KEY } from "./useMaddoxCampaigns"
import { maddoxGameKey } from "./useMaddoxGame"

/**
 * Combate tático (Maddox 7) na mesa: Ação/Ação bônus da minha vez, cancelar, encerrar a vez, rolar os passos da ação e as
 * rolagens avulsas (iniciativa, teste contra a morte, concentração, salvaguarda, dano pedido) e escolher a reação. Cada
 * resposta traz a mesa atualizada, que entra no cache.
 */

const combatPath = (campaignId: string) => `/maddox/campaigns/${campaignId}/game/combat`

export interface MaddoxCombatRollResult {
    roll: DiceRollResponse
    state: MaddoxGameStateDto
}

function useCombatMutation<TInput, TResult extends MaddoxGameStateDto | MaddoxCombatRollResult>(campaignId: string, request: (input: TInput) => Promise<TResult>, fallback: string, toastOnError = true) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: request,
        onSuccess: (result) => {
            queryClient.setQueryData(maddoxGameKey(campaignId), "state" in result ? result.state : result)
        },
        onError: (error) => {
            if (toastOnError) toast.error(apiErrorMessage(error, fallback))
            void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })
        },
    })
}

/** Ação ou Ação bônus (o erro `ACTION_INVALID` da "Outra ação" fica para a tela mostrar no próprio menu). */
export const useSubmitCombatAction = (campaignId: string) =>
    useCombatMutation<MaddoxCombatActionInput, MaddoxGameStateDto>(campaignId, async (input) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${combatPath(campaignId)}/actions`, input)).data), "Não foi possível agir", false)

export const useCancelCombatAction = (campaignId: string) =>
    useCombatMutation<string, MaddoxGameStateDto>(campaignId, async (actionId) => unwrapApi((await api.delete<ApiResponse<MaddoxGameStateDto>>(`${combatPath(campaignId)}/actions/${actionId}`)).data), "Não foi possível cancelar a ação")

/** DND-49: depois do acerto, soma (ou não) o ataque furtivo ao dano. */
export const useChooseSneakAttack = (campaignId: string) =>
    useCombatMutation<{ id: string; add: boolean }, MaddoxGameStateDto>(campaignId, async ({ id, add }) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${combatPath(campaignId)}/actions/${id}/sneak`, { add })).data), "Não foi possível escolher o ataque furtivo")

export const useEndCombatTurn = (campaignId: string) =>
    useCombatMutation<MaddoxEndCombatTurnInput, MaddoxGameStateDto>(campaignId, async (input) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${combatPath(campaignId)}/end-turn`, input)).data), "Não foi possível encerrar a vez")

/** Rola o próximo passo da ação (`actionId`) ou a rolagem avulsa (`rollId`). */
export const useRollCombatStep = (campaignId: string) =>
    useCombatMutation<{ kind: "action" | "roll"; id: string }, MaddoxCombatRollResult>(
        campaignId,
        async ({ kind, id }) => unwrapApi((await api.post<ApiResponse<MaddoxCombatRollResult>>(kind === "action" ? `${combatPath(campaignId)}/actions/${id}/roll` : `${combatPath(campaignId)}/rolls/${id}/roll`, {})).data),
        "Não foi possível rolar",
    )

export const useDecideReaction = (campaignId: string) =>
    useCombatMutation<{ id: string; escolha: string }, MaddoxGameStateDto>(campaignId, async ({ id, escolha }) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${combatPath(campaignId)}/reactions/${id}`, { escolha })).data), "Não foi possível escolher a reação")

/** DND-41: decisão do dono da campanha sobre uma preparação da mesa que falhou. */
export const useRetryCombatPrep = (campaignId: string) =>
    useCombatMutation<string, MaddoxGameStateDto>(campaignId, async (prepId) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${combatPath(campaignId)}/preps/${prepId}/retry`, {})).data), "Não foi possível tentar de novo")

export const useSkipCombatPrep = (campaignId: string) =>
    useCombatMutation<string, MaddoxGameStateDto>(campaignId, async (prepId) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${combatPath(campaignId)}/preps/${prepId}/skip`, {})).data), "Não foi possível seguir sem a preparação")

/** DND-41: pedido de ajuste de uma opção (o resultado chega pela mesa atualizada). */
export const useRequestCombatAdjustment = (campaignId: string) =>
    useCombatMutation<MaddoxCombatAdjustmentInput, MaddoxGameStateDto>(campaignId, async (input) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${combatPath(campaignId)}/adjustments`, input)).data), "Não foi possível pedir o ajuste")
