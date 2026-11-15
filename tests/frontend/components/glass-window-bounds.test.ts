import { describe, expect, it } from "vitest"
import {
    HEADER_FALLBACK_HEIGHT,
    clampWindowPosition,
    getHeaderBottom,
    getMaxWindowHeight,
    getWindowDragBounds,
} from "@/components/ui/glass-window-bounds"

describe("getWindowDragBounds", () => {
    it("vai da borda esquerda até a tela menos a largura da janela, com Y travado no header", () => {
        expect(getWindowDragBounds({ viewportWidth: 1280, windowWidth: 400, headerBottom: 64 })).toEqual({
            left: 0,
            right: 880,
            top: 64,
            bottom: 64,
        })
    })

    it("não deixa o limite da direita negativo quando a janela é mais larga que a tela", () => {
        expect(getWindowDragBounds({ viewportWidth: 300, windowWidth: 450, headerBottom: 64 }).right).toBe(0)
    })

    it("sem a largura medida, a janela pode ir até a largura da tela", () => {
        expect(getWindowDragBounds({ viewportWidth: 1024, windowWidth: 0, headerBottom: 64 }).right).toBe(1024)
    })
})

describe("clampWindowPosition", () => {
    const bounds = getWindowDragBounds({ viewportWidth: 1280, windowWidth: 400, headerBottom: 64 })

    it("traz x negativo para a borda esquerda", () => {
        expect(clampWindowPosition({ x: -40, y: 64 }, bounds)).toEqual({ x: 0, y: 64 })
    })

    it("traz x além da borda direita para o limite", () => {
        expect(clampWindowPosition({ x: 5000, y: 64 }, bounds)).toEqual({ x: 880, y: 64 })
    })

    it("mantém o x dentro dos limites e aceita a borda exata", () => {
        expect(clampWindowPosition({ x: 0, y: 64 }, bounds).x).toBe(0)
        expect(clampWindowPosition({ x: 880, y: 64 }, bounds).x).toBe(880)
        expect(clampWindowPosition({ x: 300, y: 64 }, bounds).x).toBe(300)
    })

    it("sempre trava o y no fim do header, inclusive valores antigos acima dele", () => {
        expect(clampWindowPosition({ x: 100, y: 0 }, bounds).y).toBe(64)
        expect(clampWindowPosition({ x: 100, y: 50 }, bounds).y).toBe(64)
        expect(clampWindowPosition({ x: 100, y: 500 }, bounds).y).toBe(64)
    })

    it("trata x inválido como a borda esquerda", () => {
        expect(clampWindowPosition({ x: Number.NaN, y: 0 }, bounds).x).toBe(0)
    })
})

describe("getHeaderBottom", () => {
    it("usa 64 fora do navegador ou sem header", () => {
        expect(getHeaderBottom(undefined)).toBe(HEADER_FALLBACK_HEIGHT)
        const doc = { querySelector: () => null } as unknown as Document
        expect(getHeaderBottom(doc)).toBe(64)
    })

    it("usa o fim medido do header", () => {
        const header = { getBoundingClientRect: () => ({ bottom: 72 }) }
        const doc = { querySelector: (selector: string) => (selector === "[data-app-header]" ? header : null) } as unknown as Document
        expect(getHeaderBottom(doc)).toBe(72)
    })

    it("cai para 64 quando o header não tem altura (oculto)", () => {
        const header = { getBoundingClientRect: () => ({ bottom: 0 }) }
        const doc = { querySelector: () => header } as unknown as Document
        expect(getHeaderBottom(doc)).toBe(64)
    })
})

describe("getMaxWindowHeight", () => {
    it("limita a altura ao espaço entre o header e a parte de baixo da tela", () => {
        expect(getMaxWindowHeight(64)).toBe("calc(100dvh - 64px)")
    })
})
