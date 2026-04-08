"use client"

import { useCallback } from "react"
import type { UseFormWatch } from "react-hook-form"
import { useItems, useAddItem, usePatchItem, useRemoveItem, usePatchSheet } from "../../api/character-sheets-queries"
import type { CharacterSheet, CharacterItem, PatchSheetBody } from "../../types/character-sheet.types"

interface UseItemListOptions {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
}

export function useItemList({ sheet, form, isReadOnly = false }: UseItemListOptions) {
    const { patchField } = form
    const { data: items = [], isLoading: isLoadingItems } = useItems(sheet._id)
    const addItem = useAddItem(sheet._id)
    const patchItem = usePatchItem(sheet._id)
    const removeItem = useRemoveItem(sheet._id)
    const { isPending: isSaving } = usePatchSheet(sheet._id)

    const handleAddItem = useCallback(() => {
        if (isReadOnly) return
        addItem.mutate({ name: "Novo item", quantity: 1, notes: "" })
    }, [addItem, isReadOnly])

    const handlePatchItem = useCallback(
        (itemId: string, data: Partial<Pick<CharacterItem, "name" | "quantity" | "notes">>) => {
            if (isReadOnly) return
            patchItem.mutate({ itemId, data })
        },
        [isReadOnly, patchItem]
    )

    const handleRemoveItem = useCallback(
        (itemId: string) => {
            if (isReadOnly) return
            removeItem.mutate(itemId)
        },
        [isReadOnly, removeItem]
    )

    const handlePatchCoins = useCallback(
        (coinKey: "cp" | "sp" | "ep" | "gp" | "pp", value: number) => {
            if (isReadOnly) return
            const current = sheet.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
            patchField("coins", { ...current, [coinKey]: Math.max(0, value) })
        },
        [isReadOnly, patchField, sheet.coins]
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
