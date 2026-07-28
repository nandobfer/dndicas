import { describe, expect, it } from "vitest"
import { catalogEntityTypes, getCatalogEntitySchema, searchCatalogEntitiesSchema } from "@/features/mcp/server/catalog-schemas"

describe("catalog MCP schemas", () => {
    it("lists the supported public catalog entity types", () => {
        expect(catalogEntityTypes).toEqual([
            "Regra",
            "Habilidade",
            "Talento",
            "Raça",
            "Classe",
            "Subclasse",
            "Origem",
            "Magia",
            "Item",
            "Monstro",
        ])
    })

    it("defaults and validates search inputs", () => {
        expect(searchCatalogEntitiesSchema.parse({})).toEqual({ query: "", limit: 20, offset: 0 })
        expect(() => searchCatalogEntitiesSchema.parse({ limit: 51 })).toThrow()
        expect(() => searchCatalogEntitiesSchema.parse({ types: ["NPC"] })).toThrow()
    })

    it("validates detail inputs", () => {
        expect(getCatalogEntitySchema.parse({ type: "Magia", id: "spell-1" })).toEqual({ type: "Magia", id: "spell-1" })
        expect(() => getCatalogEntitySchema.parse({ type: "NPC", id: "npc-1" })).toThrow()
        expect(() => getCatalogEntitySchema.parse({ type: "Magia", id: "" })).toThrow()
    })
})
