"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { PresenceChannel } from "pusher-js"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { maddoxCampaignPresenceChannel, maddoxUserChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { MADDOX_CAMPAIGN_CHANGED_EVENT, MADDOX_GAME_CHANGED_EVENT } from "../constants"
import { gameRefetchInterval, MADDOX_GAME_POLL_MS } from "../game-view"
import type { MaddoxGameActionInput } from "../game-schemas"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxGameMessagesPageDto, MaddoxGameStateDto } from "../game-types"
import type { MaddoxCampaignDetailDto } from "../campaign-types"
import { MADDOX_CAMPAIGNS_KEY } from "./useMaddoxCampaigns"

export const maddoxGameKey = (campaignId: string) => [...MADDOX_CAMPAIGNS_KEY, "game", campaignId] as const

const gamePath = (campaignId: string) => `/maddox/campaigns/${campaignId}/game`

export { MADDOX_GAME_POLL_MS }
/** Espera antes de pedir a reavaliação do turno depois que alguém sai da mesa (várias saídas = uma chamada). */
export const MADDOX_PRESENCE_CHECK_DEBOUNCE_MS = 1500

export function useMaddoxGame(campaignId: string) {
    const realtime = isPusherClientAvailable()
    return useQuery({
        queryKey: maddoxGameKey(campaignId),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxGameStateDto>>(gamePath(campaignId))).data),
        retry: false,
        refetchInterval: (query) => gameRefetchInterval(query.state.data, realtime),
    })
}

/** Mensagens anteriores às carregadas (paginação por cursor). */
export async function fetchOlderGameMessages(campaignId: string, before: string): Promise<MaddoxGameMessagesPageDto> {
    return unwrapApi((await api.get<ApiResponse<MaddoxGameMessagesPageDto>>(`${gamePath(campaignId)}/messages`, { params: { before } })).data)
}

export const refreshGame = (queryClient: QueryClient) => void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })

/**
 * Mesa em dia em todos os navegadores: o servidor avisa no canal do usuário (`maddox.game.changed` e
 * `maddox.campaign.changed`) e a tela recarrega. Cada nova assinatura (inclusive reconexão) recarrega.
 */
export function useMaddoxGameRealtime(userId: string | null) {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!userId || !isPusherClientAvailable()) return
        const name = maddoxUserChannel(userId)
        const channel = acquireChannel(name)
        const refresh = () => refreshGame(queryClient)
        channel.bind(MADDOX_GAME_CHANGED_EVENT, refresh)
        channel.bind(MADDOX_CAMPAIGN_CHANGED_EVENT, refresh)
        channel.bind("pusher:subscription_succeeded", refresh)
        return () => {
            channel.unbind(MADDOX_GAME_CHANGED_EVENT, refresh)
            channel.unbind(MADDOX_CAMPAIGN_CHANGED_EVENT, refresh)
            channel.unbind("pusher:subscription_succeeded", refresh)
            releaseChannel(name)
        }
    }, [queryClient, userId])
}

export interface MaddoxGamePresence {
    /** `false` = sem Pusher: a mesa considera todos os jogadores do turno. */
    available: boolean
    /** Usuários com a mesa aberta agora. */
    online: Set<string>
}

const membersOf = (channel: PresenceChannel) => {
    const ids = new Set<string>()
    channel.members?.each((member: { id: string }) => ids.add(String(member.id)))
    return ids
}

/**
 * Presença na mesa (`presence-maddox-c-{id}`): assinar já marca o usuário como presente. Quando alguém sai,
 * pede ao servidor que reavalie o turno (`…/game/check`) — o servidor consulta a presença por conta própria.
 */
export function useMaddoxGamePresence(campaignId: string, enabled: boolean): MaddoxGamePresence {
    const queryClient = useQueryClient()
    const available = isPusherClientAvailable()
    const [online, setOnline] = useState<Set<string>>(() => new Set())
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!enabled || !available) return
        const name = maddoxCampaignPresenceChannel(campaignId)
        const channel = acquireChannel(name) as PresenceChannel
        const sync = () => setOnline(membersOf(channel))
        const requestCheck = () => {
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => {
                timer.current = null
                void api
                    .post<ApiResponse<MaddoxGameStateDto>>(`${gamePath(campaignId)}/check`)
                    .then((res) => queryClient.setQueryData(maddoxGameKey(campaignId), unwrapApi(res.data)))
                    .catch(() => refreshGame(queryClient))
            }, MADDOX_PRESENCE_CHECK_DEBOUNCE_MS)
        }
        const removed = () => {
            sync()
            requestCheck()
        }
        channel.bind("pusher:subscription_succeeded", sync)
        channel.bind("pusher:member_added", sync)
        channel.bind("pusher:member_removed", removed)
        sync()
        return () => {
            if (timer.current) clearTimeout(timer.current)
            channel.unbind("pusher:subscription_succeeded", sync)
            channel.unbind("pusher:member_added", sync)
            channel.unbind("pusher:member_removed", removed)
            releaseChannel(name)
        }
    }, [available, campaignId, enabled, queryClient])

    return { available, online }
}

