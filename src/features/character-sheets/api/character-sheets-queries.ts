"use client"

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
    fetchSheets,
    fetchSheet,
    fetchSheetBySlug,
    createSheet,
    patchSheet,
    deleteSheet,
    triggerLongRest,
    fetchItems,
    addItem,
    patchItem,
    removeItem,
    fetchSpells,
    addSpell,
    patchSpell,
    removeSpell,
    fetchTraits,
    addTrait,
    removeTrait,
    fetchFeats,
    addFeat,
    removeFeat,
    fetchAttacks,
    addAttack,
    patchAttack,
    removeAttack,
} from "./character-sheets-api"
import type {
    PatchSheetBody,
    CreateItemBody,
    PatchItemBody,
    CreateSpellBody,
    PatchSpellBody,
    CreateTraitBody,
    CreateFeatBody,
    CreateAttackBody,
    PatchAttackBody,
} from "../types/character-sheet.types"

export const sheetsKeys = {
    all: ["character-sheets"] as const,
    lists: () => [...sheetsKeys.all, "list"] as const,
    list: (params: { search?: string; limit?: number }) => [...sheetsKeys.lists(), params] as const,
    infinite: (params: { search?: string; limit?: number }) => [...sheetsKeys.all, "infinite", params] as const,
    details: () => [...sheetsKeys.all, "detail"] as const,
    detail: (id: string) => [...sheetsKeys.details(), id] as const,
    items: (sheetId: string) => [...sheetsKeys.all, "items", sheetId] as const,
    spells: (sheetId: string) => [...sheetsKeys.all, "spells", sheetId] as const,
    traits: (sheetId: string) => [...sheetsKeys.all, "traits", sheetId] as const,
    feats: (sheetId: string) => [...sheetsKeys.all, "feats", sheetId] as const,
    attacks: (sheetId: string) => [...sheetsKeys.all, "attacks", sheetId] as const,
}

// ─── List ─────────────────────────────────────────────────────────────────────

export function useInfiniteSheets(search?: string, limit = 12) {
    return useInfiniteQuery({
        queryKey: sheetsKeys.infinite({ search, limit }),
        queryFn: ({ pageParam = 1 }) => fetchSheets({ page: pageParam as number, limit, search }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.hasNextPage ? lastPage.page + 1 : undefined,
        staleTime: 30 * 1000,
    })
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export function useSheet(id: string | null) {
    return useQuery({
        queryKey: sheetsKeys.detail(id ?? ""),
        queryFn: () => fetchSheet(id!),
        enabled: !!id,
        staleTime: 60 * 1000,
    })
}

export function useSheetBySlug(slug: string | null) {
    return useQuery({
        queryKey: [...sheetsKeys.details(), "slug", slug ?? ""],
        queryFn: () => fetchSheetBySlug(slug!),
        enabled: !!slug,
        staleTime: 60 * 1000,
    })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateSheet() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createSheet,
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.lists() }),
    })
}

export function usePatchSheet(id: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: PatchSheetBody) => patchSheet(id, data),
        onSuccess: (updated) => {
            qc.setQueryData(sheetsKeys.detail(id), updated)
        },
    })
}

export function useDeleteSheet() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => deleteSheet(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.lists() }),
    })
}

export function useTriggerLongRest(id: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => triggerLongRest(id),
        onSuccess: (updated) => {
            qc.setQueryData(sheetsKeys.detail(id), updated)
        },
    })
}

// ─── Items ────────────────────────────────────────────────────────────────────

export function useItems(sheetId: string) {
    return useQuery({
        queryKey: sheetsKeys.items(sheetId),
        queryFn: () => fetchItems(sheetId),
        enabled: !!sheetId,
        staleTime: 60 * 1000,
    })
}

export function useAddItem(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateItemBody) => addItem(sheetId, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.items(sheetId) }),
    })
}

export function usePatchItem(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ itemId, data }: { itemId: string; data: PatchItemBody }) =>
            patchItem(sheetId, itemId, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.items(sheetId) }),
    })
}

export function useRemoveItem(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (itemId: string) => removeItem(sheetId, itemId),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.items(sheetId) }),
    })
}

// ─── Spells ───────────────────────────────────────────────────────────────────

export function useSheetSpells(sheetId: string) {
    return useQuery({
        queryKey: sheetsKeys.spells(sheetId),
        queryFn: () => fetchSpells(sheetId),
        enabled: !!sheetId,
        staleTime: 60 * 1000,
    })
}

export function useAddSpell(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateSpellBody) => addSpell(sheetId, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.spells(sheetId) }),
    })
}

export function usePatchSpell(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ spellId, data }: { spellId: string; data: PatchSpellBody }) =>
            patchSpell(sheetId, spellId, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.spells(sheetId) }),
    })
}

export function useRemoveSpell(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (spellId: string) => removeSpell(sheetId, spellId),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.spells(sheetId) }),
    })
}

// ─── Traits ───────────────────────────────────────────────────────────────────

export function useTraits(sheetId: string) {
    return useQuery({
        queryKey: sheetsKeys.traits(sheetId),
        queryFn: () => fetchTraits(sheetId),
        enabled: !!sheetId,
        staleTime: 60 * 1000,
    })
}

export function useAddTrait(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateTraitBody) => addTrait(sheetId, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.traits(sheetId) }),
    })
}

export function useRemoveTrait(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (traitId: string) => removeTrait(sheetId, traitId),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.traits(sheetId) }),
    })
}

// ─── Feats ────────────────────────────────────────────────────────────────────

export function useSheetFeats(sheetId: string) {
    return useQuery({
        queryKey: sheetsKeys.feats(sheetId),
        queryFn: () => fetchFeats(sheetId),
        enabled: !!sheetId,
        staleTime: 60 * 1000,
    })
}

export function useAddFeat(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateFeatBody) => addFeat(sheetId, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.feats(sheetId) }),
    })
}

export function useRemoveFeat(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (featId: string) => removeFeat(sheetId, featId),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.feats(sheetId) }),
    })
}

// ─── Attacks ──────────────────────────────────────────────────────────────────

export function useAttacks(sheetId: string) {
    return useQuery({
        queryKey: sheetsKeys.attacks(sheetId),
        queryFn: () => fetchAttacks(sheetId),
        enabled: !!sheetId,
        staleTime: 60 * 1000,
    })
}

export function useAddAttack(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateAttackBody) => addAttack(sheetId, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.attacks(sheetId) }),
    })
}

export function usePatchAttack(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ attackId, data }: { attackId: string; data: PatchAttackBody }) =>
            patchAttack(sheetId, attackId, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.attacks(sheetId) }),
    })
}

export function useRemoveAttack(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (attackId: string) => removeAttack(sheetId, attackId),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.attacks(sheetId) }),
    })
}
