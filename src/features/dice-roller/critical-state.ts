import type { DiceCriticalState, DiceRollResponse } from "./types"

const isSingleD20Result = (result: DiceRollResponse) => (
    result.terms.length === 1
    && result.terms[0]?.dice === "d20"
    && result.terms[0]?.quantity === 1
)

export const getDiceCriticalState = (result: DiceRollResponse | null): DiceCriticalState | null => {
    if (!result || !isSingleD20Result(result)) {
        return null
    }

    const keptValue = result.selectedD20?.kept ?? result.terms[0]?.results[0]
    if (keptValue === 20) {
        return "critical-success"
    }
    if (keptValue === 1) {
        return "critical-failure"
    }

    return null
}
