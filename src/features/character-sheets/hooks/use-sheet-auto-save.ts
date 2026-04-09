"use client"

import { useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { usePatchSheet } from "../api/character-sheets-queries"
import type { CharacterSheet, PatchSheetBody } from "../types/character-sheet.types"

interface UseSheetAutoSaveOptions {
    onSlugChange?: (newSlug: string) => void
    disabled?: boolean
}

const TEXT_ONLY_FIELDS = new Set<keyof PatchSheetBody>([
    "name", "experience", "age", "height", "weight",
    "eyes", "skin", "hair", "movementSpeed", "size",
    "hitDiceTotal", "multiclassNotes",
])

function trimValue<K extends keyof PatchSheetBody>(field: K, value: PatchSheetBody[K]): PatchSheetBody[K] {
    if (TEXT_ONLY_FIELDS.has(field) && typeof value === "string") {
        return value.trim() as PatchSheetBody[K]
    }
    return value
}

function trimValues(values: Partial<PatchSheetBody>): Partial<PatchSheetBody> {
    const result: Partial<PatchSheetBody> = {}
    for (const key of Object.keys(values) as Array<keyof PatchSheetBody>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(result as any)[key] = trimValue(key, values[key] as PatchSheetBody[typeof key])
    }
    return result
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
        (field: keyof PatchSheetBody, value: unknown) => {
            if (options?.disabled) return

            const trimmed = trimValue(field, value as PatchSheetBody[typeof field])

            // Update local form state immediately
            setValue(field, trimmed, { shouldDirty: true, shouldTouch: true })

            // Only patch if we have an ID
            if (sheet?._id) {
                const body: PatchSheetBody = { [field]: trimmed }
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
            const trimmed = trimValues(values)
            const entries = Object.entries(trimmed) as Array<[keyof PatchSheetBody, PatchSheetBody[keyof PatchSheetBody]]>
            if (entries.length === 0) return

            for (const [field, value] of entries) {
                setValue(field, value, { shouldDirty: true, shouldTouch: true })
            }

            if (sheet?._id) {
                patch(trimmed, {
                    onSuccess: (updated) => {
                        if (trimmed.name && updated?.slug && updated.slug !== sheet.slug) {
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
        patchField,
        patchFields,
        isSaving: isPending
    }
}

