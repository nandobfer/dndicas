interface ChunkRecoveryLocation {
    pathname: string
    search: string
    reload: () => void
}

interface ChunkRecoveryStorage {
    getItem: (key: string) => string | null
    removeItem: (key: string) => void
    setItem: (key: string, value: string) => void
}

interface ChunkRecoveryWindow {
    location: ChunkRecoveryLocation
    sessionStorage: ChunkRecoveryStorage
}

const CHUNK_LOAD_RELOAD_PREFIX = "chunk-load-reload"
const chunkLoadErrorPatterns = [
    "chunkloaderror",
    "loading chunk",
    "failed to fetch dynamically imported module",
    "/_next/static/chunks/",
]

function getChunkLoadErrorMessage(error: unknown): string {
    if (typeof error === "string") {
        return error
    }

    if (error instanceof Error) {
        return `${error.name} ${error.message}`.trim()
    }

    if (typeof error === "object" && error !== null) {
        const errorName = "name" in error && typeof error.name === "string" ? error.name : ""
        const errorMessage = "message" in error && typeof error.message === "string" ? error.message : ""
        return `${errorName} ${errorMessage}`.trim()
    }

    return ""
}

export function isRecoverableChunkLoadError(error: unknown): boolean {
    const normalizedMessage = getChunkLoadErrorMessage(error).toLowerCase()
    return chunkLoadErrorPatterns.some((pattern) => normalizedMessage.includes(pattern))
}

export function getChunkLoadReloadKey(pathname: string, search: string): string {
    return `${CHUNK_LOAD_RELOAD_PREFIX}:${pathname}${search}`
}

export function clearChunkLoadReloadFlag(windowObject: ChunkRecoveryWindow): void {
    windowObject.sessionStorage.removeItem(
        getChunkLoadReloadKey(windowObject.location.pathname, windowObject.location.search)
    )
}

export function recoverFromChunkLoadError(windowObject: ChunkRecoveryWindow): boolean {
    const storageKey = getChunkLoadReloadKey(windowObject.location.pathname, windowObject.location.search)

    if (windowObject.sessionStorage.getItem(storageKey) === "pending") {
        return false
    }

    windowObject.sessionStorage.setItem(storageKey, "pending")
    windowObject.location.reload()
    return true
}
