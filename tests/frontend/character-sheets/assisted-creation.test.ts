import { describe, expect, it } from "vitest"
import {
    applyBackgroundToSheet,
    applyClassToSheet,
    calculateDropLowestScore,
    calculateFinalDiceScore,
    createTemporaryAssistedSheet,
    getPointBuyCost,
    isValidPointBuy,
} from "@/features/character-sheets/utils/assisted-creation"
import type { Background } from "@/features/backgrounds/types/backgrounds.types"
import type { CharacterClass } from "@/features/classes/types/classes.types"

describe("assisted sheet creation utils", () => {
    it("validates point buy scores and budget", () => {
        expect(getPointBuyCost({
            strength: 15,
            dexterity: 14,
            constitution: 13,
            intelligence: 12,
            wisdom: 10,
            charisma: 8,
        })).toBe(27)

        expect(isValidPointBuy({
            strength: 15,
            dexterity: 14,
            constitution: 13,
            intelligence: 12,
            wisdom: 10,
            charisma: 8,
        })).toBe(true)
        expect(isValidPointBuy({
            strength: 16,
            dexterity: 14,
            constitution: 13,
            intelligence: 12,
            wisdom: 10,
            charisma: 8,
        })).toBe(false)
    })

    it("calculates dice rolling scores with 4d6 drop-lowest and the sixth score from 72", () => {
        expect(calculateDropLowestScore([6, 1, 4, 5])).toBe(15)
        expect(calculateFinalDiceScore([15, 14, 13, 12, 10])).toBe(8)
        expect(calculateFinalDiceScore([18, 18, 18, 18, 18])).toBe(null)
    })

    it("applies origin skills and prevents class application from losing them", () => {
        const sheet = createTemporaryAssistedSheet()
        const background = {
            _id: "background-1",
            name: "Soldado",
            skillProficiencies: ["Atletismo", "Intimidação"],
            suggestedAttributes: [],
            description: "",
            source: "PHB",
            status: "active",
            equipment: "",
            traits: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        } satisfies Background
        const characterClass = {
            _id: "class-1",
            name: "Guerreiro",
            description: "",
            source: "PHB",
            status: "active",
            hitDice: "d10",
            primaryAttributes: ["Força"],
            savingThrows: ["Força", "Constituição"],
            armorProficiencies: ["Armaduras Leves", "Armaduras Médias", "Armaduras Pesadas", "Escudos"],
            weaponProficiencies: ["Armas Simples", "Armas Marciais"],
            skillCount: 2,
            availableSkills: ["Acrobacia", "Atletismo", "Percepção"],
            spellcasting: false,
            subclasses: [],
            traits: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        } satisfies CharacterClass

        const withBackground = applyBackgroundToSheet(sheet, background)
        const withClass = applyClassToSheet(withBackground, characterClass, ["Acrobacia", "Percepção"])

        expect(withClass.skills.Atletismo.proficient).toBe(true)
        expect(withClass.skills.Intimidação.proficient).toBe(true)
        expect(withClass.skills.Acrobacia.proficient).toBe(true)
        expect(withClass.skills.Percepção.proficient).toBe(true)
        expect(withClass.savingThrows.strength).toBe(true)
        expect(withClass.savingThrows.constitution).toBe(true)
        expect(withClass.hitDiceTotal).toBe("d10")
        expect(withClass.armorTraining.shields).toBe(true)
    })
})
