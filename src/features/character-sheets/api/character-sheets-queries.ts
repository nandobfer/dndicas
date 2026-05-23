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
    CharacterAttack,
    CharacterItem,
    CharacterSpell,
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

const buildOptimisticId = (prefix: string) => `optimistic-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

interface OptimisticEntityOptions {
    onOptimisticCreate?: (optimisticId: string) => void
    onCreateSuccess?: (payload: { optimisticId: string; createdId: string }) => void
}

export const sheetsKeys = {
    all: ["character-sheets"] as const,
    lists: () => [...sheetsKeys.all, "list"] as const,
    list: (params: { search?: string; limit?: number }) => [...sheetsKeys.lists(), params] as const,
    infinite: (params: { search?: string; limit?: number }) => [...sheetsKeys.all, "infinite", params] as const,
    details: () => [...sheetsKeys.all, "detail"] as const,
    detail: (id: string) => [...sheetsKeys.details(), id] as const,
    bySlug: (slug: string) => [...sheetsKeys.details(), "slug", slug] as const,
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
        staleTime: 0,
        refetchOnWindowFocus: false,
    })
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export function useSheet(id: string | null) {
    return useQuery({
        queryKey: sheetsKeys.detail(id ?? ""),
        queryFn: () => fetchSheet(id!),
        enabled: !!id,
        staleTime: 0,
        refetchOnWindowFocus: false,
    })
}

export function useSheetBySlug(slug: string | null) {
    return useQuery({
        queryKey: sheetsKeys.bySlug(slug ?? ""),
        queryFn: () => fetchSheetBySlug(slug!),
        enabled: !!slug,
        staleTime: 0,
        refetchOnWindowFocus: false,
    })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateSheet() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (name?: string) => createSheet(name),
        onSuccess: () => qc.invalidateQueries({ queryKey: sheetsKeys.lists() }),
    })
}

export function usePatchSheet(id: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: PatchSheetBody) => patchSheet(id, data),
        onSuccess: (updated) => {
            qc.setQueryData(sheetsKeys.detail(id), updated)
            qc.invalidateQueries({ queryKey: sheetsKeys.details() })
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
    const qc = useQueryClient()
    return useQuery({
        queryKey: sheetsKeys.items(sheetId),
        queryFn: async () => {
            const fetchedItems = await fetchItems(sheetId)
            const currentItems = qc.getQueryData<CharacterItem[]>(sheetsKeys.items(sheetId)) ?? []
            const clientKeyById = new Map(currentItems.map((item) => [item._id, item.clientKey]).filter((entry): entry is [string, string] => !!entry[1]))
            return fetchedItems.map((item) => ({
                ...item,
                clientKey: clientKeyById.get(item._id) ?? item.clientKey,
            }))
        },
        enabled: !!sheetId,
        staleTime: 0,
        refetchOnWindowFocus: false,
    })
}

export function useAddItem(sheetId: string, options?: OptimisticEntityOptions) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateItemBody) => addItem(sheetId, data),
        onMutate: async (data) => {
            await qc.cancelQueries({ queryKey: sheetsKeys.items(sheetId) })
            const previousItems = qc.getQueryData<CharacterItem[]>(sheetsKeys.items(sheetId)) ?? []
            const optimisticId = buildOptimisticId("item")
            const optimisticItem: CharacterItem = {
                _id: optimisticId,
                clientKey: optimisticId,
                sheetId,
                catalogItemId: data.catalogItemId ?? null,
                name: data.name,
                image: data.image ?? null,
                quantity: data.quantity ?? 1,
                notes: data.notes ?? "",
                equipped: false,
                catalogItemType: null,
                catalogAc: null,
                catalogAcType: null,
                catalogArmorType: null,
                catalogAcBonus: null,
                createdAt: new Date().toISOString(),
            }

            qc.setQueryData<CharacterItem[]>(sheetsKeys.items(sheetId), [...previousItems, optimisticItem])
            options?.onOptimisticCreate?.(optimisticId)
            return { previousItems, optimisticId }
        },
        onError: (_error, _data, context) => {
            if (context?.previousItems) qc.setQueryData(sheetsKeys.items(sheetId), context.previousItems)
        },
        onSuccess: (created, _data, context) => {
            qc.setQueryData<CharacterItem[]>(sheetsKeys.items(sheetId), (current = []) =>
                current.map((item) => item._id === context?.optimisticId ? { ...created, clientKey: context.optimisticId } : item)
            )
            if (context?.optimisticId) options?.onCreateSuccess?.({ optimisticId: context.optimisticId, createdId: created._id })
        },
        onSettled: () => qc.invalidateQueries({ queryKey: sheetsKeys.items(sheetId) }),
    })
}

export function usePatchItem(sheetId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ itemId, data }: { itemId: string; data: PatchItemBody }) =>
            patchItem(sheetId, itemId, data),
        onMutate: async ({ itemId, data }) => {
            await qc.cancelQueries({ queryKey: sheetsKeys.items(sheetId) })
            const previousItems = qc.getQueryData<CharacterItem[]>(sheetsKeys.items(sheetId)) ?? []
            qc.setQueryData<CharacterItem[]>(sheetsKeys.items(sheetId), (current = []) =>
                current.map((item) => item._id === itemId ? { ...item, ...data } : item)
            )
            return { previousItems }
        },
        onError: (_error, _vars, context) => {
            if (context?.previousItems) qc.setQueryData(sheetsKeys.items(sheetId), context.previousItems)
        },
        onSuccess: (updated, variables) => {
            if (updated) {
                qc.setQueryData<CharacterItem[]>(sheetsKeys.items(sheetId), (current = []) =>
                    current.map((item) => item._id === variables.itemId ? { ...updated, _id: variables.itemId } : item)
                )
            }
        },
        onSettled: () => qc.invalidateQueries({ queryKey: sheetsKeys.items(sheetId) }),
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
    const qc = useQueryClient()
    return useQuery({
        queryKey: sheetsKeys.spells(sheetId),
        queryFn: async () => {
            const fetchedSpells = await fetchSpells(sheetId)
            const currentSpells = qc.getQueryData<CharacterSpell[]>(sheetsKeys.spells(sheetId)) ?? []
            const clientKeyById = new Map(currentSpells.map((spell) => [spell._id, spell.clientKey]).filter((entry): entry is [string, string] => !!entry[1]))
            return fetchedSpells.map((spell) => ({
                ...spell,
                clientKey: clientKeyById.get(spell._id) ?? spell.clientKey,
            }))
        },
        enabled: !!sheetId,
        staleTime: 0,
        refetchOnWindowFocus: false,
    })
}

export function useAddSpell(sheetId: string, options?: OptimisticEntityOptions) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateSpellBody) => addSpell(sheetId, data),
        onMutate: async (data) => {
            await qc.cancelQueries({ queryKey: sheetsKeys.spells(sheetId) })
            const previousSpells = qc.getQueryData<CharacterSpell[]>(sheetsKeys.spells(sheetId)) ?? []
            const optimisticId = buildOptimisticId("spell")
            const optimisticSpell: CharacterSpell = {
                _id: optimisticId,
                clientKey: optimisticId,
                sheetId,
                catalogSpellId: data.catalogSpellId ?? null,
                name: data.name,
                circle: data.circle ?? null,
                school: data.school ?? "",
                image: data.image ?? null,
                prepared: data.prepared ?? false,
                components: data.components ?? [],
                castingTime: data.castingTime ?? "",
                range: data.range ?? "",
                concentration: data.concentration ?? false,
                ritual: data.ritual ?? false,
                material: data.material ?? false,
                notes: data.notes ?? "",
                createdAt: new Date().toISOString(),
            }

            qc.setQueryData<CharacterSpell[]>(sheetsKeys.spells(sheetId), [...previousSpells, optimisticSpell])
            options?.onOptimisticCreate?.(optimisticId)
            return { previousSpells, optimisticId }
        },
        onError: (_error, _data, context) => {
            if (context?.previousSpells) qc.setQueryData(sheetsKeys.spells(sheetId), context.previousSpells)
        },
        onSuccess: (created, _data, context) => {
            qc.setQueryData<CharacterSpell[]>(sheetsKeys.spells(sheetId), (current = []) =>
                current.map((spell) => spell._id === context?.optimisticId ? { ...created, clientKey: context.optimisticId } : spell)
            )
            if (context?.optimisticId) options?.onCreateSuccess?.({ optimisticId: context.optimisticId, createdId: created._id })
        },
        onSettled: () => qc.invalidateQueries({ queryKey: sheetsKeys.spells(sheetId) }),
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
        staleTime: 0,
        refetchOnWindowFocus: false,
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
        staleTime: 0,
        refetchOnWindowFocus: false,
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
    const qc = useQueryClient()
    return useQuery({
        queryKey: sheetsKeys.attacks(sheetId),
        queryFn: async () => {
            const fetchedAttacks = await fetchAttacks(sheetId)
            const currentAttacks = qc.getQueryData<CharacterAttack[]>(sheetsKeys.attacks(sheetId)) ?? []
            const clientKeyById = new Map(currentAttacks.map((attack) => [attack._id, attack.clientKey]).filter((entry): entry is [string, string] => !!entry[1]))
            return fetchedAttacks.map((attack) => ({
                ...attack,
                clientKey: clientKeyById.get(attack._id) ?? attack.clientKey,
            }))
        },
        enabled: !!sheetId,
        staleTime: 0,
        refetchOnWindowFocus: false,
    })
}

export function useAddAttack(sheetId: string, options?: OptimisticEntityOptions) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: CreateAttackBody) => addAttack(sheetId, data),
        onMutate: async (data) => {
            await qc.cancelQueries({ queryKey: sheetsKeys.attacks(sheetId) })
            const previousAttacks = qc.getQueryData<CharacterAttack[]>(sheetsKeys.attacks(sheetId)) ?? []
            const optimisticId = buildOptimisticId("attack")
            const optimisticAttack: CharacterAttack = {
                _id: optimisticId,
                clientKey: optimisticId,
                sheetId,
                name: data.name,
                attackBonus: data.attackBonus ?? "",
                damageType: data.damageType ?? "",
                notes: data.notes ?? "",
                createdAt: new Date().toISOString(),
            }

            qc.setQueryData<CharacterAttack[]>(sheetsKeys.attacks(sheetId), [...previousAttacks, optimisticAttack])
            options?.onOptimisticCreate?.(optimisticId)
            return { previousAttacks, optimisticId }
        },
        onError: (_error, _data, context) => {
            if (context?.previousAttacks) qc.setQueryData(sheetsKeys.attacks(sheetId), context.previousAttacks)
        },
        onSuccess: (created, _data, context) => {
            qc.setQueryData<CharacterAttack[]>(sheetsKeys.attacks(sheetId), (current = []) =>
                current.map((attack) => attack._id === context?.optimisticId ? { ...created, clientKey: context.optimisticId } : attack)
            )
            if (context?.optimisticId) options?.onCreateSuccess?.({ optimisticId: context.optimisticId, createdId: created._id })
        },
        onSettled: () => qc.invalidateQueries({ queryKey: sheetsKeys.attacks(sheetId) }),
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
