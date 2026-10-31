import { describe, expect, it } from "vitest"
import { catalogTypeOf, createMarkupFilter, liveMarkupToBold, markupToBold } from "@/features/maddox/catalog-markup"

describe("marcação de citação do catálogo", () => {
    it("converte {{Tipo:Nome}} em negrito e mantém o resto", () => {
        expect(markupToBold("Um {{Raça:Elfo}} e um {{Magia:Bola de Fogo}}.")).toBe("Um **Elfo** e um **Bola de Fogo**.")
        expect(markupToBold("Sem marcação.")).toBe("Sem marcação.")
    })

    it("reconhece o tipo sem acento e sem caixa", () => {
        expect(catalogTypeOf("raca")).toBe("Raça")
        expect(catalogTypeOf("MONSTRO")).toBe("Monstro")
        expect(catalogTypeOf("Lugar")).toBeNull()
    })

    it("texto ao vivo esconde a marcação ainda aberta", () => {
        expect(liveMarkupToBold("Um {{Raça:El")).toBe("Um ")
        expect(liveMarkupToBold("Um {")).toBe("Um ")
        expect(liveMarkupToBold("Um {{Raça:Elfo}} chega")).toBe("Um **Elfo** chega")
    })

    it("filtro do stream segura a marcação partida entre pedaços e nunca emite {{", () => {
        const filter = createMarkupFilter()
        const pieces = ["Um {", "{Ra", "ça:El", "fo}", "} chega."].map((chunk) => filter.push(chunk))
        pieces.push(filter.flush())
        expect(pieces.join("")).toBe("Um **Elfo** chega.")
        for (const piece of pieces) expect(piece).not.toMatch(/[{}]/)
    })

    it("marcação que nunca fecha sai como veio no flush", () => {
        const filter = createMarkupFilter()
        expect(filter.push("Texto {{Raça:")).toBe("Texto ")
        expect(filter.flush()).toBe("{{Raça:")
    })
})
