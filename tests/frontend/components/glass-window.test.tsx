/** @vitest-environment happy-dom */
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { WindowProvider, useWindows } from "@/core/context/window-context"

function Opener({ id = "w1", initialPosition }: { id?: string, initialPosition?: { x: number, y: number } }) {
    const { addWindow } = useWindows()
    return (
        <button type="button" onClick={() => addWindow({ id, title: "Janela teste", content: <p>conteúdo</p>, initialPosition })}>
            abrir
        </button>
    )
}

function renderWindows(props: React.ComponentProps<typeof Opener> = {}) {
    return render(
        <WindowProvider>
            <header data-app-header>header</header>
            <Opener {...props} />
        </WindowProvider>
    )
}

function windowElement() {
    const element = document.querySelector<HTMLElement>("[data-glass-window]")
    if (!element) throw new Error("janela não renderizada")
    return element
}

function translate(element: HTMLElement) {
    const transform = element.style.transform
    const x = /translateX\((-?[\d.]+)px\)/.exec(transform)?.[1]
    const y = /translateY\((-?[\d.]+)px\)/.exec(transform)?.[1]
    return { x: x === undefined ? 0 : Number(x), y: y === undefined ? 0 : Number(y) }
}

const originalInnerWidth = window.innerWidth

/** Largura medida "atrasada" (simula a animação da largura); nula usa o estilo aplicado. */
let staleWidth: number | null = null

function resizeBy(corner: "br" | "bl", { dx, dy }: { dx: number, dy: number }) {
    const handle = windowElement().querySelector<HTMLElement>(corner === "br" ? ".cursor-nwse-resize" : ".cursor-nesw-resize")
    if (!handle) throw new Error("alça de redimensionar não encontrada")
    act(() => {
        fireEvent.pointerDown(handle, { clientX: 500, clientY: 500 })
    })
    act(() => {
        document.dispatchEvent(new PointerEvent("pointermove", { clientX: 500 + dx, clientY: 500 + dy }))
    })
    act(() => {
        document.dispatchEvent(new PointerEvent("pointerup", { clientX: 500 + dx, clientY: 500 + dy }))
    })
}

/** Minimiza e restaura: a janela volta da posição gravada no contexto (lastPosition). */
async function expectPersistedX(x: number) {
    fireEvent.click(windowElement().querySelectorAll("button")[0])
    await waitFor(() => expect(screen.getByTestId("glass-windows-taskbar").querySelectorAll("button")).toHaveLength(2))
    fireEvent.click(screen.getByTestId("glass-windows-taskbar").querySelectorAll("button")[0])
    await waitFor(() => {
        const element = screen.getByTestId("glass-windows-layer").querySelector<HTMLElement>("[data-glass-window]")
        expect(element).not.toBeNull()
        expect(translate(element!).x).toBe(x)
    })
}

