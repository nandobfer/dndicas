import { describe, expect, it } from "vitest"
import { sanitizeEntityUnderstandingHtml, getPlainTextFromHtml, isMeaningfulHtml } from "@/features/entity-understanding/services/entity-understanding-html"
import { buildEntityUnderstandingHistory, buildEntityUnderstandingSystemInstruction } from "@/features/entity-understanding/services/entity-understanding-prompt"

describe("entity understanding html", () => {
    it("keeps safe formatting and valid mentions", () => {
        const html = '<p>Use <strong>Ladino</strong> com <span data-type="mention" data-id="1" data-label="Furtividade" data-entity-type="Habilidade" onclick="bad()">Furtividade</span>.</p>'

        expect(sanitizeEntityUnderstandingHtml(html)).toBe('<p>Use <strong>Ladino</strong> com <span data-type="mention" data-id="1" data-label="Furtividade" data-entity-type="Habilidade">Furtividade</span>.</p>')
    })

    it("removes scripts, unsafe tags and invalid mentions", () => {
        const html = '<script>alert(1)</script><img src=x onerror="bad()"><span data-type="mention" data-label="Sem id">Sem id</span><p>Texto</p>'

        expect(sanitizeEntityUnderstandingHtml(html)).toBe('Sem id<p>Texto</p>')
    })

    it("detects meaningful html after sanitization", () => {
        expect(isMeaningfulHtml("<p>   </p>")).toBe(false)
        expect(isMeaningfulHtml("<p>Qual recurso?</p>")).toBe(true)
        expect(getPlainTextFromHtml("<p>Qual recurso?</p>")).toBe("Qual recurso?")
    })
})

describe("entity understanding prompt", () => {
    it("builds an initial summary history with full entity context", () => {
        const history = buildEntityUnderstandingHistory({
            entityType: "Classe",
            entityId: "ladino-id",
            entity: { name: "Ladino", traits: [{ name: "Ataque Furtivo" }] },
            mode: "initial_summary",
            messages: [],
        })

        expect(history).toHaveLength(1)
        expect(history[0].role).toBe("user")
        expect(history[0].parts).toContain("Tipo da entidade: Classe")
        expect(history[0].parts).toContain("Ladino")
        expect(history[0].parts).toContain("Faça um resumo curto")
    })

    it("preserves active conversation messages for multi-turn context", () => {
        const history = buildEntityUnderstandingHistory({
            entityType: "Classe",
            entityId: "ladino-id",
            entity: { name: "Ladino" },
            mode: "conversation",
            messages: [
                { role: "model", html: "<p>Ladino é furtivo.</p>" },
                { role: "user", html: "<p>Explique Ataque Furtivo.</p>" },
            ],
        })

        expect(history.map((message) => message.role)).toEqual(["user", "model", "user"])
        expect(history[0].parts).toContain("Continue a conversa")
        expect(history[2].parts).toBe("<p>Explique Ataque Furtivo.</p>")
    })

    it("instructs Gemini to hide technical data and use DnDicas mentions", () => {
        const system = buildEntityUnderstandingSystemInstruction()

        expect(system).toContain("Não mencione JSON")
        expect(system).toContain('data-type="mention"')
        expect(system).toContain("pt-BR")
    })
})
