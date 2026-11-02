import { describe, expect, it } from "vitest"
import { worldAllows, worldCatalogLines, worldCatalogOf } from "@/features/maddox/world-catalog"

describe("povos e classes do mundo (Maddox 8)", () => {
    const humano = { id: "r1", name: "Humano" }
    const anao = { id: "r2", name: "Anão" }

    it("lista vazia aceita qualquer entidade do catálogo", () => {
        expect(worldAllows([], "qualquer")).toBe(true)
        expect(worldAllows([], null)).toBe(true)
    })

    it("lista preenchida aceita só os ids dela; sem id (entidade própria) é recusada", () => {
        expect(worldAllows([humano, anao], "r2")).toBe(true)
        expect(worldAllows([humano, anao], "r3")).toBe(false)
        expect(worldAllows([humano], null)).toBe(false)
    })

    it("normaliza o que vem do banco e descreve as listas para o prompt", () => {
        expect(worldCatalogOf(null)).toEqual({ races: [], classes: [] })
        expect(worldCatalogOf({ races: [humano] })).toEqual({ races: [humano], classes: [] })
        expect(worldCatalogLines({ races: [humano, anao], classes: [] })).toEqual([
            "- Povos (raças) deste mundo: Humano, Anão.",
            "- Classes deste mundo: todas as do catálogo do DnDicas.",
        ])
    })
})
