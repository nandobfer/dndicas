/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { APP_HEADER_SELECTOR, DASHBOARD_CONTENT_SELECTOR, dashboardContentRect } from "@/features/integrations/hooks/useMaximizedFrame"

const rect = (top: number, left: number, width: number, height: number) =>
    ({ top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect

function mount(html: string) {
    document.body.innerHTML = html
}

describe("dashboardContentRect", () => {
    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 })
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 })
    })

    afterEach(() => {
        document.body.innerHTML = ""
        vi.restoreAllMocks()
    })

    it("usa os seletores marcados no layout e no header", () => {
        expect(DASHBOARD_CONTENT_SELECTOR).toBe("[data-dashboard-content]")
        expect(APP_HEADER_SELECTOR).toBe("[data-app-header]")
    })

    it("começa abaixo do header fixo mesmo com a página rolada", () => {
        mount('<header data-app-header></header><main data-dashboard-content></main>')
        vi.spyOn(document.querySelector("header")!, "getBoundingClientRect").mockReturnValue(rect(0, 0, 1280, 64))
        // Página rolada: o <main> começa acima da janela e termina bem abaixo dela.
        vi.spyOn(document.querySelector("main")!, "getBoundingClientRect").mockReturnValue(rect(-300, 0, 1280, 2000))
        expect(dashboardContentRect()).toEqual({ top: 64, left: 0, width: 1280, height: 736 })
    })

    it("sem rolagem, segue o topo e a largura do conteúdo", () => {
        mount('<header data-app-header></header><main data-dashboard-content></main>')
        vi.spyOn(document.querySelector("header")!, "getBoundingClientRect").mockReturnValue(rect(0, 0, 1280, 64))
        vi.spyOn(document.querySelector("main")!, "getBoundingClientRect").mockReturnValue(rect(64, 0, 1280, 500))
        expect(dashboardContentRect()).toEqual({ top: 64, left: 0, width: 1280, height: 500 })
    })

    it("sem conteúdo marcado, ocupa a janela abaixo do header", () => {
        mount("<header data-app-header></header>")
        vi.spyOn(document.querySelector("header")!, "getBoundingClientRect").mockReturnValue(rect(0, 0, 1280, 64))
        expect(dashboardContentRect()).toEqual({ top: 64, left: 0, width: 1280, height: 736 })
    })

    it("sem header (catálogo dentro do Owlbear), ocupa a janela inteira", () => {
        mount("<div></div>")
        expect(dashboardContentRect()).toEqual({ top: 0, left: 0, width: 1280, height: 800 })
    })
})
