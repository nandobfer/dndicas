export const ENTITY_UNDERSTANDING_IDLE_TTL_MS = 24 * 60 * 60 * 1000

export type EntityUnderstandingMode = "initial_summary" | "conversation"

export type EntityUnderstandingRole = "user" | "model"

export interface EntityUnderstandingMessage {
    role: EntityUnderstandingRole
    html: string
}

export interface EntityUnderstandingChatRequest {
    entityType: string
    entityId: string
    entity: unknown
    mode: EntityUnderstandingMode
    messages: EntityUnderstandingMessage[]
}
