import type { DiceTerm, DiceType } from "./types"

export const getDiceFaces = (dice: DiceType) => Number.parseInt(dice.slice(1), 10)

export function clampDiceValue(dice: DiceType, value: number) {
    const faces = getDiceFaces(dice)
    return Math.min(faces, Math.max(1, Math.trunc(value)))
}

export function formatDiceFormula(terms: DiceTerm[], modifier = 0) {
    const diceFormula = terms.map((term) => `${term.quantity}${term.dice}`).join(" + ")
    if (!modifier) return diceFormula
    return `${diceFormula} ${modifier >= 0 ? "+" : "-"} ${Math.abs(modifier)}`
}
