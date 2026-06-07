import { DICE_TYPES, type DiceTerm, type DiceType } from "../types"

const HP_DICE_TOKEN_REGEX = /^(\d*)d(\d+)$/i
const PURE_NUMBER_REGEX = /^\d+$/
const SIMPLE_HP_EXPRESSION_REGEX = /^[\dd+\-\s]+$/i

function toDiceType(faces: string): DiceType | null {
    const dice = `d${faces}` as DiceType
    return DICE_TYPES.includes(dice) ? dice : null
}

export interface ParsedHpDiceFormula {
    terms: DiceTerm[]
    modifier: number
}

export function parseStaticHpValue(formula: string): number | null {
    const normalized = formula.trim()
    if (!PURE_NUMBER_REGEX.test(normalized)) return null

    const value = Number(normalized)
    return Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function parseHpDiceFormula(formula: string): ParsedHpDiceFormula | null {
    const normalized = formula.trim().toLowerCase()
    if (!normalized || !normalized.includes("d") || !SIMPLE_HP_EXPRESSION_REGEX.test(normalized)) {
        return null
    }

    const parts = normalized.replace(/\s+/g, "").match(/[+-]?[^+-]+/g)
    if (!parts?.length) return null

    const termsByDice = new Map<DiceType, number>()
    let modifier = 0

    for (const part of parts) {
        const sign = part.startsWith("-") ? -1 : 1
        const token = part.startsWith("+") || part.startsWith("-") ? part.slice(1) : part
        if (!token) return null

        if (PURE_NUMBER_REGEX.test(token)) {
            modifier += sign * Number(token)
            continue
        }

        const diceMatch = token.match(HP_DICE_TOKEN_REGEX)
        if (!diceMatch) return null

        const quantity = diceMatch[1] ? Number(diceMatch[1]) : 1
        const dice = toDiceType(diceMatch[2])
        if (!dice || !Number.isSafeInteger(quantity) || quantity <= 0 || sign < 0) {
            return null
        }

        termsByDice.set(dice, (termsByDice.get(dice) ?? 0) + quantity)
    }

    const terms = Array.from(termsByDice.entries()).map(([dice, quantity]) => ({ dice, quantity }))
    return terms.length > 0 ? { terms, modifier } : null
}
