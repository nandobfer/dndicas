import "server-only"

import type { DiceRollRequest } from "../types"
import { rollDice } from "./dice-engine"
import type { DiceTarget } from "./dice-target"
import { consumeDiceOverride, listDiceOverrides } from "./dice-override-service"

export async function rollGeneralDice(input: DiceRollRequest, target: DiceTarget) {
    const pendingOverrides = await listDiceOverrides(target)
    const matchingOverride = input.terms
        .filter((term) => term.quantity > 0)
        .map((term) => pendingOverrides.find((override) => override.dice === term.dice))
        .find(Boolean) ?? null
    const result = rollDice(input, { override: matchingOverride ?? undefined })

    if (matchingOverride) {
        await consumeDiceOverride(matchingOverride.id)
    }

    return result
}
