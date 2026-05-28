"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { UseFormWatch } from "react-hook-form"
import { useSheetSpells, useAddSpell, usePatchSpell, useRemoveSpell, usePatchSheet, useAttacks, useAddAttack, usePatchAttack, useRemoveAttack } from "../../api/character-sheets-queries"
import { useCharacterCalculations } from "../../hooks/use-character-calculations"
import { useSpellNameSync } from "./use-spell-name-sync"
import { extractMentionsFromHtml } from "../../utils/mention-sync"
import type { CharacterSheet, CreateAttackBody, PatchAttackBody, PatchSheetBody, PatchSpellBody } from "../../types/character-sheet.types"

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
    const { data: attacks = [] } = useAttacks(sheet._id)
    const [focusSpellId, setFocusSpellId] = useState<string | null>(null)
    const addSpell = useAddSpell(sheet._id, {
        onOptimisticCreate: setFocusSpellId,
    })
    const patchSpell = usePatchSpell(sheet._id)
    const removeSpell = useRemoveSpell(sheet._id)
    const addAttack = useAddAttack(sheet._id)
    const patchAttack = usePatchAttack(sheet._id)
    const removeAttack = useRemoveAttack(sheet._id)
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

    const handleAddAttack = useCallback(
        (data: CreateAttackBody) => {
            addAttack.mutate(data)
        },
        [addAttack]
    )

    const handlePatchAttack = useCallback(
        (attackId: string, data: PatchAttackBody) => {
            patchAttack.mutate({ attackId, data })
        },
        [patchAttack]
    )

    const handleRemoveAttack = useCallback(
        (attackId: string) => {
            removeAttack.mutate(attackId)
        },
        [removeAttack]
    )

    const { handleSpellNameChange, removeAutoAttackForSpell, syncCantripAttack } = useSpellNameSync({
        isReadOnly,
        calc,
        level: currentSheet.level,
        attacks,
        onPatch: handlePatchSpell,
        onAddAttack: handleAddAttack,
        onPatchAttack: handlePatchAttack,
        onRemoveAttack: handleRemoveAttack,
    })

    useEffect(() => {
        if (isReadOnly || spells.length === 0) return
        let cancelled = false

        void (async () => {
            await Promise.all(spells.map(async (spell) => {
                const mention = extractMentionsFromHtml(spell.name).find((item) => item.entityType === "Magia")
                if (!mention || cancelled) return
                try {
                    await syncCantripAttack(spell.name, mention.id)
                } catch {
                    // Keep spell rows editable if the catalog lookup fails.
                }
            }))
        })()

        return () => {
            cancelled = true
        }
    }, [isReadOnly, spells, syncCantripAttack])

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
            const spell = spells.find((item) => item._id === spellId)
            const mention = extractMentionsFromHtml(spell?.name).find((item) => item.entityType === "Magia")
            if (mention) removeAutoAttackForSpell(mention.id)
            removeSpell.mutate(spellId)
        },
        [isReadOnly, removeAutoAttackForSpell, removeSpell, spells]
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
