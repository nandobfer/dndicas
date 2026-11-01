import { describe, expect, it } from "vitest"
import { checkModifier, checkSucceeded, keptD20, checkTitle, sheetSummary, type MaddoxCheckSheet } from "@/features/maddox/check-modifier"

const skill = (proficient = false, expertise = false, override?: number) => ({ proficient, expertise, ...(override !== undefined ? { override } : {}) })

function sheet(overrides: Partial<MaddoxCheckSheet> = {}): MaddoxCheckSheet {
    return {
        strength: 14,
        dexterity: 16,
        constitution: 12,
        intelligence: 8,
        wisdom: 13,
        charisma: 10,
        level: 5,
        proficiencyBonusOverride: null,
        savingThrows: { strength: true, dexterity: false, constitution: true, intelligence: false, wisdom: false, charisma: false },
        skills: { Furtividade: skill(true), Percepção: skill(true, true), Atletismo: skill(), Arcanismo: skill(false, false, 7) } as MaddoxCheckSheet["skills"],
        ...overrides,
    }
}

describe("modificador dos testes pedidos pelo Maddox (Maddox 5)", () => {
    it("perícia: atributo da perícia + proficiência, especialização dobra e o valor manual prevalece", () => {
        // Nível 5 = proficiência +3.
        expect(checkModifier(sheet(), { kind: "skill", ability: "dexterity", skill: "Furtividade" })).toMatchObject({ value: 6, parts: [{ label: "Destreza", value: "+3" }, { label: "Prof.", value: "+3" }] })
        expect(checkModifier(sheet(), { kind: "skill", ability: "wisdom", skill: "Percepção" }).value).toBe(1 + 6)
        expect(checkModifier(sheet(), { kind: "skill", ability: "strength", skill: "Atletismo" })).toMatchObject({ value: 2, parts: [{ label: "Força", value: "+2" }] })
        expect(checkModifier(sheet(), { kind: "skill", ability: "intelligence", skill: "Arcanismo" })).toMatchObject({ value: 7, parts: [{ label: "Manual" }] })
    })

    it("resistência com e sem proficiência; atributo puro; proficiência manual", () => {
        expect(checkModifier(sheet(), { kind: "save", ability: "constitution", skill: null })).toMatchObject({ value: 1 + 3, parts: [{ label: "Constituição" }, { label: "Prof." }] })
        expect(checkModifier(sheet(), { kind: "save", ability: "intelligence", skill: null }).value).toBe(-1)
        expect(checkModifier(sheet(), { kind: "ability", ability: "intelligence", skill: null })).toMatchObject({ value: -1, parts: [{ label: "Inteligência", value: "-1", color: "intelligence" }] })
        expect(checkModifier(sheet({ proficiencyBonusOverride: 5 }), { kind: "save", ability: "strength", skill: null }).value).toBe(2 + 5)
    })

    it("sem ficha: modificador 0 com o aviso", () => {
        expect(checkModifier(null, { kind: "ability", ability: "strength", skill: null })).toEqual({ value: 0, parts: [{ label: "Ficha não encontrada", value: "+0", color: "manual" }] })
    })

    it("título, sucesso pela CD e resumo da ficha para o narrador", () => {
        expect(checkTitle({ kind: "skill", ability: "dexterity", skill: "Furtividade" })).toBe("Furtividade (Destreza)")
        expect(checkTitle({ kind: "save", ability: "wisdom", skill: null })).toBe("Resistência de Sabedoria")
        expect(checkTitle({ kind: "ability", ability: "strength", skill: null })).toBe("Força")
        expect(checkSucceeded(15, 15)).toBe(true)
        expect(checkSucceeded(14, 15)).toBe(false)
        // 20 natural sempre passa e 1 natural sempre falha, qualquer que seja a CD.
        expect(checkSucceeded(24, 30, 20)).toBe(true)
        expect(checkSucceeded(26, 15, 1)).toBe(false)
        expect(checkSucceeded(15, 15, 12)).toBe(true)
        expect(keptD20({ selectedD20: { kept: 1 }, terms: [{ results: [1] }] })).toBe(1)
        expect(keptD20({ selectedD20: null, terms: [{ results: [14] }] })).toBe(14)
        const summary = sheetSummary(sheet({ class: "Ladino", race: "Elfo", hpMax: 30, hpCurrent: 22, computedArmorClass: 15 }))
        expect(summary).toContain("Nível 5 · Ladino · Elfo · PV 22/30 · CA 15 · Proficiência +3")
        expect(summary).toContain("DES 16 (+3)")
        expect(summary).toContain("Resistências com proficiência: FOR, CON")
        expect(summary).toContain("Perícias treinadas: Arcanismo +7, Furtividade +6, Percepção +7")
        // Campos com HTML de menção (como a ficha grava) saem só com o nome; entidades decodificadas.
        const mentioned = sheetSummary(sheet({ class: '<p><span data-type="mention" data-id="c1" data-entity-type="Classe" data-label="Guerreiro" class="mention">Guerreiro</span></p>', subclass: '<span data-type="mention" data-id="s1" data-entity-type="Subclasse">Campeão</span>', race: "<p>Meio &amp; Elfo</p>" }))
        expect(mentioned.split("\n")[0]).toBe("Nível 5 · Guerreiro (Campeão) · Meio & Elfo · Proficiência +3")
    })
})
