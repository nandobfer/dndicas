import crypto from "node:crypto"
import { clampDiceValue, getDiceFaces } from "../dice-utils"
import type {
    DiceRollMode,
    DiceRollOverrideInput,
    DiceRollRequest,
    DiceRollResponse,
    DiceRollTermResult,
    DiceType,
} from "../types"

type RandomInt = (minInclusive: number, maxExclusive: number) => number

function defaultRandomInt(minInclusive: number, maxExclusive: number) {
    return crypto.randomInt(minInclusive, maxExclusive)
}

function rollDie(dice: DiceType, randomInt: RandomInt) {
    return randomInt(1, getDiceFaces(dice) + 1)
}

function getOverrideValue(dice: DiceType, override: DiceRollOverrideInput | null | undefined, randomInt: RandomInt) {
    if (!override || override.dice !== dice) return null

    if (typeof override.exact === "number") {
        return clampDiceValue(dice, override.exact)
    }

    const faces = getDiceFaces(dice)
    const min = clampDiceValue(dice, override.min ?? 1)
    const max = clampDiceValue(dice, override.max ?? faces)
    const low = Math.min(min, max)
    const high = Math.max(min, max)
    return randomInt(low, high + 1)
}

function buildDiscardedRoll(mode: Exclude<DiceRollMode, "normal">, kept: number, randomInt: RandomInt) {
    if (mode === "advantage") {
        return randomInt(1, kept + 1)
    }

    return randomInt(kept, 21)
}

function canUseD20Mode(input: DiceRollRequest) {
    return input.terms.length === 1 && input.terms[0]?.dice === "d20" && input.terms[0]?.quantity === 1
}

export function rollDice(
    input: DiceRollRequest,
    options: {
        override?: DiceRollOverrideInput | null
        randomInt?: RandomInt
        now?: Date
        rollId?: string
    } = {}
): DiceRollResponse {
    const randomInt = options.randomInt ?? defaultRandomInt
    const modifier = input.modifier ?? 0
    const requestedMode = input.mode ?? "normal"
    const mode = canUseD20Mode(input) ? requestedMode : "normal"
    const now = options.now ?? new Date()
    const terms: DiceRollTermResult[] = []
    let selectedD20: DiceRollResponse["selectedD20"]
    let consumedOverride = false
    let usedPrimaryD20 = false

    for (const term of input.terms) {
        const results: number[] = []

        for (let index = 0; index < term.quantity; index += 1) {
            const isPrimaryD20 = !usedPrimaryD20 && term.dice === "d20"
            const shouldUseOverride: boolean = !consumedOverride && options.override?.dice === term.dice
            const overridden: number | null = shouldUseOverride ? getOverrideValue(term.dice, options.override, randomInt) : null

            if (isPrimaryD20 && mode !== "normal") {
                const kept = overridden ?? rollDie("d20", randomInt)
                const discarded = buildDiscardedRoll(mode, kept, randomInt)
                results.push(kept)
                selectedD20 = {
                    kept,
                    discarded,
                    reason: mode,
                }
                usedPrimaryD20 = true
                consumedOverride = consumedOverride || overridden !== null
                continue
            }

            const result = overridden ?? rollDie(term.dice, randomInt)
            results.push(result)
            consumedOverride = consumedOverride || overridden !== null

            if (isPrimaryD20) {
                selectedD20 = {
                    kept: result,
                    reason: "normal",
                }
                usedPrimaryD20 = true
            }
        }

        terms.push({
            dice: term.dice,
            quantity: term.quantity,
            results,
        })
    }

    const diceTotal = terms.reduce((sum, term) => sum + term.results.reduce((inner, value) => inner + value, 0), 0)

    return {
        rollId: options.rollId ?? crypto.randomUUID(),
        label: input.label,
        terms,
        mode,
        selectedD20,
        diceTotal,
        modifier,
        total: diceTotal + modifier,
        createdAt: now.toISOString(),
    }
}
