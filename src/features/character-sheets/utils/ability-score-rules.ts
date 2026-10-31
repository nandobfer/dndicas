import type { AttributeType } from "../types/character-sheet.types"

/**
 * Regras dos métodos de atributos do D&D usadas pela ficha (criação assistida) e pela entrevista do Maddox — módulo
 * PURO (sem React nem "use client"), importável pelo servidor.
 */

export const ABILITY_SCORE_KEYS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const satisfies AttributeType[]

export const STANDARD_ARRAY_VALUES = [15, 14, 13, 12, 10, 8] as const
export const POINT_BUY_BUDGET = 27
export const POINT_BUY_COSTS: Record<number, number> = {
    8: 0,
    9: 1,
    10: 2,
    11: 3,
    12: 4,
    13: 5,
    14: 7,
    15: 9,
}

export function getPointBuyCost(scores: Partial<Record<AttributeType, number>>) {
    return ABILITY_SCORE_KEYS.reduce((total, attr) => total + (POINT_BUY_COSTS[scores[attr] ?? 8] ?? Number.POSITIVE_INFINITY), 0)
}

export function isValidPointBuy(scores: Partial<Record<AttributeType, number>>) {
    return ABILITY_SCORE_KEYS.every((attr) => {
        const value = scores[attr]
        return typeof value === "number" && value >= 8 && value <= 15 && Number.isFinite(POINT_BUY_COSTS[value])
    }) && getPointBuyCost(scores) <= POINT_BUY_BUDGET
}

/** 4d6 descartando o menor. */
export function calculateDropLowestScore(results: number[]) {
    if (results.length !== 4) return null
    const sorted = [...results].sort((a, b) => a - b)
    return sorted.slice(1).reduce((total, value) => total + value, 0)
}

/** Sexta pontuação da rolagem: 72 − a soma das cinco primeiras (`null` fora de 3–18). */
export function calculateFinalDiceScore(firstFiveScores: number[]) {
    if (firstFiveScores.length !== 5) return null
    const finalScore = 72 - firstFiveScores.reduce((total, value) => total + value, 0)
    return finalScore >= 3 && finalScore <= 18 ? finalScore : null
}
