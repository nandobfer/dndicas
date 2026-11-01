import { describe, expect, it } from "vitest"
import { accentInsensitivePattern, accentInsensitiveRegex, excerptAround, foldAccents, plainText, stripCatalogMarkup, MADDOX_JOURNAL_EXCERPT_CHARS } from "@/features/maddox/journal-search"

describe("busca do Diário da campanha (Maddox 9)", () => {
    it("ignora acentos e caixa nos dois sentidos", () => {
        const regex = accentInsensitiveRegex("taverna")
        for (const text of ["Taverna", "TAVÉRNA", "tavérna do javali"]) expect(regex.test(text), text).toBe(true)
        expect(accentInsensitiveRegex("Tavérna").test("taverna")).toBe(true)
        expect(accentInsensitiveRegex("acao").test("Ação imediata")).toBe(true)
        expect(foldAccents("Ação Pública")).toBe("acao publica")
    })

    it("acha por pedaço da palavra", () => {
        expect(accentInsensitiveRegex("ald").test("Aldeia de Pedra")).toBe(true)
    })

    it("escapa os caracteres especiais do regex", () => {
        expect(accentInsensitivePattern(".*(")).toBe("\\.\\*\\(")
        expect(accentInsensitiveRegex(".*").test("qualquer texto")).toBe(false)
        expect(accentInsensitiveRegex("a+b").test("a+b")).toBe(true)
        expect(accentInsensitiveRegex("[x]").test("[x]")).toBe(true)
    })

    it("tira a marcação do catálogo e do Markdown", () => {
        expect(stripCatalogMarkup("Lança {{Magia:Bola de Fogo}} no {{Monstro: Goblin}}.")).toBe("Lança Bola de Fogo no Goblin.")
        expect(plainText("> **Bartolomeu** diz:\n\n## Fuga\n_corre_ `já`")).toBe("Bartolomeu diz: Fuga _corre_ já")
    })

    it("trecho em volta da ocorrência, com reticências só onde cortou", () => {
        const before = "a".repeat(300)
        const after = "b".repeat(300)
        const text = `${before} Taverna ${after}`
        const middle = excerptAround(text, "tavérna")
        expect(middle.startsWith("…")).toBe(true)
        expect(middle.endsWith("…")).toBe(true)
        expect(middle).toContain("Taverna")
        expect(middle.length).toBeLessThanOrEqual(MADDOX_JOURNAL_EXCERPT_CHARS + 2)

        const start = excerptAround(`Taverna ${after}`, "taverna")
        expect(start.startsWith("Taverna")).toBe(true)
        expect(start.endsWith("…")).toBe(true)

        const end = excerptAround(`${before} Taverna`, "taverna")
        expect(end.startsWith("…")).toBe(true)
        expect(end.endsWith("Taverna")).toBe(true)

        expect(excerptAround("Curto.", "xyz")).toBe("Curto.")
        expect(excerptAround(before, "xyz")).toBe(`${"a".repeat(MADDOX_JOURNAL_EXCERPT_CHARS)}…`)
    })
})
