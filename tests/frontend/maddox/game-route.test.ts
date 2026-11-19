import { describe, expect, it } from "vitest"
import { isMaddoxGamePath } from "@/features/maddox/game-route"

describe("isMaddoxGamePath", () => {
    it.each(["/campanhas/abc123/mesa", "/campanhas/abc123/mesa/"])("reconhece a mesa em %s", (path) => {
        expect(isMaddoxGamePath(path)).toBe(true)
    })

    it.each([
        "/campanhas",
        "/campanhas/abc123",
        "/campanhas/abc123/diario",
        "/campanhas/abc123/entrevista/personagem",
        "/campanhas/convite/tok",
        "/campanhas/abc/mesa/extra",
        "/x/campanhas/abc/mesa",
        "",
    ])("não trata %s como mesa", (path) => {
        expect(isMaddoxGamePath(path)).toBe(false)
    })

    it("sem caminho não é mesa", () => {
        expect(isMaddoxGamePath(null)).toBe(false)
        expect(isMaddoxGamePath(undefined)).toBe(false)
    })
})
