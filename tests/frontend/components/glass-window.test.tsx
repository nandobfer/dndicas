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

describe("GlassWindow no WindowProvider", () => {
    let offsetWidth: ReturnType<typeof vi.spyOn> | undefined

    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 })
    })

    afterEach(() => {
        offsetWidth?.mockRestore()
        offsetWidth = undefined
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
