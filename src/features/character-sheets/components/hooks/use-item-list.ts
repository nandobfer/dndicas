"use client"

import { useCallback } from "react"
import { useItems, useAddItem, usePatchItem, useRemoveItem, usePatchSheet } from "../../api/character-sheets-queries"
import type { CharacterSheet, CharacterItem } from "../../types/character-sheet.types"

interface UseItemListOptions {
    sheet: CharacterSheet
    form: {
        watch: (field?: string) => any
        patchField: (field: string, value: unknown) => void
    }
}

export function useItemList({ sheet, form }: UseItemListOptions) {
    const { patchField } = form
    const { data: items = [], isLoading: isLoadingItems } = useItems(sheet._id)
    const addItem = useAddItem(sheet._id)
    const patchItem = usePatchItem(sheet._id)
    const removeItem = useRemoveItem(sheet._id)
    const { isPending: isSaving } = usePatchSheet(sheet._id)

    const handleAddItem = useCallback(() => {
        addItem.mutate({ name: "Novo item", quantity: 1, notes: "" })
    }, [addItem])

    const handlePatchItem = useCallback(
        (itemId: string, data: Partial<Pick<CharacterItem, "name" | "quantity" | "notes">>) => {
            patchItem.mutate({ itemId, data })
        },
        [patchItem]
    )

    const handleRemoveItem = useCallback(
        (itemId: string) => {
            removeItem.mutate(itemId)
        },
        [removeItem]
    )

    const handlePatchCoins = useCallback(
        (coinKey: "cp" | "sp" | "ep" | "gp" | "pp", value: number) => {
            const current = sheet.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
            patchField("coins", { ...current, [coinKey]: Math.max(0, value) })
        },
        [patchField, sheet.coins]
    )

    return {
        items,
        isLoadingItems,
        isSaving,
        handleAddItem,
        handlePatchItem,
        handleRemoveItem,
        handlePatchCoins,
    }
}
