import { describe, expect, it } from "vitest"
import { NAV_CATEGORIES, getVisibleNavigation, resolveActiveNav } from "@/lib/config/navigation"

const viewer = (isSignedIn: boolean, granted: string[] = []) => ({
    isSignedIn,
    can: (key: string) => granted.includes("*") || granted.includes(key),
})

const summary = (isSignedIn: boolean, granted: string[] = []) =>
    getVisibleNavigation(viewer(isSignedIn, granted)).map((category) => [category.label, category.items.map((item) => item.label)])

describe("navegação do header", () => {
    it("mostra ao visitante só Fichas (Minhas Fichas) e Catálogo", () => {
        expect(summary(false)).toEqual([
            ["Fichas", ["Minhas Fichas"]],
            ["Catálogo", ["Classes", "Raças", "Origens", "Regras", "Habilidades", "Talentos", "Magias", "Itens", "Monstros"]],
        ])
    })

    it("mostra Meus NPCs a quem está logado, sem Campanhas nem Administração sem permissão", () => {
        expect(summary(true).map(([label]) => label)).toEqual(["Fichas", "Catálogo"])
        expect(summary(true)[0]).toEqual(["Fichas", ["Minhas Fichas", "Meus NPCs"]])
    })

    it("mostra Campanhas só com a permissão maddox.play", () => {
        expect(summary(true, ["maddox.play"]).map(([label]) => label)).toEqual(["Fichas", "Campanhas", "Catálogo"])
        expect(summary(false, ["maddox.play"]).map(([label]) => label)).not.toContain("Campanhas")
    })

    it("mostra em Administração só os itens das permissões concedidas", () => {
        expect(summary(true, ["audit.view"]).at(-1)).toEqual(["Administração", ["Logs"]])
        expect(summary(true, ["integrations.access", "users.view"]).at(-1)).toEqual(["Administração", ["Usuários", "Integrações"]])
    })

    it("mostra tudo, na ordem da especificação, com o coringa", () => {
        expect(summary(true, ["*"])).toEqual([
            ["Fichas", ["Minhas Fichas", "Meus NPCs"]],
            ["Campanhas", ["Campanhas Maddox"]],
            ["Catálogo", ["Classes", "Raças", "Origens", "Regras", "Habilidades", "Talentos", "Magias", "Itens", "Monstros"]],
            ["Administração", ["Usuários", "Todas as fichas", "Logs", "Referências Pendentes", "Integrações"]],
        ])
    })

    it("não mostra uma categoria sem itens visíveis", () => {
        expect(getVisibleNavigation(viewer(true), [NAV_CATEGORIES[1]])).toEqual([])
    })

    it.each([
        ["/", { kind: "home" }],
        ["/spells", { kind: "item", categoryId: "catalogo", href: "/spells" }],
        ["/spells/bola-de-fogo", { kind: "item", categoryId: "catalogo", href: "/spells" }],
        ["/monsters/dragao", { kind: "item", categoryId: "catalogo", href: "/monsters" }],
        ["/my-sheets", { kind: "item", categoryId: "fichas", href: "/my-sheets" }],
        ["/sheets/abc/druida", { kind: "item", categoryId: "fichas", href: "/my-sheets" }],
        ["/sheets", { kind: "item", categoryId: "administracao", href: "/sheets" }],
        ["/my-npcs/goblin", { kind: "item", categoryId: "fichas", href: "/my-npcs" }],
        ["/campanhas/123", { kind: "item", categoryId: "campanhas", href: "/campanhas" }],
        ["/campanhas/convite/token", { kind: "item", categoryId: "campanhas", href: "/campanhas" }],
        ["/integracoes/ia/openai", { kind: "item", categoryId: "administracao", href: "/integracoes" }],
        ["/admin/mentions", { kind: "item", categoryId: "administracao", href: "/admin/mentions" }],
        ["/profile", null],
        ["/feedback", null],
        ["/sign-in", null],
        ["/spellsx", null],
    ])("destaca %s corretamente", (pathname, expected) => {
        expect(resolveActiveNav(pathname)).toEqual(expected)
    })

    it("não destaca item que a pessoa não vê", () => {
        const visible = getVisibleNavigation(viewer(false))
        expect(resolveActiveNav("/campanhas/convite/token", visible)).toBeNull()
        expect(resolveActiveNav("/sheets/abc", visible)).toEqual({ kind: "item", categoryId: "fichas", href: "/my-sheets" })
    })
})
