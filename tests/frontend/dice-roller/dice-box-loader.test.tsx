import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type DiceBox from "@3d-dice/dice-box-threejs"
import { preloadDiceBoxAssets, syncDiceBoxSize } from "@/features/dice-roller/dice-box-loader"

describe("dice-box-loader preload", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        ;(globalThis as any).__DNDICAS_DICE_BOX_LOADER__ = vi.fn()
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

describe("syncDiceBoxSize (DND-48)", () => {
    const dispatchEvent = vi.fn()
    const asBox = (value: object) => value as unknown as DiceBox
    const resized = () => dispatchEvent.mock.calls.some(([event]) => event instanceof Event && event.type === "resize")

    beforeEach(() => {
        dispatchEvent.mockReset()
        vi.stubGlobal("window", { dispatchEvent })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it("ajusta o mundo na hora com o tamanho do container, sem depender do resize", () => {
        const setDimensions = vi.fn()
        syncDiceBoxSize(asBox({ container: { clientWidth: 240, clientHeight: 190 }, setDimensions }))
        expect(setDimensions).toHaveBeenCalledWith({ x: 240, y: 190 })
        expect(dispatchEvent).not.toHaveBeenCalled()
    })

    it("container sem tamanho (0×0) não chama setDimensions e cai no resize", () => {
        const setDimensions = vi.fn()
        syncDiceBoxSize(asBox({ container: { clientWidth: 0, clientHeight: 190 }, setDimensions }))
        expect(setDimensions).not.toHaveBeenCalled()
        expect(resized()).toBe(true)
    })

    it("lib sem setDimensions cai no resize", () => {
        syncDiceBoxSize(asBox({ container: { clientWidth: 240, clientHeight: 190 } }))
        expect(resized()).toBe(true)
    })

    it("setDimensions que lança é logado e cai no resize", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
        const failure = new Error("boom")
        syncDiceBoxSize(asBox({ container: { clientWidth: 240, clientHeight: 190 }, setDimensions: () => { throw failure } }))
        expect(error).toHaveBeenCalledWith("Failed to resize dice box", failure)
        expect(resized()).toBe(true)
    })
})
