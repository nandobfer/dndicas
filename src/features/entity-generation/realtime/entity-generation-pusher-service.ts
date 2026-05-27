import "server-only"

import { PusherService } from "@/core/realtime/pusher-service"
import type { EntityGenerationProgress } from "../types/entity-generation.types"
import {
    ENTITY_GENERATION_PUSHER_EVENTS,
    getEntityGenerationChannelName,
    type EntityGenerationFailurePayload,
    type EntityGenerationProgressPayload,
} from "./entity-generation-pusher"

export class EntityGenerationPusherService {
    private static instance: EntityGenerationPusherService | null = null

    static getInstance(): EntityGenerationPusherService {
        if (!EntityGenerationPusherService.instance) {
            EntityGenerationPusherService.instance = new EntityGenerationPusherService(PusherService.getInstance())
        }

        return EntityGenerationPusherService.instance
    }

    private constructor(private readonly pusher: PusherService) {}

    async publishProgress(runId: string, progress: EntityGenerationProgress) {
        const payload: EntityGenerationProgressPayload = {
            ...progress,
            serverTimestamp: new Date().toISOString(),
        }

        await this.pusher.trigger(getEntityGenerationChannelName(runId), ENTITY_GENERATION_PUSHER_EVENTS.progress, payload)
    }

    async publishFailure(runId: string, message: string) {
        const payload: EntityGenerationFailurePayload = {
            message,
            serverTimestamp: new Date().toISOString(),
        }

        await this.pusher.trigger(getEntityGenerationChannelName(runId), ENTITY_GENERATION_PUSHER_EVENTS.failure, payload)
    }
}
