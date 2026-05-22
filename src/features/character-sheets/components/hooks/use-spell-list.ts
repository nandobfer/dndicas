"use client"

import { useCallback, useMemo, useState } from "react"
import type { UseFormWatch } from "react-hook-form"
import { useSheetSpells, useAddSpell, usePatchSpell, useRemoveSpell, usePatchSheet } from "../../api/character-sheets-queries"
import { useCharacterCalculations } from "../../hooks/use-character-calculations"
import { useSpellNameSync } from "./use-spell-name-sync"
import type { CharacterSheet, PatchSheetBody, PatchSpellBody } from "../../types/character-sheet.types"

interface UseSpellListOptions {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
}

export function useSpellList({ sheet, form, isReadOnly = false }: UseSpellListOptions) {
    const { watch, patchField } = form
    const currentValues = watch()
    const currentSheet = { ...sheet, ...currentValues } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)

    const { data: spells = [], isLoading: isLoadingSpells } = useSheetSpells(sheet._id)
    const [focusSpellId, setFocusSpellId] = useState<string | null>(null)
    const addSpell = useAddSpell(sheet._id, {
        onOptimisticCreate: setFocusSpellId,
    })
    const patchSpell = usePatchSpell(sheet._id)
    const removeSpell = useRemoveSpell(sheet._id)
    const { isPending: isSaving } = usePatchSheet(sheet._id)

    const spellSlots = useMemo(
        () => (currentValues.spellSlots ?? sheet.spellSlots ?? {}) as Record<string, { total: number; used: number }>,
        [currentValues.spellSlots, sheet.spellSlots]
    )

    const handlePatchSpell = useCallback(
        (spellId: string, data: PatchSpellBody) => {
            if (isReadOnly) return
            patchSpell.mutate({ spellId, data })
        },
        [isReadOnly, patchSpell]
    )

    const { handleSpellNameChange } = useSpellNameSync({
        isReadOnly,
        onPatch: handlePatchSpell,
    })

    const handleAddSpell = useCallback(() => {
        if (isReadOnly) return
        addSpell.mutate({
            name: "",
            circle: null,
            castingTime: "",
            range: "",
            concentration: false,
            ritual: false,
            material: false,
            notes: "",
        })
    }, [addSpell, isReadOnly])

    const handleRemoveSpell = useCallback(
        (spellId: string) => {
            if (isReadOnly) return
            removeSpell.mutate(spellId)
        },
        [isReadOnly, removeSpell]
    )

    const handlePatchSpellSlot = useCallback(
        (level: string, field: "total" | "used", value: number) => {
            if (isReadOnly) return
            const current = spellSlots[level] ?? { total: 0, used: 0 }
            patchField("spellSlots", {
                ...spellSlots,
                [level]: { ...current, [field]: Math.max(0, value) },
            })
        },
        [isReadOnly, patchField, spellSlots]
    )

    const handlePatchSpellcasting = useCallback(
        (attr: string | null) => {
            if (isReadOnly) return
            patchField("spellcastingAttribute", attr)
        },
        [isReadOnly, patchField]
    )

    const clearFocusSpellId = useCallback(() => {
        setFocusSpellId(null)
    }, [])

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
        handleSpellNameChange,
        handleRemoveSpell,
        handlePatchSpellSlot,
        handlePatchSpellcasting,
        focusSpellId,
        clearFocusSpellId,
    }
}
