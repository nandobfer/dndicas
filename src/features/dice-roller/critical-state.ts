import { hasPrimaryD20 } from "./dice-utils"
import type { DiceCriticalState, DiceRollResponse } from "./types"

const isSingleD20Result = (result: DiceRollResponse) => (
    result.terms.length === 1
    && result.terms[0]?.dice === "d20"
    && result.terms[0]?.quantity === 1
)

/**
 * Crítico só em rolagens de um d20. `primaryD20` (DND-69, teste do Maddox com Orientação +1d4): os dados extras de outro
 * tipo depois do d20 não tiram o crítico do d20 principal.
 */
export const getDiceCriticalState = (result: DiceRollResponse | null, options: { primaryD20?: boolean } = {}): DiceCriticalState | null => {
    if (!result || !(options.primaryD20 ? hasPrimaryD20(result.terms) : isSingleD20Result(result))) {
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
