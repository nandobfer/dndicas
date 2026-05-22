export const PUSHER_ORIGIN_HEADER = "x-pusher-origin"

const PUSHER_ORIGIN_STORAGE_KEY = "dndicas.pusher.origin"

let cachedOriginId: string | null = null

/**
 * Returns a stable origin id for the current browser tab.
 *
 * The id is attached to character-sheet mutations so realtime consumers can
 * ignore their own echoed events while still receiving updates from other tabs
 * and users.
 */
export function getOrCreatePusherOriginId(): string | undefined {
    if (typeof window === "undefined") return undefined
    if (cachedOriginId) return cachedOriginId

    const fromStorage = window.sessionStorage.getItem(PUSHER_ORIGIN_STORAGE_KEY)
    if (fromStorage) {
        cachedOriginId = fromStorage
        return cachedOriginId
    }

    const created = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    window.sessionStorage.setItem(PUSHER_ORIGIN_STORAGE_KEY, created)
    cachedOriginId = created
    return created
}

/**
 * Builds the optional request header used to track which browser tab originated
 * a character-sheet mutation.
 */
export function buildPusherOriginHeader(): HeadersInit {
    const originId = getOrCreatePusherOriginId()
    return originId ? { [PUSHER_ORIGIN_HEADER]: originId } : {}
}
