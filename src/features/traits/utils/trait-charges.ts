import type { DiceType, DiceValue } from "@/features/spells/types/spells.types"
import type { TraitChargesByLevelRow } from "../types/traits.types"

export const TRAIT_CHARGE_VALUE_PATTERN = /^(?:\d+|\d+d(?:4|6|8|10|12|20))$/i
export const TRAIT_CHARGE_DICE_PATTERN = /^(\d+)(d(?:4|6|8|10|12|20))$/i

export function isValidTraitChargeValue(value: string) {
    return TRAIT_CHARGE_VALUE_PATTERN.test(value)
}

export function parseTraitChargeDice(value: string): DiceValue | null {
    const match = value.match(TRAIT_CHARGE_DICE_PATTERN)
    if (!match) return null

    return {
        quantidade: parseInt(match[1], 10),
        tipo: match[2].toLowerCase() as DiceType,
    }
}

export function sortTraitChargeRows(rows: TraitChargesByLevelRow[]) {
    return [...rows].sort((a, b) => a.level - b.level)
}
