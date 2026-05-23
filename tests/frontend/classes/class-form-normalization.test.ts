import { describe, expect, it } from "vitest"

import { buildClassFormDefaults } from "@/features/classes/components/class-form-normalization"

describe("buildClassFormDefaults", () => {
    it("filters invalid class and subclass traits before they reach the form", () => {
        const defaults = buildClassFormDefaults({
            name: "Artífice",
            description: "<p>Classe válida com descrição longa.</p>",
            source: "EFA",
            status: "active",
            hitDice: "d8",
            primaryAttributes: ["Inteligência"],
            savingThrows: ["Constituição", "Inteligência"],
            armorProficiencies: [],
            weaponProficiencies: ["Armas Simples"],
            skillCount: 2,
            availableSkills: ["Arcanismo"],
            spellcasting: true,
            spells: [],
            traits: [null, { _id: "trait-1", level: 1, description: "<p>Trait válida</p>" }, { _id: "trait-2", level: 2 }, { _id: "trait-3", description: "<p>Sem nível</p>" }],
            subclasses: [
                {
                    _id: "subclass-1",
                    name: "Alquimista",
                    source: "EFA",
                    spellcasting: true,
                    spells: [],
                    traits: [null, { _id: "sub-trait-1", level: 3, description: "<p>Trait válida da subclasse</p>" }, { _id: "sub-trait-2", level: 5 }],
                },
            ],
        })

        expect(defaults.traits).toEqual([{ _id: "trait-1", level: 1, description: "<p>Trait válida</p>" }])
        expect(defaults.subclasses).toEqual([
            expect.objectContaining({
                _id: "subclass-1",
                name: "Alquimista",
                spellcasting: true,
                traits: [{ _id: "sub-trait-1", level: 3, description: "<p>Trait válida da subclasse</p>" }],
            }),
        ])
    })

    it("keeps safe defaults for missing or malformed arrays", () => {
        const defaults = buildClassFormDefaults({
            name: "Guerreiro",
            description: "<p>Classe válida com descrição longa.</p>",
            source: "LDJ",
            status: "active",
            hitDice: "d10",
            primaryAttributes: ["Força"],
            savingThrows: ["Força", "Constituição"],
            armorProficiencies: ["Armaduras Leves"],
            weaponProficiencies: ["Armas Marciais"],
            skillCount: 2,
            availableSkills: ["Atletismo"],
            subclasses: "invalid",
            traits: "invalid",
        })

        expect(defaults.subclasses).toEqual([])
        expect(defaults.traits).toEqual([])
        expect(defaults.spells).toEqual([])
    })
})
