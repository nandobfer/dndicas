import type {
    CharacterAttack,
    CharacterFeat,
    CharacterItem,
    CharacterSheet,
    CharacterSpell,
    CharacterTrait,
} from "../types/character-sheet.types"

export const CHARACTER_SHEET_PUSHER_EVENTS = {
    sheetPatched: "sheet.patched",
    itemsChanged: "sheet.items.changed",
    spellsChanged: "sheet.spells.changed",
    attacksChanged: "sheet.attacks.changed",
    traitsChanged: "sheet.traits.changed",
    featsChanged: "sheet.feats.changed",
} as const

export type CharacterSheetCollectionName = "items" | "spells" | "attacks" | "traits" | "feats"

export type CharacterSheetCollectionRecord =
    | CharacterItem
    | CharacterSpell
    | CharacterAttack
    | CharacterTrait
    | CharacterFeat

export type CharacterSheetCollectionAction = "created" | "updated" | "deleted" | "reloaded"

export interface CharacterSheetPatchedEventPayload {
    sheetId: string
    originId?: string
    action: "patched"
    sheet: CharacterSheet
    serverTimestamp: string
}

export interface CharacterSheetCollectionChangedEventPayload<
    TCollection extends CharacterSheetCollectionName = CharacterSheetCollectionName,
    TRecord extends CharacterSheetCollectionRecord = CharacterSheetCollectionRecord,
> {
    sheetId: string
    originId?: string
    collection: TCollection
    action: CharacterSheetCollectionAction
    recordId?: string
    record?: TRecord
    records?: TRecord[]
    serverTimestamp: string
}

export const getCharacterSheetChannelName = (sheetId: string) => `sheet.${sheetId}`

export const getCharacterSheetCollectionEventName = (collection: CharacterSheetCollectionName) => {
    switch (collection) {
        case "items":
            return CHARACTER_SHEET_PUSHER_EVENTS.itemsChanged
        case "spells":
            return CHARACTER_SHEET_PUSHER_EVENTS.spellsChanged
        case "attacks":
            return CHARACTER_SHEET_PUSHER_EVENTS.attacksChanged
        case "traits":
            return CHARACTER_SHEET_PUSHER_EVENTS.traitsChanged
        case "feats":
            return CHARACTER_SHEET_PUSHER_EVENTS.featsChanged
        default: {
            const unreachableCollection: never = collection
            return unreachableCollection
        }
    }
}