function useGameMutation<TInput>(campaignId: string, request: (input: TInput) => Promise<MaddoxGameStateDto>, fallback: string, success?: (input: TInput) => string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: request,
        onSuccess: (state, input) => {
            queryClient.setQueryData(maddoxGameKey(campaignId), state)
            void queryClient.invalidateQueries({ queryKey: [...MADDOX_CAMPAIGNS_KEY, "detail", campaignId] })
            const message = success?.(input)
            if (message) toast.success(message)
        },
        onError: (error) => {
            toast.error(apiErrorMessage(error, fallback))
            refreshGame(queryClient)
        },
    })
}

/** Declarar, perguntar ao mestre ou "Não fazer nada". */
export const useSendMaddoxGameAction = (campaignId: string) =>
    useGameMutation<MaddoxGameActionInput>(campaignId, async (input) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${gamePath(campaignId)}/actions`, input)).data), "Não foi possível enviar")

/** Dono pula a vez de um jogador ausente. */
export const useSkipMaddoxPlayer = (campaignId: string) =>
    useGameMutation<string>(campaignId, async (memberId) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${gamePath(campaignId)}/skip`, { memberId })).data), "Não foi possível pular o jogador", () => "Vez do jogador pulada")

/** Resultado da rolagem de um teste pedido pelo Maddox (Maddox 5): o resultado oficial e a mesa atualizada. */
export interface MaddoxCheckRollResult {
    roll: DiceRollResponse
    state: MaddoxGameStateDto
}

/** Rola o teste no servidor (o motor de dados e o modificador da ficha; o corpo vai vazio). */
export async function requestMaddoxCheckRoll(campaignId: string, checkId: string): Promise<MaddoxCheckRollResult> {
    return unwrapApi((await api.post<ApiResponse<MaddoxCheckRollResult>>(`${gamePath(campaignId)}/checks/${checkId}/roll`, {})).data)
}

/**
 * Rolar um teste: o jogador indicado (pelo painel de dados) ou o dono, no lugar dele. O estado da mesa volta junto e
 * entra no cache; erros viram aviso.
 */
export function useRollMaddoxCheck(campaignId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (checkId: string) => requestMaddoxCheckRoll(campaignId, checkId),
        onSuccess: (result) => {
            queryClient.setQueryData(maddoxGameKey(campaignId), result.state)
        },
        onError: (error) => {
            toast.error(apiErrorMessage(error, "Não foi possível rolar o teste"))
            refreshGame(queryClient)
        },
    })
}

/** Dono inicia a campanha (lobby → em andamento). */
export function useStartMaddoxCampaign(campaignId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`/maddox/campaigns/${campaignId}/start`)).data),
        onSuccess: (state) => {
            queryClient.setQueryData(maddoxGameKey(campaignId), state)
            queryClient.setQueryData<MaddoxCampaignDetailDto | undefined>([...MADDOX_CAMPAIGNS_KEY, "detail", campaignId], (current) => (current ? { ...current, status: "active" } : current))
            refreshGame(queryClient)
            toast.success("Campanha iniciada")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar a campanha")),
    })
}

/** Injetar Lembrança (DND-25): o texto vale para a próxima narração do Maddox; o estado da mesa volta junto. */
export function useInjectMaddoxReminder(campaignId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (texto: string) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${gamePath(campaignId)}/reminders`, { texto })).data),
        onSuccess: (state) => {
            queryClient.setQueryData(maddoxGameKey(campaignId), state)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar a lembrança")),
    })
}

/** Lista do menu "Turnos" (DND-44): só o dono; carregada quando o menu abre. */
export interface MaddoxRewindTurnsDto {
    turns: { turnNumber: number; excerpt: string }[]
    undoTarget: number | null
    originTurn: number
    atTurn: number
}

export function useMaddoxRewindTurns(campaignId: string, enabled: boolean) {
    return useQuery({
        queryKey: [...maddoxGameKey(campaignId), "rewind-turns"],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxRewindTurnsDto>>(`${gamePath(campaignId)}/rewind`)).data),
        enabled,
        staleTime: 0,
        retry: false,
    })
}

/** Dono leva a mesa ao turno X ("Desfazer turno" e "Voltar ao turno…"). */
export const useRewindMaddoxTurn = (campaignId: string) =>
    useGameMutation<number>(campaignId, async (turnNumber) => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${gamePath(campaignId)}/rewind`, { turnNumber })).data), "Não foi possível voltar a mesa", (turnNumber) => `A mesa voltou ao turno ${turnNumber}`)

/** Dono retoma o turno de origem ("Voltar ao turno atual (N)"). */
export const useResumeMaddoxTurn = (campaignId: string) =>
    useGameMutation<number>(campaignId, async () => unwrapApi((await api.post<ApiResponse<MaddoxGameStateDto>>(`${gamePath(campaignId)}/rewind/resume`, {})).data), "Não foi possível voltar ao turno atual", (origin) => `A mesa voltou ao turno ${origin}`)
