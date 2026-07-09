import { ENTITY_UNDERSTANDING_IDLE_TTL_MS } from "../types/entity-understanding.types"
import type { EntityUnderstandingMessage } from "../types/entity-understanding.types"

const STORAGE_PREFIX = "entity-understanding:chat"
const STORAGE_VERSION = 1

interface PersistedChatSession {
    version: number
    messages: EntityUnderstandingMessage[]
    lastActivity: number
}

function storageKey(entityType: string, entityId: string): string {
    return `${STORAGE_PREFIX}:${entityType}:${entityId}`
}

export function loadChatSession(
    entityType: string,
    entityId: string,
): { messages: EntityUnderstandingMessage[]; lastActivity: number } | null {
    if (typeof window === "undefined") return null

    try {
        const raw = window.localStorage.getItem(storageKey(entityType, entityId))
        if (!raw) return null

        const parsed = JSON.parse(raw) as PersistedChatSession
        if (parsed.version !== STORAGE_VERSION) return null
        if (!Array.isArray(parsed.messages)) return null

        const isExpired = Date.now() - parsed.lastActivity > ENTITY_UNDERSTANDING_IDLE_TTL_MS
        if (isExpired) {
            clearChatSession(entityType, entityId)
            return null
        }

        return { messages: parsed.messages, lastActivity: parsed.lastActivity }
    } catch {
        return null
    }
}

export function saveChatSession(
    entityType: string,
    entityId: string,
    messages: EntityUnderstandingMessage[],
    lastActivity: number,
): void {
    if (typeof window === "undefined") return

    try {
        const session: PersistedChatSession = {
            version: STORAGE_VERSION,
            messages,
            lastActivity,
        }
        window.localStorage.setItem(storageKey(entityType, entityId), JSON.stringify(session))
    } catch {
        // LocalStorage can be full or blocked in restricted private mode.
    }
}

export function clearChatSession(entityType: string, entityId: string): void {
    if (typeof window === "undefined") return

    try {
        window.localStorage.removeItem(storageKey(entityType, entityId))
    } catch {
        // Ignore removal failures.
    }
}
