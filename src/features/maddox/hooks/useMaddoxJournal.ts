"use client"

import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { useDebounce } from "@/core/hooks/useDebounce"
import type { MaddoxCampaignMemoryKind, MaddoxQuestStatus } from "../constants"
import type { MaddoxGameMessagesPageDto } from "../game-types"
import { MADDOX_JOURNAL_QUERY_MIN, type MaddoxJournalImageKind } from "../journal-schemas"
import type { MaddoxJournalImageDto, MaddoxJournalMemoryDto, MaddoxJournalNpcDto, MaddoxJournalPageDto, MaddoxJournalPartyMemberDto, MaddoxJournalSearchDto, MaddoxJournalSummaryDto } from "../journal-types"
import { MADDOX_CAMPAIGNS_KEY } from "./useMaddoxCampaigns"

/**
 * Diário da campanha (Maddox 9). As chaves ficam sob `MADDOX_CAMPAIGNS_KEY`: o `maddox.game.changed` que a mesa e o
 * diário já escutam (`useMaddoxGameRealtime`) invalida tudo de uma vez.
 */
export const maddoxJournalKey = (campaignId: string) => [...MADDOX_CAMPAIGNS_KEY, "journal", campaignId] as const

const journalPath = (campaignId: string) => `/maddox/campaigns/${campaignId}/journal`

/** Espera da busca enquanto a pessoa digita. */
export const MADDOX_JOURNAL_SEARCH_DEBOUNCE_MS = 300

/** Resumo do Diário (também a "Situação atual" da página da campanha, que só busca com o cenário pronto: `enabled`). */
export function useMaddoxJournalSummary(campaignId: string, enabled = true) {
    return useQuery({
        queryKey: [...maddoxJournalKey(campaignId), "summary"],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxJournalSummaryDto>>(journalPath(campaignId))).data),
        retry: false,
        enabled,
    })
}

export function useMaddoxJournalNpcs(campaignId: string, enabled = true) {
    return useInfiniteQuery({
        queryKey: [...maddoxJournalKey(campaignId), "npcs"],
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }) => unwrapApi((await api.get<ApiResponse<MaddoxJournalPageDto<MaddoxJournalNpcDto>>>(`${journalPath(campaignId)}/npcs`, { params: pageParam ? { cursor: pageParam } : {} })).data),
        getNextPageParam: (last) => last.nextCursor,
        enabled,
    })
}

export function useMaddoxJournalMemories(campaignId: string, kind: MaddoxCampaignMemoryKind, status: MaddoxQuestStatus | null = null, enabled = true) {
    return useInfiniteQuery({
        queryKey: [...maddoxJournalKey(campaignId), "memories", kind, status],
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }) =>
            unwrapApi(
                (
                    await api.get<ApiResponse<MaddoxJournalPageDto<MaddoxJournalMemoryDto>>>(`${journalPath(campaignId)}/memories`, {
                        params: { kind, ...(status ? { status } : {}), ...(pageParam ? { cursor: pageParam } : {}) },
                    })
                ).data,
            ),
        getNextPageParam: (last) => last.nextCursor,
        enabled,
    })
}

export function useMaddoxJournalParty(campaignId: string, enabled = true) {
    return useQuery({
        queryKey: [...maddoxJournalKey(campaignId), "party"],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxJournalPartyMemberDto[]>>(`${journalPath(campaignId)}/party`)).data),
        enabled,
    })
}

/** Imagens prontas da campanha (aba Imagens, DND-22), da mais recente para a mais antiga, com filtro cenas/retratos. */
export function useMaddoxJournalImages(campaignId: string, kind: MaddoxJournalImageKind = "todas", enabled = true) {
    return useInfiniteQuery({
        queryKey: [...maddoxJournalKey(campaignId), "images", kind],
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }) =>
            unwrapApi(
                (
                    await api.get<ApiResponse<MaddoxJournalPageDto<MaddoxJournalImageDto>>>(`${journalPath(campaignId)}/images`, {
                        params: { ...(kind !== "todas" ? { kind } : {}), ...(pageParam ? { cursor: pageParam } : {}) },
                    })
                ).data,
            ),
        getNextPageParam: (last) => last.nextCursor,
        enabled,
    })
}

/** Histórico da mesa: a página mais recente e as anteriores pelo cursor (`…/game/messages?before=`). */
export function useMaddoxJournalHistory(campaignId: string, enabled = true) {
    return useInfiniteQuery({
        queryKey: [...maddoxJournalKey(campaignId), "history"],
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }) =>
            unwrapApi((await api.get<ApiResponse<MaddoxGameMessagesPageDto>>(`/maddox/campaigns/${campaignId}/game/messages`, { params: pageParam ? { before: pageParam } : {} })).data),
        getNextPageParam: (last) => (last.hasMore && last.messages[0] ? last.messages[0].id : null),
        enabled,
    })
}

/** Busca com espera: só consulta com o termo mínimo (o servidor recusa o resto com 400). */
export function useMaddoxJournalSearch(campaignId: string, term: string) {
    const query = useDebounce(term.trim(), MADDOX_JOURNAL_SEARCH_DEBOUNCE_MS)
    const ready = query.length >= MADDOX_JOURNAL_QUERY_MIN
    const search = useQuery({
        queryKey: [...maddoxJournalKey(campaignId), "search", query],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxJournalSearchDto>>(`${journalPath(campaignId)}/search`, { params: { q: query } })).data),
        enabled: ready,
        retry: false,
        staleTime: 15_000,
    })
    return { ...search, query, ready, pending: term.trim() !== query }
}
