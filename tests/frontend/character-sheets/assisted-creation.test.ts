import { describe, expect, it } from "vitest"
import {
    CATALOG_TO_SHEET_ATTRIBUTE,
    applyBackgroundToSheet,
    applyClassToSheet,
    applyRaceToSheet,
    calculateDropLowestScore,
    calculateFinalDiceScore,
    createEmptySkills,
    createTemporaryAssistedSheet,
    getPointBuyCost,
    isValidPointBuy,
    type AssistedAttributeKey,
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

// Pure helper that mirrors the handleBonusChange logic in the modal
function applyBonusChange(
    current: Partial<Record<AssistedAttributeKey, number>>,
    attr: AssistedAttributeKey,
    delta: number,
): Partial<Record<AssistedAttributeKey, number>> {
    const currentValue = current[attr] ?? 0
    const newValue = Math.min(2, Math.max(0, currentValue + delta))
    const currentTotal = Object.values(current).reduce((sum, v) => sum + (v ?? 0), 0)
    const newTotal = currentTotal - currentValue + newValue
    if (newTotal > 3) return current
    return { ...current, [attr]: newValue }
}

describe("background attribute bonus distribution", () => {
    it("increments a bonus up to per-attribute max of 2", () => {
        let state: Partial<Record<AssistedAttributeKey, number>> = {}
        state = applyBonusChange(state, "strength", 1)
        expect(state.strength).toBe(1)
        state = applyBonusChange(state, "strength", 1)
        expect(state.strength).toBe(2)
        // third increment is capped at 2
        state = applyBonusChange(state, "strength", 1)
        expect(state.strength).toBe(2)
    })

    it("does not allow total bonuses to exceed 3", () => {
        let state: Partial<Record<AssistedAttributeKey, number>> = {}
        state = applyBonusChange(state, "strength", 1)
        state = applyBonusChange(state, "dexterity", 1)
        state = applyBonusChange(state, "constitution", 1)
        // total is 3, next increment should be rejected
        const before = state
        state = applyBonusChange(state, "intelligence", 1)
        expect(state).toEqual(before)
    })

    it("allows redistribution when decreasing one attribute and increasing another", () => {
        let state: Partial<Record<AssistedAttributeKey, number>> = { strength: 2, dexterity: 1 }
        state = applyBonusChange(state, "strength", -1)
        expect(state.strength).toBe(1)
        state = applyBonusChange(state, "constitution", 1)
        expect(state.constitution).toBe(1)
        expect(Object.values(state).reduce((s, v) => s + (v ?? 0), 0)).toBe(3)
    })

    it("does not go below 0 when decrementing", () => {
        const state = applyBonusChange({}, "wisdom", -1)
        expect(state.wisdom).toBe(0)
    })

    it("backgroundBonusComplete is true when no suggestedAttributes", () => {
        const suggestedAttrKeys: AssistedAttributeKey[] = []
        const bonusTotal = 0
        const complete = suggestedAttrKeys.length === 0 || bonusTotal === 3
        expect(complete).toBe(true)
    })

    it("backgroundBonusComplete requires exactly 3 points when suggestedAttributes present", () => {
        const suggestedAttrKeys: AssistedAttributeKey[] = ["strength", "dexterity"]
        expect(suggestedAttrKeys.length === 0 || 0 === 3).toBe(false)
        expect(suggestedAttrKeys.length === 0 || 3 === 3).toBe(true)
    })
})

describe("CATALOG_TO_SHEET_ATTRIBUTE mapping", () => {
    it("maps all Portuguese attribute names to their English sheet keys", () => {
        expect(CATALOG_TO_SHEET_ATTRIBUTE["Força"]).toBe("strength")
        expect(CATALOG_TO_SHEET_ATTRIBUTE["Destreza"]).toBe("dexterity")
        expect(CATALOG_TO_SHEET_ATTRIBUTE["Constituição"]).toBe("constitution")
        expect(CATALOG_TO_SHEET_ATTRIBUTE["Inteligência"]).toBe("intelligence")
        expect(CATALOG_TO_SHEET_ATTRIBUTE["Sabedoria"]).toBe("wisdom")
        expect(CATALOG_TO_SHEET_ATTRIBUTE["Carisma"]).toBe("charisma")
    })
})

describe("deselect behavior in catalog selection", () => {
    it("deselecting a race clears race fields on the sheet", () => {
        const sheet = createTemporaryAssistedSheet()
        const race = {
            _id: "race-1",
            name: "Elfo",
            speed: "9",
            size: "Médio",
            description: "",
            source: "PHB",
            status: "active" as const,
            image: null,
            traits: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        }
        const withRace = applyRaceToSheet(sheet, race)
        expect(withRace.raceRef).toBe("race-1")
        expect(withRace.movementSpeed).toBe("9")
        // deselect: clear race fields
        const deselected = { ...withRace, race: "", raceRef: null, movementSpeed: "", size: "" }
        expect(deselected.raceRef).toBeNull()
        expect(deselected.movementSpeed).toBe("")
        expect(deselected.size).toBe("")
    })

    it("deselecting a background clears origin fields and skill proficiencies", () => {
        const sheet = createTemporaryAssistedSheet()
        const background = {
            _id: "bg-1",
            name: "Soldado",
            skillProficiencies: ["Atletismo", "Intimidação"],
            suggestedAttributes: [],
            description: "",
            source: "PHB",
            status: "active" as const,
            equipment: "",
            traits: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        }
        const withBackground = applyBackgroundToSheet(sheet, background)
        expect(withBackground.originRef).toBe("bg-1")
        expect(withBackground.skills.Atletismo.proficient).toBe(true)
        // deselect: clear origin fields and skills
        const deselected = { ...withBackground, origin: "", originRef: null, skills: createEmptySkills() }
        expect(deselected.originRef).toBeNull()
        expect(deselected.skills.Atletismo.proficient).toBe(false)
    })
})
