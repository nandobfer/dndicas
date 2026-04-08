"use client"

import { useCallback } from "react"
import { useSheetSpells, useAddSpell, usePatchSpell, useRemoveSpell, usePatchSheet } from "../../api/character-sheets-queries"
import { useCharacterCalculations } from "../../hooks/use-character-calculations"
import type { CharacterSheet, CharacterSpell } from "../../types/character-sheet.types"

interface UseSpellListOptions {
    sheet: CharacterSheet
    form: {
        watch: (field?: string) => any
        patchField: (field: string, value: unknown) => void
    }
}

export function useSpellList({ sheet, form }: UseSpellListOptions) {
    const { watch, patchField } = form
    const currentValues = watch()
    const currentSheet = { ...sheet, ...currentValues } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)

    const { data: spells = [], isLoading: isLoadingSpells } = useSheetSpells(sheet._id)
    const addSpell = useAddSpell(sheet._id)
    const patchSpell = usePatchSpell(sheet._id)
    const removeSpell = useRemoveSpell(sheet._id)
    const { isPending: isSaving } = usePatchSheet(sheet._id)

    const spellSlots = (currentValues.spellSlots ?? sheet.spellSlots ?? {}) as Record<string, { total: number; used: number }>

    const handleAddSpell = useCallback(() => {
        addSpell.mutate({
            name: "Nova magia",
            circle: 0,
            castingTime: "",
            range: "",
            concentration: false,
            ritual: false,
            material: false,
            notes: "",
        })
    }, [addSpell])

    const handlePatchSpell = useCallback(
        (spellId: string, data: Partial<Omit<CharacterSpell, "_id" | "sheetId" | "createdAt">>) => {
            patchSpell.mutate({ spellId, data })
        },
        [patchSpell]
    )

    const handleRemoveSpell = useCallback(
        (spellId: string) => {
            removeSpell.mutate(spellId)
        },
        [removeSpell]
    )

    const handlePatchSpellSlot = useCallback(
        (level: string, field: "total" | "used", value: number) => {
            const current = spellSlots[level] ?? { total: 0, used: 0 }
            patchField("spellSlots", {
                ...spellSlots,
                [level]: { ...current, [field]: Math.max(0, value) },
            })
        },
        [patchField, spellSlots]
    )

    const handlePatchSpellcasting = useCallback(
        (attr: string | null) => {
            patchField("spellcastingAttribute", attr)
        },
        [patchField]
    )

    return {
        spells,
        isLoadingSpells,
        isSaving,
        spellSlots,
        spellcastingAttribute: currentValues.spellcastingAttribute ?? sheet.spellcastingAttribute ?? null,
        spellSaveDC: calc.spellSaveDC,
        spellAttackBonus: calc.spellAttackBonus,
        handleAddSpell,
        handlePatchSpell,
        handleRemoveSpell,
        handlePatchSpellSlot,
        handlePatchSpellcasting,
    }
}
