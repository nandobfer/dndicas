import { hasPrimaryD20 } from "./dice-utils"
import type { DiceCriticalState, DiceRollResponse } from "./types"

// DND-69: dados extras de outro tipo (Orientação +1d4) não tiram o crítico do d20 principal.
const isSingleD20Result = (result: DiceRollResponse) => hasPrimaryD20(result.terms)

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
