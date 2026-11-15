import type { DiceTerm, DiceType } from "./types"

/**
 * Vantagem/desvantagem valem no d20 principal: o primeiro termo é um d20 só e nenhum outro termo é d20. Dados extras de
 * outro tipo (Orientação, +1d4, DND-69) não tiram o modo.
 */
export function hasPrimaryD20(terms: ReadonlyArray<{ dice: DiceType; quantity: number }>) {
    return terms[0]?.dice === "d20" && terms[0]?.quantity === 1 && terms.slice(1).every((term) => term.dice !== "d20")
}

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
