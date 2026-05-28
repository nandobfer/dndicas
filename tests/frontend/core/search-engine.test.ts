import { describe, expect, it } from "vitest"
import { filterEntitiesByOptions, type UnifiedEntity } from "@/core/utils/search-engine"

const base = {
    source: "Livro do Jogador",
    status: "active" as const,
}

describe("filterEntitiesByOptions", () => {
    const entities: UnifiedEntity[] = [
        { ...base, id: "sword", _id: "sword", name: "Espada Longa", label: "Espada Longa", type: "Item", itemType: "arma" },
        { ...base, id: "rope", _id: "rope", name: "Corda", label: "Corda", type: "Item", itemType: "ferramenta" },
        { ...base, id: "fire-bolt", _id: "fire-bolt", name: "Raio de Fogo", label: "Raio de Fogo", type: "Magia", circle: 0 },
        { ...base, id: "shield", _id: "shield", name: "Escudo Arcano", label: "Escudo Arcano", type: "Magia", circle: 1 },
        {
            ...base,
            id: "subclass:wizard:evoker",
            _id: "subclass:wizard:evoker",
            name: "Evocador",
            label: "Evocador",
            type: "Subclasse",
            metadata: { parentClassId: "wizard" },
        },
        {
            ...base,
            id: "subclass:fighter:champion",
            _id: "subclass:fighter:champion",
            name: "Campeão",
            label: "Campeão",
            type: "Subclasse",
            metadata: { parentClassId: "fighter" },
        },
    ]

    it("allows attack mentions to include only weapons and spells", () => {
        const results = filterEntitiesByOptions(entities, {
            specificEntityTypes: ["Item", "Magia"],
            itemTypes: ["arma"],
        })

        expect(results.map((item) => item.id)).toEqual(["sword", "fire-bolt", "shield"])
    })

    it("filters spell suggestions by circle", () => {
        const results = filterEntitiesByOptions(entities, {
            specificEntityType: "Magia",
            circles: [0],
        })

        expect(results.map((item) => item.id)).toEqual(["fire-bolt"])
    })

    it("filters subclasses by parent class", () => {
        const results = filterEntitiesByOptions(entities, {
            specificEntityType: "Subclasse",
            parentClassId: "wizard",
        })

        expect(results.map((item) => item.id)).toEqual(["subclass:wizard:evoker"])
    })
})
