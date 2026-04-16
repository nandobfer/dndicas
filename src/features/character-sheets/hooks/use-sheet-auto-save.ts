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
    }, [reset, sheet])

    /**
     * Update local form state only — no server request. Use this for text inputs
     * that save on blur via `patchField`.
     */
    const setFieldLocally = useCallback(
        (field: keyof PatchSheetBody, value: unknown) => {
            setValue(field, value as PatchSheetBody[typeof field], { shouldDirty: true, shouldTouch: true })
        },
        [setValue]
    )

    /**
     * Patch a single field. This is used by debounced inputs like SheetInput.
     */
    const patchField = useCallback(
        (field: keyof PatchSheetBody, value: unknown) => {
            if (options?.disabled) return

            // Update local form state immediately
            setValue(field, value as PatchSheetBody[typeof field], { shouldDirty: true, shouldTouch: true })

            // Only patch if we have an ID
            if (sheet?._id) {
                const body: PatchSheetBody = { [field]: value as PatchSheetBody[typeof field] }
                patch(body, {
                    onSuccess: (updated) => {
                        if (field === "name" && updated?.slug && updated.slug !== sheet.slug) {
                            options?.onSlugChange?.(updated.slug)
                        }
                    },
                })
            }
        },
        [options, patch, setValue, sheet]
    )

    /**
     * Patch multiple fields in a single request while keeping local form state in sync.
     */
    const patchFields = useCallback(
        (values: Partial<PatchSheetBody>) => {
            if (options?.disabled) return
            // No trimming here — patchFields is used by the mention sync which generates
            // clean HTML internally. Trimming would cause a value mismatch on the next
            // sync cycle and create an infinite re-patch loop.
            const entries = Object.entries(values) as Array<[keyof PatchSheetBody, PatchSheetBody[keyof PatchSheetBody]]>
            if (entries.length === 0) return

            for (const [field, value] of entries) {
                setValue(field, value, { shouldDirty: true, shouldTouch: true })
            }

            if (sheet?._id) {
                patch(values, {
                    onSuccess: (updated) => {
                        if (values.name && updated?.slug && updated.slug !== sheet.slug) {
                            options?.onSlugChange?.(updated.slug)
                        }
                    },
                })
            }
        },
        [options, patch, setValue, sheet]
    )

    return {
        ...form,
        setFieldLocally,
        patchField,
        patchFields,
        isSaving: isPending
    }
}
