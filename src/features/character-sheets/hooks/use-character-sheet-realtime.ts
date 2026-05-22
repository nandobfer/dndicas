"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { getPusherBrowserConfig } from "@/core/realtime/pusher-browser-config"
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
        if (!sheetId) return

        const originId = getOrCreatePusherOriginId()
        let channel: ReturnType<PusherBrowserService["subscribe"]> | null = null
        let disposed = false

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

        const bindChannelEvents = (nextChannel: NonNullable<typeof channel>) => {
            nextChannel.bind("pusher:subscription_succeeded", () => {
                console.info("[realtime] Character sheet subscription succeeded.", {
                    sheetId,
                    channelName: nextChannel.name,
                })
            })
            nextChannel.bind("pusher:subscription_error", (error: unknown) => {
                console.error("[realtime] Character sheet subscription failed.", {
                    sheetId,
                    channelName: nextChannel.name,
                    error,
                })
            })
            nextChannel.bind(CHARACTER_SHEET_PUSHER_EVENTS.sheetPatched, handleSheetPatched)
            nextChannel.bind(CHARACTER_SHEET_PUSHER_EVENTS.itemsChanged, (payload: CharacterSheetCollectionChangedEventPayload<"items", CharacterItem>) => {
                applyCollectionChange(sheetsKeys.items(sheetId), payload)
            })
            nextChannel.bind(CHARACTER_SHEET_PUSHER_EVENTS.spellsChanged, (payload: CharacterSheetCollectionChangedEventPayload<"spells", CharacterSpell>) => {
                applyCollectionChange(sheetsKeys.spells(sheetId), payload)
            })
            nextChannel.bind(CHARACTER_SHEET_PUSHER_EVENTS.attacksChanged, (payload: CharacterSheetCollectionChangedEventPayload<"attacks", CharacterAttack>) => {
                applyCollectionChange(sheetsKeys.attacks(sheetId), payload)
            })
            nextChannel.bind(CHARACTER_SHEET_PUSHER_EVENTS.traitsChanged, (payload: CharacterSheetCollectionChangedEventPayload<"traits", CharacterTrait>) => {
                applyCollectionChange(sheetsKeys.traits(sheetId), payload)
            })
            nextChannel.bind(CHARACTER_SHEET_PUSHER_EVENTS.featsChanged, (payload: CharacterSheetCollectionChangedEventPayload<"feats", CharacterFeat>) => {
                applyCollectionChange(sheetsKeys.feats(sheetId), payload)
            })
        }

        void (async () => {
            const browserConfig = await getPusherBrowserConfig()
            if (disposed) return

            if (!browserConfig?.key || !browserConfig.wsHost || !Number.isFinite(browserConfig.wsPort) || browserConfig.wsPort <= 0) {
                console.error("[realtime] Missing or invalid Pusher browser config.", {
                    sheetId,
                    config: browserConfig,
                })
                return
            }

            const channelName = getCharacterSheetChannelName(sheetId)
            const pusher = PusherBrowserService.getInstance()

            channel = pusher.subscribe(browserConfig, channelName)
            bindChannelEvents(channel)

            console.info("[realtime] Character sheet subscription requested.", {
                sheetId,
                channelName,
                originId,
                transport: browserConfig.enabledTransports.join(","),
                forceTLS: browserConfig.forceTLS,
            })
        })()

        return () => {
            disposed = true
            if (!channel) return

            const pusher = PusherBrowserService.getInstance()
            const channelName = getCharacterSheetChannelName(sheetId)

            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.sheetPatched, handleSheetPatched)
            channel.unbind("pusher:subscription_succeeded")
            channel.unbind("pusher:subscription_error")
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.itemsChanged)
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.spellsChanged)
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.attacksChanged)
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.traitsChanged)
            channel.unbind(CHARACTER_SHEET_PUSHER_EVENTS.featsChanged)
            pusher.unsubscribe(channelName)
        }
    }, [currentSlug, queryClient, router, sheetId])
}
