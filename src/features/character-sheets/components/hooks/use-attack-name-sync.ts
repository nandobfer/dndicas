"use client"

import { useRef, useCallback } from "react"
import { fetchSpell } from "@/features/spells/api/spells-api"
import { fetchItemById } from "@/features/items/api/items-api"
import { extractMentionsFromHtml } from "../../utils/mention-sync"
import type { CharacterAttack } from "../../types/character-sheet.types"
import { buildDiceValueHtml, buildWeaponAttackAutofill, formatBonus, resolveCatalogItemType } from "../../utils/attack-autofill"

interface CalcValues {
    spellAttackBonus: { value: number }
    profBonus: { value: number }
    attrMods: {
        strength: { value: number }
        dexterity: { value: number }
    }
}

interface UseAttackNameSyncOptions {
    calc: CalcValues
    isReadOnly?: boolean
    onPatch: (attackId: string, data: Partial<Omit<CharacterAttack, "_id" | "sheetId" | "createdAt">>) => void
}

export function useAttackNameSync({ calc, isReadOnly = false, onPatch }: UseAttackNameSyncOptions) {
    // Cache: attackId → last processed catalogId
    const processedRef = useRef<Map<string, string>>(new Map())

    const handleAttackNameChange = useCallback(
        async (attackId: string, nameHtml: string) => {
            if (isReadOnly) return

            // Always patch name
            onPatch(attackId, { name: nameHtml })

            const mentions = extractMentionsFromHtml(nameHtml)

            const spellMention = mentions.find((m) => m.entityType === "Magia")
            const itemMention = mentions.find((m) => m.entityType === "Item")
            const activeMention = spellMention ?? itemMention
            if (!activeMention) {
                processedRef.current.delete(attackId)
                return
            }

            if (processedRef.current.get(attackId) === activeMention.id) return
            processedRef.current.set(attackId, activeMention.id)

            try {
                if (spellMention) {
                    const catalogSpell = await fetchSpell(spellMention.id)

                    // Format damage from baseDice
                    let damageText = ""
                    if (catalogSpell.baseDice) {
                        const { quantidade, tipo } = catalogSpell.baseDice
                        damageText = `${buildDiceValueHtml(quantidade, tipo)}`
                    }

                    onPatch(attackId, {
                        damageType: damageText,
                        attackBonus: formatBonus(calc.spellAttackBonus.value),
                    })
                } else if (itemMention) {
                    const catalogItem = await fetchItemById(itemMention.id)
                    const catalogItemType = resolveCatalogItemType(catalogItem)
                    if (catalogItemType !== "arma") return
                    onPatch(attackId, buildWeaponAttackAutofill(catalogItem, calc))
                }
            } catch {
                // Silently ignore fetch errors
            }
        },
        [isReadOnly, onPatch, calc]
    )

    return { handleAttackNameChange }
}
