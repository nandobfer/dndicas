export interface DiceTargetInput {
    userId?: string | null
    diceSessionId?: string | null
}

export interface DiceTarget {
    scope: "local"
    targetId: string
}

export function resolveGeneralDiceTarget(input: DiceTargetInput): DiceTarget | null {
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
