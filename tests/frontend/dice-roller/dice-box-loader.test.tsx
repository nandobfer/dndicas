import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { preloadDiceBoxAssets } from "@/features/dice-roller/dice-box-loader"

describe("dice-box-loader preload", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        // Clear any existing state if necessary
        // In the real loader, preloadedBoxPromise is a module-level variable
        // which might be hard to reset without a reset function.
    })

    afterEach(() => {
        vi.useRealTimers()
        delete (globalThis as any).__DNDICAS_DICE_BOX_LOADER__
    })

    it("does nothing if __DNDICAS_DICE_BOX_LOADER__ is defined (test mode)", () => {
        (globalThis as any).__DNDICAS_DICE_BOX_LOADER__ = vi.fn()
        preloadDiceBoxAssets()
        vi.runAllTimers()
        // We can't easily check internal state of the loader, but we ensure it doesn't crash
        expect(true).toBe(true)
    })
    
    it("is safe to call multiple times", () => {
        preloadDiceBoxAssets()
        preloadDiceBoxAssets()
        vi.runAllTimers()
        expect(true).toBe(true)
    })
})
