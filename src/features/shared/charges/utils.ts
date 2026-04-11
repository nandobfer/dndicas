import type { DiceType, DiceValue } from "@/features/spells/types/spells.types"
import type { ChargesByLevelRow } from "./types"

export const CHARGE_VALUE_PATTERN = /^(?:\d+|\d+d(?:4|6|8|10|12|20))$/i
export const CHARGE_DICE_PATTERN = /^(\d+)(d(?:4|6|8|10|12|20))$/i

export function isValidChargeValue(value: string) {
    return CHARGE_VALUE_PATTERN.test(value)
}

export function parseChargeDice(value: string): DiceValue | null {
    const match = value.match(CHARGE_DICE_PATTERN)
    if (!match) return null

    return {
        quantidade: parseInt(match[1], 10),
        tipo: match[2].toLowerCase() as DiceType,
    }
}

export function sortChargeRows(rows: ChargesByLevelRow[]) {
    return [...rows].sort((a, b) => a.level - b.level)
}
