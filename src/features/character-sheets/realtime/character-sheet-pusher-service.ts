import "server-only"

import { PusherService } from "@/core/realtime/pusher-service"
import type {
    CharacterAttack,
    CharacterFeat,
    CharacterItem,
    CharacterSheet,
    CharacterSpell,
    CharacterTrait,
} from "../types/character-sheet.types"
import {
    CHARACTER_SHEET_PUSHER_EVENTS,
    getCharacterSheetChannelName,
    getCharacterSheetCollectionEventName,
    type CharacterSheetCollectionChangedEventPayload,
    type CharacterSheetCollectionName,
    type CharacterSheetPatchedEventPayload,
} from "./character-sheet-pusher"

type CharacterSheetCollectionMap = {
    items: CharacterItem
    spells: CharacterSpell
    attacks: CharacterAttack
    traits: CharacterTrait
    feats: CharacterFeat
}

interface PublishSheetPatchedOptions {
    sheet: CharacterSheet
    originId?: string
}

interface PublishCollectionChangedOptions<TCollection extends CharacterSheetCollectionName> {
    sheetId: string
    collection: TCollection
    action: CharacterSheetCollectionChangedEventPayload<TCollection, CharacterSheetCollectionMap[TCollection]>["action"]
    originId?: string
    recordId?: string
    record?: CharacterSheetCollectionMap[TCollection]
    records?: CharacterSheetCollectionMap[TCollection][]
}

/**
 * Encapsulates all realtime event naming and payload shaping for character
 * sheets.
 *
 * Keeping this as a domain service means the rest of the codebase only asks to
 * "publish a sheet update" or "publish an item change" without knowing channel
 * names or raw Pusher details.
 */
export class CharacterSheetPusherService {
    private static instance: CharacterSheetPusherService | null = null

    static getInstance(): CharacterSheetPusherService {
        if (!CharacterSheetPusherService.instance) {
            CharacterSheetPusherService.instance = new CharacterSheetPusherService(PusherService.getInstance())
        }

        return CharacterSheetPusherService.instance
    }

    private constructor(private readonly pusher: PusherService) {}

    /**
     * Returns the public channel name used for all events of a sheet.
     */
    getChannelName(sheetId: string): string {
        return getCharacterSheetChannelName(sheetId)
    }

    /**
     * Publishes the latest persisted main sheet snapshot.
     */
    async publishSheetPatched({ sheet, originId }: PublishSheetPatchedOptions) {
        const payload: CharacterSheetPatchedEventPayload = {
            sheetId: sheet._id,
            originId,
            action: "patched",
            sheet,
            serverTimestamp: new Date().toISOString(),
        }

        await this.pusher.trigger(
            this.getChannelName(sheet._id),
            CHARACTER_SHEET_PUSHER_EVENTS.sheetPatched,
            payload
        )
    }

    /**
     * Publishes a change for one of the related sheet collections such as items
     * or spells.
     */
    async publishCollectionChanged<TCollection extends CharacterSheetCollectionName>({
        sheetId,
        collection,
        action,
        originId,
        recordId,
        record,
        records,
    }: PublishCollectionChangedOptions<TCollection>) {
        const payload: CharacterSheetCollectionChangedEventPayload<TCollection, CharacterSheetCollectionMap[TCollection]> = {
            sheetId,
            originId,
            collection,
            action,
            recordId,
            record,
            records,
            serverTimestamp: new Date().toISOString(),
        }

        await this.pusher.trigger(
            this.getChannelName(sheetId),
            getCharacterSheetCollectionEventName(collection),
            payload
        )
    }
}
