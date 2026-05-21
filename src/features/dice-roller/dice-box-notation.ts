import type { DiceRollMode, DiceRollResponse, DiceTerm, DiceType } from "./types"

export type VisualRollRole = "single" | "kept" | "discarded"

export interface VisualDie {
    dice: Exclude<DiceType, "d100">
    sourceDice: DiceType
    value?: number | null
    rollRole: VisualRollRole
}

const DICE_BOX_ROLL_BOOST = "!!"

const MAX_DICE_FACE: Record<DiceType, number> = {
    d4: 4,
    d6: 6,
    d8: 8,
    d10: 10,
    d12: 12,
    d20: 20,
    d100: 100,
}

function isSingleD20(terms: DiceTerm[]) {
    return terms.length === 1 && terms[0]?.dice === "d20" && terms[0]?.quantity === 1
}

function expandD100(value?: number | null): VisualDie[] {
    if (typeof value !== "number") {
        return [
            { dice: "d10", sourceDice: "d100", rollRole: "single" },
            { dice: "d10", sourceDice: "d100", rollRole: "single" },
        ]
    }

    const clampedValue = Math.max(1, Math.min(100, value))
    const tens = clampedValue === 100 ? 10 : Math.floor(clampedValue / 10) || 10
    const ones = clampedValue % 10 || 10

    return [
        { dice: "d10", sourceDice: "d100", value: tens, rollRole: "single" },
        { dice: "d10", sourceDice: "d100", value: ones, rollRole: "single" },
    ]
}

function expandDie(dice: DiceType, value?: number | null, rollRole: VisualRollRole = "single"): VisualDie[] {
    if (dice === "d100") {
        return expandD100(value)
    }

    return [{ dice, sourceDice: dice, value, rollRole }]
}

function buildNotationFromVisualDice(dice: VisualDie[], boost = "") {
    const notation = dice.map((die) => `1${die.dice}`).join("+")
    const values = dice.map((die) => die.value).filter((value): value is number => typeof value === "number")

    if (!notation || values.length !== dice.length) {
        return null
    }

    return `${notation}@${values.join(",")}${boost}`
}

export function expandVisualTerms(terms: DiceTerm[], mode: DiceRollMode): VisualDie[] {
    if (mode !== "normal" && isSingleD20(terms)) {
        return [
            { dice: "d20", sourceDice: "d20", rollRole: "kept" },
            { dice: "d20", sourceDice: "d20", rollRole: "discarded" },
        ]
    }

    return terms.flatMap((term) => Array.from({ length: term.quantity }, () => expandDie(term.dice)).flat())
}

export function expandStandbyVisualTerms(terms: DiceTerm[], mode: DiceRollMode): VisualDie[] {
    if (mode !== "normal" && isSingleD20(terms)) {
        return [
            { dice: "d20", sourceDice: "d20", value: MAX_DICE_FACE.d20, rollRole: "kept" },
            { dice: "d20", sourceDice: "d20", value: MAX_DICE_FACE.d20, rollRole: "discarded" },
        ]
    }

    return terms.flatMap((term) => (
        Array.from({ length: term.quantity }, () => expandDie(term.dice, MAX_DICE_FACE[term.dice])).flat()
    ))
}

export function expandVisualResult(result: DiceRollResponse): VisualDie[] {
    if (result.selectedD20 && result.selectedD20.discarded !== undefined && result.terms.length === 1 && result.terms[0]?.dice === "d20") {
        return [
            { dice: "d20", sourceDice: "d20", value: result.selectedD20.kept, rollRole: "kept" },
            { dice: "d20", sourceDice: "d20", value: result.selectedD20.discarded, rollRole: "discarded" },
        ]
    }

    let primaryD20Applied = false

    return result.terms.flatMap((term) => term.results.flatMap((value) => {
        if (term.dice === "d20" && result.selectedD20 && !primaryD20Applied) {
            primaryD20Applied = true
            return expandDie(term.dice, result.selectedD20.kept)
        }

        return expandDie(term.dice, value)
    }))
}

export function buildDiceBoxNotation(result: DiceRollResponse) {
    return buildNotationFromVisualDice(expandVisualResult(result), DICE_BOX_ROLL_BOOST)
}

export function buildDiceBoxStandbyNotation(terms: DiceTerm[], mode: DiceRollMode) {
    return buildNotationFromVisualDice(expandStandbyVisualTerms(terms, mode))
}
