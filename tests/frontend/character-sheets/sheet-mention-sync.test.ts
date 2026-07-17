import { describe, expect, it } from "vitest"
import {
    getLevelOneHpMax,
    selectSpellcastingAttributeSource,
    selectSpellSlotSource,
} from "@/features/character-sheets/hooks/use-sheet-mention-sync"
import type { CharacterClass } from "@/features/classes/types/classes.types"
import type { ResolvedSubclass } from "@/features/character-sheets/utils/mention-sync"
import { mapSpellSlotsForLevel } from "@/features/character-sheets/utils/mention-sync"
import { getAvailableSpellSlotLevels } from "@/features/character-sheets/utils/spell-slots"

describe("getLevelOneHpMax", () => {
    it("uses the full class hit die plus Constitution modifier", () => {
        expect(getLevelOneHpMax("d10", 2)).toBe(12)
    })

    it("never returns less than 1 hit point", () => {
        expect(getLevelOneHpMax("d6", -10)).toBe(1)
    })
})

describe("mapSpellSlotsForLevel", () => {
    it("retorna apenas círculos de magia disponíveis no nível da progressão", () => {
        const slots = mapSpellSlotsForLevel(5, {
            progressionTable: {
                spellSlots: {
                    5: { slots: { 1: 4, 2: 3, 3: 2 } },
                },
            },
        })

        expect(slots).toEqual({
            "1": { total: 4, used: 0 },
            "2": { total: 3, used: 0 },
            "3": { total: 2, used: 0 },
        })
    })

    it("limita espaços usados ao total garantido pela progressão", () => {
        const slots = mapSpellSlotsForLevel(3, {
            progressionTable: {
                spellSlots: {
                    3: { slots: { 1: 4, 2: 2 } },
                },
            },
        }, {
            "1": { total: 4, used: 2 },
            "2": { total: 3, used: 5 },
            "3": { total: 2, used: 1 },
        })

        expect(slots).toEqual({
            "1": { total: 4, used: 2 },
            "2": { total: 2, used: 2 },
        })
    })

    it("não retorna containers quando o nível não possui espaços de magia", () => {
        expect(mapSpellSlotsForLevel(1, { progressionTable: { spellSlots: {} } })).toEqual({})
    })

    it("mapeia progressão de pacto do Bruxo sem exigir espaços de 1º círculo", () => {
        const slots = mapSpellSlotsForLevel(3, {
            progressionTable: {
                spellSlots: {
                    3: { cantrips: 2, preparedSpells: 4, slots: { 2: 2 } },
                },
            },
        })

        expect(slots).toEqual({
            "2": { total: 2, used: 0 },
        })
    })
})

describe("fontes de conjuração da ficha", () => {
    it("usa atributo da subclasse conjuradora, mas mantém slots da classe quando a subclasse não tem progressão", () => {
        const warlock = {
            _id: "class-1",
            name: "Bruxo",
            description: "",
            source: "Livro do Jogador",
            status: "active",
            hitDice: "d8",
            primaryAttributes: ["Carisma"],
            savingThrows: ["Sabedoria", "Carisma"],
            armorProficiencies: [],
            weaponProficiencies: [],
            skillCount: 2,
            availableSkills: [],
            spellcasting: true,
            spellcastingAttribute: "Carisma",
            subclasses: [],
            traits: [],
            progressionTable: {
                spellSlots: {
                    3: { slots: { 2: 2 } },
                },
            },
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        } satisfies CharacterClass
        const patron = {
            id: "subclass-1",
            parentClassId: "class-1",
            entity: {
                name: "O Grande Antigo",
                spellcasting: true,
                spellcastingAttribute: "Carisma",
                traits: [],
            },
        } as ResolvedSubclass

        expect(selectSpellcastingAttributeSource([patron], [warlock])).toBe(patron.entity)
        expect(selectSpellSlotSource([patron], [warlock])).toBe(warlock)
        expect(mapSpellSlotsForLevel(3, selectSpellSlotSource([patron], [warlock]))).toEqual({
            "2": { total: 2, used: 0 },
        })
    })
})

describe("getAvailableSpellSlotLevels", () => {
    it("ordena e filtra apenas níveis com total positivo", () => {
        expect(getAvailableSpellSlotLevels({
            "3": { total: 2, used: 0 },
            "1": { total: 4, used: 1 },
            "2": { total: 0, used: 0 },
            "9": { total: 0, used: 0 },
        })).toEqual(["1", "3"])
    })
})
