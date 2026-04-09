"use client"

import { useCallback, useRef } from "react"
import type { UseFormWatch } from "react-hook-form"
import { useItems, useAddItem, usePatchItem, useRemoveItem, usePatchSheet, useAttacks, useAddAttack } from "../../api/character-sheets-queries"
import { fetchItemById } from "@/features/items/api/items-api"
import { extractMentionsFromHtml } from "../../utils/mention-sync"
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
    const { data: attacks = [] } = useAttacks(sheet._id)
    const addItem = useAddItem(sheet._id)
    const patchItem = usePatchItem(sheet._id)
    const removeItem = useRemoveItem(sheet._id)
    const addAttack = useAddAttack(sheet._id)
    const { isPending: isSaving } = usePatchSheet(sheet._id)

    // Cache of processed item IDs to avoid redundant fetches
    const processedItemNameRef = useRef<Map<string, string>>(new Map())

    const handleAddItem = useCallback(() => {
        if (isReadOnly) return
        addItem.mutate({ name: "Novo item", quantity: 1, notes: "" })
    }, [addItem, isReadOnly])

    const handlePatchItem = useCallback(
        (itemId: string, data: Partial<CharacterItem>) => {
            if (isReadOnly) return
            patchItem.mutate({ itemId, data })
        },
        [isReadOnly, patchItem]
    )

    const handlePatchItemName = useCallback(
        async (itemId: string, nameHtml: string) => {
            if (isReadOnly) return

            // Always patch the name
            patchItem.mutate({ itemId, data: { name: nameHtml || "Item" } })

            // Check for Item mention
            const mentions = extractMentionsFromHtml(nameHtml)
            const itemMention = mentions.find((m) => m.entityType === "Item")

            if (!itemMention) {
                processedItemNameRef.current.delete(itemId)
                return
            }

            // Avoid re-fetching for the same mention
            if (processedItemNameRef.current.get(itemId) === itemMention.id) return
            processedItemNameRef.current.set(itemId, itemMention.id)

            try {
                const catalogItem = await fetchItemById(itemMention.id)

                const metadata: Partial<CharacterItem> = {
                    catalogItemType: catalogItem.type,
                    catalogAc: catalogItem.ac ?? null,
                    catalogAcType: catalogItem.acType ?? null,
                    catalogArmorType: catalogItem.armorType as "leve" | "média" | "pesada" | null ?? null,
                    catalogAcBonus: catalogItem.acBonus ?? null,
                }

                patchItem.mutate({ itemId, data: metadata })
            } catch {
                // Silently ignore fetch errors
            }
        },
        [isReadOnly, patchItem]
    )

    const handleToggleEquipped = useCallback(
        async (item: CharacterItem) => {
            if (isReadOnly) return
            const newEquipped = !item.equipped
            patchItem.mutate({ itemId: item._id, data: { equipped: newEquipped } })

            // When equipping a weapon, auto-add an attack row if not already present
            if (newEquipped && item.catalogItemType === "arma") {
                const alreadyExists = attacks.some((a) => {
                    const mentions = extractMentionsFromHtml(a.name)
                    return mentions.some((m) => m.entityType === "Item" && a.name.includes(item.name.replace(/<[^>]*>/g, "").trim()))
                }) || attacks.some((a) => a.name === item.name)

                if (!alreadyExists) {
                    addAttack.mutate({
                        name: item.name,
                        attackBonus: "",
                        damageType: "",
                    })
                }
            }
        },
        [isReadOnly, patchItem, attacks, addAttack]
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
        handlePatchItemName,
        handleToggleEquipped,
        handleRemoveItem,
        handlePatchCoins,
    }
}
