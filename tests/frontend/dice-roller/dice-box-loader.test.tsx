/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type DiceBox from "@3d-dice/dice-box-threejs"
import {
    DICE_BOX_MAX_IDLE,
    DICE_BOX_PRELOAD_DELAY_MS,
    acquireWarmDiceBox,
    getDiceBoxPoolStats,
    getSharedDiceBox,
    preloadDiceBoxAssets,
    releaseSharedDiceBox,
    resetDiceBoxPoolForTests,
    syncDiceBoxSize,
    warmDiceBoxPool,
} from "@/features/dice-roller/dice-box-loader"

const constructed = vi.fn()
const dispose = vi.fn()
const clearDice = vi.fn()

function installFakeLoader() {
    globalThis.__DNDICAS_DICE_BOX_LOADER__ = async () =>
        class FakeDiceBox {
            renderer = { dispose }
            clearDice = clearDice
            constructor(container: string) {
                constructed(container)
            }
            async initialize() {}
            async roll() {
                return []
            }
        } as unknown as never
}

describe("pool de motores (DND-61)", () => {
    beforeEach(() => {
        constructed.mockReset()
        dispose.mockReset()
        clearDice.mockReset()
        installFakeLoader()
        resetDiceBoxPoolForTests()
    })

    afterEach(() => {
        resetDiceBoxPoolForTests()
        delete globalThis.__DNDICAS_DICE_BOX_LOADER__
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    it("reaproveita o motor aquecido: nenhuma construção nova ao pegar", async () => {
        await warmDiceBoxPool(1)
        expect(constructed).toHaveBeenCalledTimes(1)
        const shared = await getSharedDiceBox()
        expect(constructed).toHaveBeenCalledTimes(1)
        expect(getDiceBoxPoolStats()).toEqual({ idle: 0, warming: 0, inUse: 1 })
        expect(shared.container.style.left).toBe("-10000px")
    })

    it("duas superfícies ao mesmo tempo recebem motores diferentes já aquecidos", async () => {
        await warmDiceBoxPool(2)
        expect(constructed).toHaveBeenCalledTimes(2)
        const [first, second] = await Promise.all([getSharedDiceBox(), getSharedDiceBox()])
        expect(first).not.toBe(second)
        expect(constructed).toHaveBeenCalledTimes(2)
    })

    it("liberar devolve o motor ao pool fora da tela e a próxima pegada recebe o mesmo", async () => {
        await warmDiceBoxPool(1)
        const shared = await getSharedDiceBox()
        const stage = document.createElement("div")
        document.body.appendChild(stage)
        stage.appendChild(shared.container)
        shared.container.style.inset = "0"
        shared.container.style.left = "0"

        releaseSharedDiceBox(shared)
        expect(clearDice).toHaveBeenCalled()
        expect(shared.container.parentElement).toBe(document.body)
        expect(shared.container.style.left).toBe("-10000px")
        expect(shared.container.style.width).toBe("450px")
        expect(shared.container.style.height).toBe("260px")
        expect(getDiceBoxPoolStats().idle).toBe(1)

        expect(acquireWarmDiceBox()).toBe(shared)
        expect(constructed).toHaveBeenCalledTimes(1)
    })

    it("pegar durante o aquecimento usa o motor em andamento, sem segunda construção", async () => {
        const warming = warmDiceBoxPool(1)
        expect(getDiceBoxPoolStats().warming).toBe(1)
        const shared = await getSharedDiceBox()
        await warming
        expect(constructed).toHaveBeenCalledTimes(1)
        expect(getDiceBoxPoolStats()).toEqual({ idle: 0, warming: 0, inUse: 1 })
        expect(shared.box).toBeDefined()
    })

    it("com o pool vazio cria na hora, sem esperar o idle", async () => {
        const idle = vi.fn()
        vi.stubGlobal("requestIdleCallback", idle)
        const shared = await getSharedDiceBox()
        expect(constructed).toHaveBeenCalledTimes(1)
        expect(idle).not.toHaveBeenCalled()
        expect(shared.container.isConnected).toBe(true)
    })

    it("pegar um motor repõe a reserva no idle", async () => {
        resetDiceBoxPoolForTests({ autoReplenish: true })
        await warmDiceBoxPool(1)
        const idleCallbacks: Array<() => void> = []
        vi.stubGlobal("requestIdleCallback", (callback: () => void) => idleCallbacks.push(callback))
        await getSharedDiceBox()
        expect(constructed).toHaveBeenCalledTimes(1)
        expect(idleCallbacks).toHaveLength(1)
        idleCallbacks.shift()?.()
        await vi.waitFor(() => expect(getDiceBoxPoolStats().idle).toBe(2 - 1))
        idleCallbacks.splice(0).forEach((callback) => callback())
        await vi.waitFor(() => expect(getDiceBoxPoolStats().idle).toBe(2))
        expect(constructed).toHaveBeenCalledTimes(3)
    })

    it(`acima de ${DICE_BOX_MAX_IDLE} parados, o motor liberado é descartado`, async () => {
        const boxes = await Promise.all(Array.from({ length: DICE_BOX_MAX_IDLE + 1 }, () => getSharedDiceBox()))
        boxes.forEach((shared) => releaseSharedDiceBox(shared))
        expect(getDiceBoxPoolStats()).toEqual({ idle: DICE_BOX_MAX_IDLE, warming: 0, inUse: 0 })
        expect(dispose).toHaveBeenCalledTimes(1)
        expect(boxes[DICE_BOX_MAX_IDLE]!.container.isConnected).toBe(false)
    })

    it("liberar o mesmo motor duas vezes não o duplica no pool", async () => {
        const shared = await getSharedDiceBox()
        releaseSharedDiceBox(shared)
        releaseSharedDiceBox(shared)
        expect(getDiceBoxPoolStats().idle).toBe(1)
        expect(acquireWarmDiceBox()).toBe(shared)
        expect(acquireWarmDiceBox()).toBeNull()
    })

    it("acquireWarmDiceBox devolve null com o pool vazio", () => {
        expect(acquireWarmDiceBox()).toBeNull()
    })
})

describe("preloadDiceBoxAssets (DND-61)", () => {
    beforeEach(() => {
        constructed.mockReset()
        vi.useFakeTimers()
        resetDiceBoxPoolForTests()
    })

    afterEach(() => {
        resetDiceBoxPoolForTests()
        vi.useRealTimers()
        vi.unstubAllGlobals()
        delete globalThis.__DNDICAS_DICE_BOX_LOADER__
    })

    it("não faz nada com o loader de teste", () => {
        installFakeLoader()
        const idle = vi.fn()
        vi.stubGlobal("requestIdleCallback", idle)
        preloadDiceBoxAssets()
        vi.runAllTimers()
        expect(idle).not.toHaveBeenCalled()
        expect(constructed).not.toHaveBeenCalled()
    })

    it("agenda depois do load + atraso e só uma vez, mesmo chamado várias vezes", () => {
        const idle = vi.fn()
        vi.stubGlobal("requestIdleCallback", idle)
        preloadDiceBoxAssets()
        preloadDiceBoxAssets()
        preloadDiceBoxAssets()
        vi.advanceTimersByTime(DICE_BOX_PRELOAD_DELAY_MS - 1)
        expect(idle).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(idle).toHaveBeenCalledTimes(1)
        expect(idle).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ timeout: expect.any(Number) }))
        vi.runAllTimers()
        expect(idle).toHaveBeenCalledTimes(1)
    })

    it("com a página ainda carregando, espera o evento load", () => {
        const idle = vi.fn()
        vi.stubGlobal("requestIdleCallback", idle)
        const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("loading")
        preloadDiceBoxAssets()
        vi.advanceTimersByTime(DICE_BOX_PRELOAD_DELAY_MS * 2)
        expect(idle).not.toHaveBeenCalled()
        readyState.mockReturnValue("complete")
        window.dispatchEvent(new Event("load"))
        vi.advanceTimersByTime(DICE_BOX_PRELOAD_DELAY_MS)
        expect(idle).toHaveBeenCalledTimes(1)
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
