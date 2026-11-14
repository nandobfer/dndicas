import { describe, expect, it } from "vitest"
import {
    getLevelOneHpMax,
    resolveSyncedSpellcastingAttribute,
    selectSpellcastingAttributeSource,
    selectSpellSlotSource,
    syncSpellcastingAttribute,
} from "@/features/character-sheets/hooks/use-sheet-mention-sync"
import type { CharacterClass } from "@/features/classes/types/classes.types"
import type { ResolvedSubclass } from "@/features/character-sheets/utils/mention-sync"
import { mapCatalogAttributeToSheetAttribute, mapSpellSlotsForLevel } from "@/features/character-sheets/utils/mention-sync"
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
    it("usa o atributo da classe quando a subclasse conjuradora não define um atributo", () => {
        const wizard = {
            spellcasting: true,
            spellcastingAttribute: "Inteligência",
        } as CharacterClass
        const subclass = {
            id: "subclass-1",
            parentClassId: "class-1",
            entity: {
                name: "Tradição Arcana",
                spellcasting: true,
                traits: [],
            },
        } as ResolvedSubclass

        expect(selectSpellcastingAttributeSource([subclass], [wizard])).toBe(wizard)
    })

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

describe("atributo de conjuração sincronizado", () => {
    it("mantém a escolha manual do Ladino com Iniciado em Magia ao reabrir a ficha", () => {
        const rogue = { name: "Ladino", spellcasting: false } as CharacterClass
        const catalog = mapCatalogAttributeToSheetAttribute(selectSpellcastingAttributeSource([], [rogue])?.spellcastingAttribute)

        expect(catalog).toBeNull()
        expect(resolveSyncedSpellcastingAttribute({ current: "intelligence", catalog, syncContributed: null })).toBe("intelligence")
    })

    it("deixa o campo vazio quando o personagem não tem nenhuma conjuração", () => {
        expect(resolveSyncedSpellcastingAttribute({ current: null, catalog: null, syncContributed: null })).toBeNull()
    })

    it("preenche pelo catálogo quando a classe é conjuradora e o campo está vazio", () => {
        expect(resolveSyncedSpellcastingAttribute({ current: null, catalog: "intelligence", syncContributed: null })).toBe("intelligence")
    })

    it("mantém a escolha manual do jogador mesmo com classe conjuradora", () => {
        expect(resolveSyncedSpellcastingAttribute({ current: "wisdom", catalog: "intelligence", syncContributed: null })).toBe("wisdom")
    })

    it("acompanha a classe nova quando o valor foi preenchido automaticamente nesta sessão", () => {
        expect(resolveSyncedSpellcastingAttribute({ current: "intelligence", catalog: "wisdom", syncContributed: "intelligence" })).toBe("wisdom")
    })

    it("mantém a escolha manual feita depois de um preenchimento automático", () => {
        expect(resolveSyncedSpellcastingAttribute({ current: "charisma", catalog: "wisdom", syncContributed: "intelligence" })).toBe("charisma")
    })

    it("não apaga o valor preenchido automaticamente quando a classe conjuradora sai", () => {
        expect(resolveSyncedSpellcastingAttribute({ current: "intelligence", catalog: null, syncContributed: "intelligence" })).toBe("intelligence")
    })
})

describe("registro do atributo preenchido automaticamente", () => {
    type Round = { value: string | null; syncContributed: string | null }
    const round = (state: Round, catalog: string | null) =>
        syncSpellcastingAttribute({ current: state.value, catalog, syncContributed: state.syncContributed })

    it("registra o preenchimento automático e acompanha a troca de classe", () => {
        const filled = round({ value: null, syncContributed: null }, "intelligence")
        expect(filled).toEqual({ value: "intelligence", syncContributed: "intelligence" })

        expect(round(filled, "wisdom")).toEqual({ value: "wisdom", syncContributed: "wisdom" })
    })

    it("limpa o registro após a escolha manual e preserva a escolha na troca de classe", () => {
        const filled = round({ value: null, syncContributed: null }, "intelligence")
        const manual = round({ ...filled, value: "charisma" }, "intelligence")
        expect(manual).toEqual({ value: "charisma", syncContributed: null })

        expect(round(manual, "wisdom")).toEqual({ value: "charisma", syncContributed: null })
    })

    it("ao reabrir a ficha, não trata o valor salvo como preenchimento automático", () => {
        const reopened = round({ value: "intelligence", syncContributed: null }, "wisdom")
        expect(reopened).toEqual({ value: "intelligence", syncContributed: null })
    })

    it("mantém o registro enquanto o valor automático segue o catálogo", () => {
        expect(round({ value: "intelligence", syncContributed: "intelligence" }, "intelligence")).toEqual({
            value: "intelligence",
            syncContributed: "intelligence",
        })
    })

    it("não registra nada quando não há conjuração", () => {
        expect(round({ value: null, syncContributed: null }, null)).toEqual({ value: null, syncContributed: null })
    })
})
