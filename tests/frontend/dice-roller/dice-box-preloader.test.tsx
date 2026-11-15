/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs"
import path from "node:path"
import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DiceBoxPreloader } from "@/features/dice-roller/components/dice-box-preloader"
import { DICE_BOX_PRELOAD_DELAY_MS, DICE_BOX_WARM_TARGET, getDiceBoxPoolStats, resetDiceBoxPoolForTests } from "@/features/dice-roller/dice-box-loader"

const constructed = vi.fn()

function installFakeLoader() {
    globalThis.__DNDICAS_DICE_BOX_LOADER__ = async () =>
        class FakeDiceBox {
            clearDice = vi.fn()
            constructor(container: string) {
                constructed(container)
            }
            async initialize() {}
            async roll() {
                return []
            }
        } as unknown as never
}

describe("DiceBoxPreloader (DND-61)", () => {
    const idleCallbacks: Array<() => void> = []

    beforeEach(() => {
        constructed.mockReset()
        idleCallbacks.length = 0
        vi.useFakeTimers()
        vi.stubGlobal("requestIdleCallback", vi.fn((callback: () => void) => idleCallbacks.push(callback)))
        delete globalThis.__DNDICAS_DICE_BOX_LOADER__
        resetDiceBoxPoolForTests()
    })

    afterEach(() => {
        resetDiceBoxPoolForTests()
        delete globalThis.__DNDICAS_DICE_BOX_LOADER__
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("fica montado no root layout, que cobre o site e o Owlbear", () => {
        const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8")
        expect(layout).toContain('import { DiceBoxPreloader } from "@/features/dice-roller/components/dice-box-preloader"')
        expect(layout).toMatch(/<body[\s\S]*<DiceBoxPreloader \/>[\s\S]*<\/body>/)
    })

    it("agenda o aquecimento uma vez só, depois do atraso do boot, mesmo montado várias vezes", () => {
        const { rerender, unmount } = render(<DiceBoxPreloader />)
        rerender(<DiceBoxPreloader />)
        render(<DiceBoxPreloader />)
        expect(requestIdleCallback).not.toHaveBeenCalled()

        vi.advanceTimersByTime(DICE_BOX_PRELOAD_DELAY_MS)
        expect(requestIdleCallback).toHaveBeenCalledTimes(1)

        unmount()
        render(<DiceBoxPreloader />)
        vi.advanceTimersByTime(DICE_BOX_PRELOAD_DELAY_MS * 2)
        expect(requestIdleCallback).toHaveBeenCalledTimes(1)
    })

    it("boot → idle → aquece o motor e depois o de reserva, um de cada vez", async () => {
        render(<DiceBoxPreloader />)
        // O loader falso entra depois do agendamento: com ele ligado o preload não agenda (modo de teste).
        installFakeLoader()
        vi.advanceTimersByTime(DICE_BOX_PRELOAD_DELAY_MS)
        expect(idleCallbacks).toHaveLength(1)

        idleCallbacks.shift()?.()
        expect(getDiceBoxPoolStats().warming).toBe(1)
        await vi.waitFor(() => expect(getDiceBoxPoolStats().idle).toBe(1))
        expect(constructed).toHaveBeenCalledTimes(1)

        // A reserva espera outro idle: nunca dois `initialize` juntos.
        await vi.waitFor(() => expect(idleCallbacks).toHaveLength(1))
        idleCallbacks.shift()?.()
        await vi.waitFor(() => expect(getDiceBoxPoolStats().idle).toBe(DICE_BOX_WARM_TARGET))
        expect(constructed).toHaveBeenCalledTimes(DICE_BOX_WARM_TARGET)
    })
})
