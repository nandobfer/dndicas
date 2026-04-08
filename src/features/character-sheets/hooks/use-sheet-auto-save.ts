"use client"

import { useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { usePatchSheet } from "../api/character-sheets-queries"
import type { CharacterSheet, PatchSheetBody } from "../types/character-sheet.types"

interface UseSheetAutoSaveOptions {
    onSlugChange?: (newSlug: string) => void
    disabled?: boolean
}

export function useSheetAutoSave(sheet: CharacterSheet, options?: UseSheetAutoSaveOptions) {
    const { mutate: patch, isPending } = usePatchSheet(sheet?._id)

    const form = useForm<PatchSheetBody>({
        defaultValues: sheet as PatchSheetBody
    })

    const { reset, setValue } = form

    // Sync external value changes
    useEffect(() => {
        if (sheet) {
            reset(sheet as PatchSheetBody)
        }
    }, [sheet?._id, reset]) // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Patch a single field. This is used by debounced inputs like SheetInput.
     */
    const patchField = useCallback(
        (field: keyof PatchSheetBody, value: any) => {
            if (options?.disabled) return

            // Update local form state immediately
            setValue(field, value, { shouldDirty: true, shouldTouch: true })

            // Only patch if we have an ID
            if (sheet?._id) {
                const body: PatchSheetBody = { [field]: value }
                patch(body, {
                    onSuccess: (updated) => {
                        if (field === "name" && updated?.slug && updated.slug !== sheet.slug) {
                            options?.onSlugChange?.(updated.slug)
                        }
                    },
                })
            }
        },
        [patch, setValue, sheet?._id, sheet?.slug, options]
    )

    return {
        ...form,
        patchField,
        isSaving: isPending
    }
}
