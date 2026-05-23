export interface DiceTargetInput {
    userId?: string | null
    diceSessionId?: string | null
    owlbearPlayerId?: string | null
}

export interface DiceTarget {
    scope: "local" | "owlbear"
    targetId: string
}

export function normalizeDiceTargetPlayerId(owlbearPlayerId: string) {
    return owlbearPlayerId.trim()
}

export function resolveGeneralDiceTarget(input: DiceTargetInput): DiceTarget | null {
    const owlbearPlayerId = input.owlbearPlayerId?.trim()

    if (owlbearPlayerId) {
        return {
            scope: "owlbear",
            targetId: `player:${normalizeDiceTargetPlayerId(owlbearPlayerId)}`,
        }
    }

    if (input.userId) {
        return {
            scope: "local",
            targetId: `user:${input.userId}`,
        }
    }

    const diceSessionId = input.diceSessionId?.trim()
    if (!diceSessionId) return null

    return {
        scope: "local",
        targetId: `local:${diceSessionId}`,
    }
}
