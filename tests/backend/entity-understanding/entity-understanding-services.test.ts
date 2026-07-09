import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sanitizeEntityUnderstandingHtml, getPlainTextFromHtml, isMeaningfulHtml } from "@/features/entity-understanding/services/entity-understanding-html"
import { buildEntityUnderstandingHistory, buildEntityUnderstandingSystemInstruction } from "@/features/entity-understanding/services/entity-understanding-prompt"
import { clearChatSession, loadChatSession, saveChatSession } from "@/features/entity-understanding/services/entity-understanding-storage"
import { ENTITY_UNDERSTANDING_IDLE_TTL_MS } from "@/features/entity-understanding/types/entity-understanding.types"

function installLocalStorageMock() {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            localStorage: {
                getItem: vi.fn((key: string) => store.get(key) ?? null),
                setItem: vi.fn((key: string, value: string) => store.set(key, value)),
                removeItem: vi.fn((key: string) => store.delete(key)),
            },
        },
    })

    return store
}

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

describe("entity understanding storage", () => {
    beforeEach(() => {
        installLocalStorageMock()
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-07-09T12:00:00.000Z"))
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        Reflect.deleteProperty(globalThis, "window")
    })

    it("saves and loads a valid chat session", () => {
        const lastActivity = Date.now()
        saveChatSession("Classe", "ladino", [{ role: "model", html: "<p>Ladino é furtivo.</p>" }], lastActivity)

        expect(loadChatSession("Classe", "ladino")).toEqual({
            messages: [{ role: "model", html: "<p>Ladino é furtivo.</p>" }],
            lastActivity,
        })
    })

    it("clears expired sessions", () => {
        const lastActivity = Date.now() - ENTITY_UNDERSTANDING_IDLE_TTL_MS - 1
        saveChatSession("Classe", "ladino", [{ role: "model", html: "<p>Expirou.</p>" }], lastActivity)

        expect(loadChatSession("Classe", "ladino")).toBeNull()
        expect(window.localStorage.removeItem).toHaveBeenCalledWith("entity-understanding:chat:Classe:ladino")
    })

    it("removes a session explicitly", () => {
        saveChatSession("Classe", "ladino", [{ role: "user", html: "<p>Pergunta.</p>" }], Date.now())
        clearChatSession("Classe", "ladino")

        expect(loadChatSession("Classe", "ladino")).toBeNull()
    })
})
