import { describe, expect, it } from "vitest"
import { mentionsToMarkdown, parseMentionHref } from "@/features/opex-agent/mentions"

describe("menções de entidades nas respostas do Agente Opex", () => {
    it("troca o span de menção por um link Markdown que vira badge", () => {
        const text = 'Use <span data-type="mention" data-id="abc123" data-label="Bola de Fogo" data-entity-type="Magia">Bola de Fogo</span> contra grupos.'
        expect(mentionsToMarkdown(text)).toBe("Use [Bola de Fogo](#mention:Magia:abc123) contra grupos.")
        expect(parseMentionHref("#mention:Magia:abc123")).toEqual({ type: "Magia", id: "abc123" })
    })

    it("codifica ids de subclasse e remove colchetes do rótulo", () => {
        const text = '<span data-type="mention" data-id="subclass:1:2" data-label="Campeão [PHB]" data-entity-type="Subclasse">x</span>'
        const markdown = mentionsToMarkdown(text)
        expect(markdown).toBe("[Campeão PHB](#mention:Subclasse:subclass%3A1%3A2)")
        expect(parseMentionHref(markdown.slice(markdown.indexOf("(") + 1, -1))).toEqual({ type: "Subclasse", id: "subclass:1:2" })
    })

    it("sem id, mantém só o texto; links comuns não são menções", () => {
        expect(mentionsToMarkdown('<span data-type="mention" data-label="X">Texto</span>')).toBe("Texto")
        expect(parseMentionHref("https://dndicas.com.br")).toBeNull()
        expect(mentionsToMarkdown("texto comum")).toBe("texto comum")
    })
})
