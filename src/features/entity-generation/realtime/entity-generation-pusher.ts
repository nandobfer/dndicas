import type { EntityGenerationProgress } from "../types/entity-generation.types"

export const ENTITY_GENERATION_PUSHER_EVENTS = {
    progress: "entity-generation.progress",
    failure: "entity-generation.failure",
} as const

export interface EntityGenerationFailurePayload {
    message: string
    serverTimestamp: string
}

export type EntityGenerationProgressPayload = EntityGenerationProgress & {
    serverTimestamp: string
}

export function getEntityGenerationChannelName(runId: string) {
    return `entity-generation.${runId}`
}
