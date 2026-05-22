"use client"

import { useCallback, useRef, useState } from "react"
import type { UseFormWatch } from "react-hook-form"
import { useItems, useAddItem, usePatchItem, useRemoveItem, usePatchSheet, useAttacks, useAddAttack, useRemoveAttack } from "../../api/character-sheets-queries"
import { fetchItemById } from "@/features/items/api/items-api"
import { extractMentionsFromHtml } from "../../utils/mention-sync"
import type { CharacterSheet, CharacterItem, PatchSheetBody } from "../../types/character-sheet.types"
import { useCharacterCalculations } from "../../hooks/use-character-calculations"
import { buildWeaponAttackAutofill, resolveCatalogItemType } from "../../utils/attack-autofill"

function normalizeCatalogArmorType(armorType?: string | null): CharacterItem["catalogArmorType"] {
    if (armorType === "leve" || armorType === "média" || armorType === "pesada") {
        return armorType
    }
    return null
}

interface UseItemListOptions {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
}

export function useItemList({ sheet, form, isReadOnly = false }: UseItemListOptions) {
    const { patchField, watch } = form
    const currentValues = watch()
    const currentSheet = { ...sheet, ...currentValues } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)
    const { data: items = [], isLoading: isLoadingItems } = useItems(sheet._id)
    const { data: attacks = [] } = useAttacks(sheet._id)
    const [focusItemId, setFocusItemId] = useState<string | null>(null)
    const addItem = useAddItem(sheet._id, {
        onOptimisticCreate: setFocusItemId,
    })
    const patchItem = usePatchItem(sheet._id)
    const removeItem = useRemoveItem(sheet._id)
    const addAttack = useAddAttack(sheet._id)
    const removeAttack = useRemoveAttack(sheet._id)
    const { isPending: isSaving } = usePatchSheet(sheet._id)

    // Cache of processed item IDs to avoid redundant fetches
    const processedItemNameRef = useRef<Map<string, string>>(new Map())

    const handleAddItem = useCallback(() => {
        if (isReadOnly) return
        addItem.mutate({ name: "", quantity: 1, notes: "" })
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
            patchItem.mutate({ itemId, data: { name: nameHtml } })

            // Check for Item mention
            const mentions = extractMentionsFromHtml(nameHtml)
            const itemMention = mentions.find((m) => m.entityType === "Item")

            if (!itemMention) {
                processedItemNameRef.current.delete(itemId)
                patchItem.mutate({
                    itemId,
                    data: {
                        catalogItemId: null,
                        catalogItemType: null,
                        catalogAc: null,
                        catalogAcType: null,
                        catalogArmorType: null,
                        catalogAcBonus: null,
                    },
                })
                return
            }

            // Avoid re-fetching for the same mention
            if (processedItemNameRef.current.get(itemId) === itemMention.id) return
            processedItemNameRef.current.set(itemId, itemMention.id)

            try {
                const catalogItem = await fetchItemById(itemMention.id)
                const catalogItemType = resolveCatalogItemType(catalogItem)

                const metadata: Partial<CharacterItem> = {
                    catalogItemId: catalogItem.id,
                    catalogItemType: catalogItemType,
                    catalogAc: catalogItem.ac ?? null,
                    catalogAcType: catalogItem.acType ?? null,
                    catalogArmorType: normalizeCatalogArmorType(catalogItem.armorType),
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

            // Only one base-AC armor can be equipped at a time
            if (newEquipped && item.catalogItemType === "armadura" && item.catalogAcType === "base") {
                const currentBaseArmor = items.find(
                    (i) => i._id !== item._id && i.catalogItemType === "armadura" && i.catalogAcType === "base" && i.equipped
                )
                if (currentBaseArmor) {
                    patchItem.mutate({ itemId: currentBaseArmor._id, data: { equipped: false } })
                }
            }

            patchItem.mutate({ itemId: item._id, data: { equipped: newEquipped } })

            if (item.catalogItemType !== "arma") {
                return
            }

            const itemMentions = extractMentionsFromHtml(item.name)
            const itemMentionId = item.catalogItemId ?? itemMentions.find((mention) => mention.entityType === "Item")?.id
            if (!itemMentionId) {
                return
            }

            const matchingAttack = attacks.find((attack) => {
                const attackMentions = extractMentionsFromHtml(attack.name)
                return attackMentions.some((mention) => mention.entityType === "Item" && mention.id === itemMentionId)
            })

            if (!newEquipped) {
                if (matchingAttack) {
                    removeAttack.mutate(matchingAttack._id)
                }
                return
            }

            if (matchingAttack) {
                return
            }

            try {
                const catalogItem = await fetchItemById(itemMentionId)
                if (resolveCatalogItemType(catalogItem) !== "arma") {
                    return
                }

                addAttack.mutate({
                    name: item.name,
                    ...buildWeaponAttackAutofill(catalogItem, calc),
                })
            } catch {
                // Silently ignore fetch errors
            }
        },
        [isReadOnly, patchItem, attacks, addAttack, removeAttack, items, calc]
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

    const clearFocusItemId = useCallback(() => {
        setFocusItemId(null)
    }, [])

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
        focusItemId,
        clearFocusItemId,
    }
}
