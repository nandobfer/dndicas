"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { PusherBrowserService } from "@/core/realtime/pusher-browser-service"
import { getOrCreatePusherOriginId } from "@/core/realtime/pusher-origin"
import {
    CHARACTER_SHEET_PUSHER_EVENTS,
    getCharacterSheetChannelName,
    type CharacterSheetCollectionChangedEventPayload,
    type CharacterSheetCollectionName,
    type CharacterSheetPatchedEventPayload,
} from "../realtime/character-sheet-pusher"
import type {
    CharacterAttack,
    CharacterFeat,
    CharacterItem,
    CharacterSheet,
    CharacterSpell,
    CharacterTrait,
} from "../types/character-sheet.types"
import { sheetsKeys } from "../api/character-sheets-queries"

type CollectionRecordMap = {
    items: CharacterItem
    spells: CharacterSpell
    attacks: CharacterAttack
    traits: CharacterTrait
    feats: CharacterFeat
}

const browserConfig = {
    key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY ?? "",
    wsHost: process.env.NEXT_PUBLIC_PUSHER_HOST ?? "",
    wsPort: Number.parseInt(process.env.NEXT_PUBLIC_PUSHER_PORT ?? "0", 10),
    wssPort: Number.parseInt(process.env.NEXT_PUBLIC_PUSHER_PORT ?? "0", 10),
    forceTLS: (process.env.NEXT_PUBLIC_PUSHER_SCHEME ?? "http") === "https",
    enabledTransports: ((process.env.NEXT_PUBLIC_PUSHER_SCHEME ?? "http") === "https" ? ["wss"] : ["ws"]) as Array<"ws" | "wss">,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "mt1",
}

const hasRealtimeConfig = Boolean(
    browserConfig.key &&
    browserConfig.wsHost &&
    Number.isFinite(browserConfig.wsPort) &&
    browserConfig.wsPort > 0
)

interface UseCharacterSheetRealtimeOptions {
    sheetId: string
    currentSlug: string
}

function upsertCollectionRecord<TRecord extends { _id: string }>(current: TRecord[] | undefined, next: TRecord): TRecord[] {
    const existing = current ?? []
    const index = existing.findIndex((record) => record._id === next._id)
    if (index === -1) return [...existing, next]

    const copy = [...existing]
    copy[index] = { ...copy[index], ...next }
    return copy
}

function removeCollectionRecord<TRecord extends { _id: string }>(current: TRecord[] | undefined, recordId: string): TRecord[] {
    return (current ?? []).filter((record) => record._id !== recordId)
}

/**
 * Subscribes the sheet screen to realtime updates and keeps React Query caches
 * aligned with changes produced by other viewers.
 */
export function useCharacterSheetRealtime({ sheetId, currentSlug }: UseCharacterSheetRealtimeOptions) {
    const queryClient = useQueryClient()
    const router = useRouter()

    useEffect(() => {
        if (!sheetId || !hasRealtimeConfig) return

        const originId = getOrCreatePusherOriginId()
        const channelName = getCharacterSheetChannelName(sheetId)
        const pusher = PusherBrowserService.getInstance()
        const channel = pusher.subscribe(browserConfig, channelName)

        const syncSheetDetail = (sheet: CharacterSheet) => {
            queryClient.setQueryData(sheetsKeys.detail(sheetId), sheet)
            queryClient.setQueryData(sheetsKeys.bySlug(currentSlug), sheet)
            queryClient.setQueryData(sheetsKeys.bySlug(sheet.slug), sheet)
        }

        const handleSheetPatched = (payload: CharacterSheetPatchedEventPayload) => {
            if (payload.originId && payload.originId === originId) return

            syncSheetDetail(payload.sheet)

            if (payload.sheet.slug !== currentSlug) {
                router.replace(`/sheets/${payload.sheet.slug}`)
            }
        }

        const applyCollectionChange = <TCollection extends CharacterSheetCollectionName>(
            queryKey: ReturnType<typeof sheetsKeys[TCollection]>,
            payload: CharacterSheetCollectionChangedEventPayload<TCollection, CollectionRecordMap[TCollection]>
        ) => {
            if (payload.originId && payload.originId === originId) return

            switch (payload.action) {
                case "created":
                case "updated":
                    if (payload.record) {
                        queryClient.setQueryData<CollectionRecordMap[TCollection][]>(queryKey, (current) =>
                            upsertCollectionRecord(current, payload.record as CollectionRecordMap[TCollection])
                        )
                    }
                    break
                case "deleted":
                    if (payload.recordId) {
                        queryClient.setQueryData<CollectionRecordMap[TCollection][]>(queryKey, (current) =>
                            removeCollectionRecord(current, payload.recordId!)
                        )
                    }
                    break
                case "reloaded":
                    if (payload.records) {
                        queryClient.setQueryData<CollectionRecordMap[TCollection][]>(queryKey, payload.records)
                    }
                    break
            }
        }

        channel.bind(CHARACTER_SHEET_PUSHER_EVENTS.sheetPatched, handleSheetPatched)
        channel.bind(CHARACTER_SHEET_PUSHER_EVENTS.itemsChanged, (payload: CharacterSheetCollectionChangedEventPayload<"items", CharacterItem>) => {
            applyCollectionChange(sheetsKeys.items(sheetId), payload)
        })
        channel.bind(CHARACTER_SHEET_PUSHER_EVENTS.spellsChanged, (payload: CharacterSheetCollectionChangedEventPayload<"spells", CharacterSpell>) => {
            applyCollectionChange(sheetsKeys.spells(sheetId), payload)
        })
        channel.bind(CHARACTER_SHEET_PUSHER_EVENTS.attacksChanged, (payload: CharacterSheetCollectionChangedEventPayload<"attacks", CharacterAttack>) => {
            applyCollectionChange(sheetsKeys.attacks(sheetId), payload)
        })
        channel.bind(CHARACTER_SHEET_PUSHER_EVENTS.traitsChanged, (payload: CharacterSheetCollectionChangedEventPayload<"traits", CharacterTrait>) => {
            applyCollectionChange(sheetsKeys.traits(sheetId), payload)
        })
        channel.bind(CHARACTER_SHEET_PUSHER_EVENTS.featsChanged, (payload: CharacterSheetCollectionChangedEventPayload<"feats", CharacterFeat>) => {
            applyCollectionChange(sheetsKeys.feats(sheetId), payload)
        })

        return () => {
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.sheetPatched, handleSheetPatched)
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.itemsChanged)
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.spellsChanged)
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.attacksChanged)
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.traitsChanged)
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.featsChanged)
            pusher.unsubscribe(channelName)
        }
    }, [currentSlug, queryClient, router, sheetId])
}
