"use client"

import { useTriggerLongRest } from "../api/character-sheets-queries"

export function useLongRest(sheetId: string) {
    const { mutate, isPending, isSuccess } = useTriggerLongRest(sheetId)

    const applyLongRest = () => mutate()

    return { applyLongRest, isPending, isSuccess }
}
