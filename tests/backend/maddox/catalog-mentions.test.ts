import { describe, expect, it, vi } from "vitest"
import { linkCatalogMentions, mentionsToMarkup, normalizeMentionName, reservedNameSet, type CatalogMentionSearch } from "@/features/maddox/server/catalog-mentions"
import { parseMentionHref } from "@/features/opex-agent/mentions"

const catalog = [
    { id: "r1", name: "Elfo", originalName: "Elf", type: "Raça" },
    { id: "c1", name: "Mago", originalName: "Wizard", type: "Classe" },
    { id: "s1", name: "Bola de Fogo", originalName: "Fireball", type: "Magia" },
    { id: "m1", name: "Lyra", originalName: "Lyra", type: "Monstro" },
]
const makeSearch = () =>
    vi.fn<CatalogMentionSearch>(async (query, type) =>
        catalog.filter((item) => item.type === type && (normalizeMentionName(item.name).includes(normalizeMentionName(query)) || normalizeMentionName(item.originalName).includes(normalizeMentionName(query)))),
    )

describe("menções do catálogo nas falas do Maddox", () => {
    it("resolve a citação {{Tipo:Nome}} pelo nome ou nome original, sem acento e sem caixa", async () => {
        const search = makeSearch()
        const text = await linkCatalogMentions("Seu {{Raça:elfo}} estuda para {{classe:MAGO}} e conhece {{Magia:Fireball}}.", { search })
        expect(text).toBe("Seu [elfo](#mention:Ra%C3%A7a:r1) estuda para [MAGO](#mention:Classe:c1) e conhece [Fireball](#mention:Magia:s1).")
        expect(parseMentionHref("#mention:Ra%C3%A7a:r1")).toEqual({ type: "Raça", id: "r1" })
    })

    it("respeita o tipo declarado: {{Classe:Lyra}} não liga ao monstro Lyra e a busca filtra pelo tipo", async () => {
        const search = makeSearch()
        expect(await linkCatalogMentions("A {{Classe:Lyra}} chegou.", { search })).toBe("A **Lyra** chegou.")
        expect(search).toHaveBeenCalledWith("Lyra", "Classe")
    })

    it("o caso da prévia: personagem Lyra Ventobravo nunca vira o monstro Lyra (nem inteira, nem só o primeiro nome)", async () => {
        const search = makeSearch()
        const reserved = ["As brumas de Valdren", "Lyra Ventobravo"]
        const text = await linkCatalogMentions("Como a **Lyra** é? {{Monstro:Lyra}} e {{Monstro:Lyra Ventobravo}}.", { search, reserved })
        expect(text).toBe("Como a **Lyra** é? **Lyra** e **Lyra Ventobravo**.")
        expect(search).not.toHaveBeenCalled()
    })

    it("negrito comum nunca consulta o catálogo", async () => {
        const search = makeSearch()
        expect(await linkCatalogMentions("O reino de **Aethra** e um **Elfo**.", { search })).toBe("O reino de **Aethra** e um **Elfo**.")
        expect(search).not.toHaveBeenCalled()
    })

    it("tipo inválido, nome sem correspondência e falha da busca viram negrito (nunca marcação crua)", async () => {
        const search = makeSearch()
        expect(await linkCatalogMentions("{{Lugar:Aethra}} e {{Magia:Raio Inventado}}", { search })).toBe("**Aethra** e **Raio Inventado**")
        const failing = vi.fn<CatalogMentionSearch>(async () => {
            throw new Error("Mongo fora do ar")
        })
        await expect(linkCatalogMentions("Um {{Raça:Elfo}}.", { search: failing })).resolves.toBe("Um **Elfo**.")
    })

    it("citações repetidas consultam uma vez", async () => {
        const search = makeSearch()
        await linkCatalogMentions("{{Raça:Elfo}}, {{Raça:elfo}} e {{Raça:Elfo}}", { search })
        expect(search).toHaveBeenCalledTimes(1)
    })

    it("reserva o nome inteiro e as palavras de 3+ letras", () => {
        const set = reservedNameSet(["Lyra Ventobravo", "As brumas de Valdren"])
        expect([...set]).toEqual(expect.arrayContaining(["lyra ventobravo", "lyra", "ventobravo", "brumas", "valdren"]))
        expect(set.has("as")).toBe(false)
        expect(set.has("de")).toBe(false)
    })

    it("o histórico enviado ao modelo volta as menções para a marcação e mantém links comuns", () => {
        expect(mentionsToMarkup("Um [Elfo](#mention:Ra%C3%A7a:r1) e um [link](https://x.y).")).toBe("Um {{Raça:Elfo}} e um [link](https://x.y).")
    })
})
