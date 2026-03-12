"use client"

import { useEffect, useRef, useCallback } from "react"
import { useForm } from "react-hook-form"
import { usePatchSheet } from "../api/character-sheets-queries"
import type { CharacterSheet, PatchSheetBody } from "../types/character-sheet.types"

const AUTO_SAVE_DELAY = 800

export function useSheetAutoSave(sheet: CharacterSheet) {
    const { mutate: patch } = usePatchSheet(sheet._id)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const form = useForm<PatchSheetBody>({
        defaultValues: sheet as PatchSheetBody,
    })

    const { watch, reset } = form

    // Reset form when the sheet changes from outside
    useEffect(() => {
        reset(sheet as PatchSheetBody)
    }, [sheet._id, reset]) // eslint-disable-line react-hooks/exhaustive-deps

    const schedulesSave = useCallback(
        (data: PatchSheetBody) => {
            if (timerRef.current) clearTimeout(timerRef.current)
            timerRef.current = setTimeout(() => {
                patch(data)
            }, AUTO_SAVE_DELAY)
        },
        [patch],
    )

    useEffect(() => {
        const subscription = watch((data) => {
            schedulesSave(data as PatchSheetBody)
        })
        return () => {
            subscription.unsubscribe()
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [watch, schedulesSave])

    return form
}