describe("GlassWindow no WindowProvider", () => {
    let offsetWidth: ReturnType<typeof vi.spyOn> | undefined
    let offsetHeight: ReturnType<typeof vi.spyOn> | undefined

    /** offsetWidth/offsetHeight seguem o estilo aplicado pelo framer-motion (400 × 300 antes de redimensionar). */
    function sizeFromStyle() {
        offsetWidth = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
            if (staleWidth !== null) return staleWidth
            const width = Number.parseFloat(this.style.width)
            return Number.isFinite(width) ? width : 400
        })
        offsetHeight = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
            const height = Number.parseFloat(this.style.height)
            return Number.isFinite(height) ? height : 300
        })
    }

    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 })
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 })
        staleWidth = null
    })

    afterEach(() => {
        offsetWidth?.mockRestore()
        offsetWidth = undefined
        offsetHeight?.mockRestore()
        offsetHeight = undefined
        vi.unstubAllGlobals()
        Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth })
    })

    it("põe as janelas numa camada acima do header e dos FABs, sem bloquear cliques nem recortar a janela", () => {
        renderWindows()

        const layer = screen.getByTestId("glass-windows-layer")
        expect(layer.className).toContain("z-[48]")
        expect(layer.className).toContain("pointer-events-none")
        expect(layer.className).not.toContain("z-[10]")
        expect((layer.firstElementChild as HTMLElement).className).not.toContain("overflow-hidden")

        const taskbar = screen.getByTestId("glass-windows-taskbar")
        expect(taskbar.className).toContain("z-[48]")
        expect(taskbar.className).not.toContain("md:left-20")
    })

    it("abre com x negativo na borda esquerda e o topo travado no fim do header", async () => {
        renderWindows({ initialPosition: { x: -40, y: 10 } })
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))

        await waitFor(() => {
            const element = windowElement()
            expect(element.style.pointerEvents).toBe("auto")
            expect(translate(element)).toEqual({ x: 0, y: 64 })
        })
    })

    it("não deixa a janela passar da borda direita, considerando a largura real", async () => {
        offsetWidth = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(400)
        renderWindows({ initialPosition: { x: 5000, y: 300 } })
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))

        await waitFor(() => {
            expect(translate(windowElement())).toEqual({ x: 880, y: 64 })
        })
    })

    it("usa a altura medida do header como topo", async () => {
        renderWindows({ initialPosition: { x: 200, y: 0 } })
        const header = document.querySelector<HTMLElement>("[data-app-header]")!
        vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ bottom: 80 } as DOMRect)
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))

        await waitFor(() => {
            expect(translate(windowElement())).toEqual({ x: 200, y: 80 })
        })
    })

    it("ao minimizar e restaurar, volta com a posição corrigida (não x < 0 nem acima do header)", async () => {
        renderWindows({ initialPosition: { x: -100, y: 0 } })
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))
        await waitFor(() => expect(translate(windowElement())).toEqual({ x: 0, y: 64 }))

        const minimize = windowElement().querySelectorAll("button")[0]
        fireEvent.click(minimize)
        await waitFor(() => expect(screen.getByTestId("glass-windows-taskbar").querySelectorAll("button")).toHaveLength(2))

        const restore = screen.getByTestId("glass-windows-taskbar").querySelectorAll("button")[0]
        fireEvent.click(restore)

        await waitFor(() => {
            const element = screen.getByTestId("glass-windows-layer").querySelector<HTMLElement>("[data-glass-window]")
            expect(element).not.toBeNull()
            expect(translate(element!)).toEqual({ x: 0, y: 64 })
        })
    })

    it("canto inferior direito: a largura não passa da borda direita e a altura não passa da parte de baixo", async () => {
        sizeFromStyle()
        renderWindows({ initialPosition: { x: 800, y: 0 } })
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))
        await waitFor(() => expect(translate(windowElement())).toEqual({ x: 800, y: 64 }))

        resizeBy("br", { dx: 300, dy: 2000 })

        await waitFor(() => {
            const element = windowElement()
            // 1280 − 800 = 480 de largura máxima; 768 − 64 = 704 de altura máxima.
            expect(element.style.width).toBe("480px")
            expect(element.style.height).toBe("704px")
            expect(translate(element)).toEqual({ x: 800, y: 64 })
        })
    })

    it("canto inferior esquerdo: a borda direita fica parada e o X vai no máximo até 0", async () => {
        sizeFromStyle()
        renderWindows({ initialPosition: { x: 100, y: 0 } })
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))
        await waitFor(() => expect(translate(windowElement())).toEqual({ x: 100, y: 64 }))

        resizeBy("bl", { dx: -300, dy: 0 })

        await waitFor(() => {
            const element = windowElement()
            expect(element.style.width).toBe("500px")
            expect(translate(element)).toEqual({ x: 0, y: 64 })
        })
        await expectPersistedX(0)
    })

    it("canto inferior esquerdo: ao estreitar junto da borda direita, grava o X final com a largura final", async () => {
        sizeFromStyle()
        renderWindows({ initialPosition: { x: 880, y: 0 } })
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))
        await waitFor(() => expect(translate(windowElement())).toEqual({ x: 880, y: 64 }))

        // A largura medida ainda é 400 (a animação não chegou a 300): o X gravado não pode voltar para 880.
        staleWidth = 400
        resizeBy("bl", { dx: 100, dy: 0 })

        await waitFor(() => {
            const element = windowElement()
            expect(element.style.width).toBe("300px")
            expect(translate(element)).toEqual({ x: 980, y: 64 })
        })
        await expectPersistedX(980)
    })

    it("corrige o X quando a tela do navegador fica mais estreita", async () => {
        sizeFromStyle()
        renderWindows({ initialPosition: { x: 800, y: 0 } })
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))
        await waitFor(() => expect(translate(windowElement())).toEqual({ x: 800, y: 64 }))

        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 })
        act(() => {
            window.dispatchEvent(new Event("resize"))
        })

        await waitFor(() => expect(translate(windowElement())).toEqual({ x: 600, y: 64 }))
        await expectPersistedX(600)
    })

    it("corrige o X quando a própria janela fica mais larga (ResizeObserver)", async () => {
        const observers: Array<() => void> = []
        vi.stubGlobal("ResizeObserver", class {
            constructor(private readonly callback: () => void) {
                observers.push(() => this.callback())
            }
            observe() {}
            unobserve() {}
            disconnect() {}
        })
        let measured = 400
        offsetWidth = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => measured)
        renderWindows({ initialPosition: { x: 880, y: 0 } })
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))
        await waitFor(() => expect(translate(windowElement())).toEqual({ x: 880, y: 64 }))

        measured = 600
        act(() => observers.forEach((notify) => notify()))

        await waitFor(() => expect(translate(windowElement())).toEqual({ x: 680, y: 64 }))
        vi.unstubAllGlobals()
    })

    it("no mobile a janela ocupa a largura abaixo do header, sem arraste nem alças de redimensionar", async () => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 })
        renderWindows({ initialPosition: { x: 300, y: 0 } })
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))

        await waitFor(() => {
            const element = windowElement()
            expect(translate(element)).toEqual({ x: 12, y: 76 })
            expect(element.querySelector(".cursor-grab")).toBeNull()
            expect(element.querySelector(".cursor-nwse-resize")).toBeNull()
            expect(element.querySelector(".cursor-nesw-resize")).toBeNull()
        })
    })

    it("fecha a janela pelo X", async () => {
        renderWindows()
        fireEvent.click(screen.getByRole("button", { name: "abrir" }))
        await waitFor(() => expect(screen.getByText("conteúdo")).toBeInTheDocument())

        const close = windowElement().querySelectorAll("button")[1]
        await act(async () => {
            fireEvent.click(close)
        })

        await waitFor(() => expect(screen.queryByText("conteúdo")).not.toBeInTheDocument())
    })
})
