import { describe, expect, it, vi } from "vitest"

import {
    clearChunkLoadReloadFlag,
    getChunkLoadReloadKey,
    isRecoverableChunkLoadError,
    recoverFromChunkLoadError,
} from "@/core/utils/chunk-load-recovery"

function createStorage() {
    const values = new Map<string, string>()

    return {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => {
            values.delete(key)
        },
        setItem: (key: string, value: string) => {
            values.set(key, value)
        },
    }
}

describe("chunk load recovery", () => {
    it("detects recoverable Next.js chunk loading errors", () => {
        expect(isRecoverableChunkLoadError(new Error("ChunkLoadError: Failed to load chunk /_next/static/chunks/app.js"))).toBe(true)
        expect(isRecoverableChunkLoadError("Failed to fetch dynamically imported module")).toBe(true)
        expect(isRecoverableChunkLoadError(new Error("Network Error"))).toBe(false)
    })

    it("reloads only once per route when a chunk error is detected", () => {
        const reload = vi.fn()
        const storage = createStorage()
        const windowObject = {
            location: {
                pathname: "/sheets/kael",
                search: "",
                reload,
            },
            sessionStorage: storage,
        }

        expect(recoverFromChunkLoadError(windowObject)).toBe(true)
        expect(reload).toHaveBeenCalledTimes(1)
        expect(storage.getItem(getChunkLoadReloadKey("/sheets/kael", ""))).toBe("pending")

        expect(recoverFromChunkLoadError(windowObject)).toBe(false)
        expect(reload).toHaveBeenCalledTimes(1)

        clearChunkLoadReloadFlag(windowObject)

        expect(recoverFromChunkLoadError(windowObject)).toBe(true)
        expect(reload).toHaveBeenCalledTimes(2)
    })
})
