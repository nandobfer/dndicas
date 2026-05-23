import type { DiceRollResponse } from "@/features/dice-roller/types"

export const OWLBEAR_DICE_PUSHER_EVENTS = {
    rollResolved: "owlbear.dice.roll.resolved",
} as const

export interface OwlbearDiceRollResolvedEventPayload {
    roomId: string
    playerName: string
    result: DiceRollResponse
    originId?: string
    serverTimestamp: string
}

export function getOwlbearDiceChannelName(roomId: string) {
    return `owlbear.room.${roomId}.dice`
}
