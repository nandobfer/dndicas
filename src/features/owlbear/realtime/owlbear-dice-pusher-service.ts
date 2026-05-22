import "server-only"

import { PusherService } from "@/core/realtime/pusher-service"
import { OWLBEAR_DICE_PUSHER_EVENTS, getOwlbearDiceChannelName, type OwlbearDiceRollResolvedEventPayload } from "./owlbear-dice-pusher"
import type { DiceRollResponse } from "@/features/dice-roller/types"

interface PublishOwlbearDiceRollResolvedOptions {
    roomId: string
    playerName: string
    result: DiceRollResponse
    originId?: string
}

export class OwlbearDicePusherService {
    private static instance: OwlbearDicePusherService | null = null

    static getInstance(): OwlbearDicePusherService {
        if (!OwlbearDicePusherService.instance) {
            OwlbearDicePusherService.instance = new OwlbearDicePusherService(PusherService.getInstance())
        }

        return OwlbearDicePusherService.instance
    }

    private constructor(private readonly pusher: PusherService) {}

    getChannelName(roomId: string) {
        return getOwlbearDiceChannelName(roomId)
    }

    async publishRollResolved({ roomId, playerName, result, originId }: PublishOwlbearDiceRollResolvedOptions) {
        const payload: OwlbearDiceRollResolvedEventPayload = {
            roomId,
            playerName,
            result,
            originId,
            serverTimestamp: new Date().toISOString(),
        }

        await this.pusher.trigger(
            this.getChannelName(roomId),
            OWLBEAR_DICE_PUSHER_EVENTS.rollResolved,
            payload
        )
    }
}
