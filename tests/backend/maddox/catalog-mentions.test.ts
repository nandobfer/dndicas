import { describe, expect, it, vi } from "vitest"
import { linkCatalogMentions, mentionsToBold, normalizeMentionName, type CatalogMentionSearch } from "@/features/maddox/server/catalog-mentions"
import { parseMentionHref } from "@/features/opex-agent/mentions"

const catalog = [
    { id: "r1", name: "Elfo", originalName: "Elf", type: "Raça" },
    { id: "c1", name: "Mago", originalName: "Wizard", type: "Classe" },
    { id: "s1", name: "Bola de Fogo", originalName: "Fireball", type: "Magia" },
    { id: "s2", name: "Bola de Fogo Retardada", originalName: "Delayed Blast Fireball", type: "Magia" },
]
const search: CatalogMentionSearch = vi.fn(async (query: string) => catalog.filter((item) => normalizeMentionName(item.name).includes(normalizeMentionName(query)) || normalizeMentionName(item.originalName).includes(normalizeMentionName(query))))

describe("menções do catálogo nas falas do Maddox", () => {
    it("troca o negrito que bate exatamente (sem acento e sem caixa, nome ou nome original) pela menção", async () => {
        const text = await linkCatalogMentions("Seu **elfo** estuda para **MAGO** e conhece **Fireball**. O reino de **Aethra** fica ao norte.", search)
        expect(text).toBe("Seu [elfo](#mention:Ra%C3%A7a:r1) estuda para [MAGO](#mention:Classe:c1) e conhece [Fireball](#mention:Magia:s1). O reino de **Aethra** fica ao norte.")
        expect(parseMentionHref("#mention:Ra%C3%A7a:r1")).toEqual({ type: "Raça", id: "r1" })
    })

    it("não liga nome parcial: 'Bola de Fogo' só liga a magia exata", async () => {
        const text = await linkCatalogMentions("**Bola de Fogo** e **Bola**", search)
        expect(text).toBe("[Bola de Fogo](#mention:Magia:s1) e **Bola**")
    })

    it("sem negrito não consulta o catálogo; nomes repetidos consultam uma vez", async () => {
        const spy = vi.fn(search)
        expect(await linkCatalogMentions("Texto simples.", spy)).toBe("Texto simples.")
        expect(spy).not.toHaveBeenCalled()
        await linkCatalogMentions("**Elfo**, **Elfo** e **Elfo**", spy)
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it("falha da busca mantém o negrito, sem derrubar a resposta", async () => {
        const failing: CatalogMentionSearch = vi.fn(async () => {
            throw new Error("Mongo fora do ar")
        })
        await expect(linkCatalogMentions("Um **Elfo**.", failing)).resolves.toBe("Um **Elfo**.")
    })

    it("o histórico enviado ao modelo volta as menções para negrito", () => {
        expect(mentionsToBold("Um [Elfo](#mention:Ra%C3%A7a:r1) e um [link](https://x.y).")).toBe("Um **Elfo** e um [link](https://x.y).")
    })
})
