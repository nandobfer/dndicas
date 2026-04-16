import { resolveChargesTotal } from "@/features/character-sheets/utils/resource-charges"
import type { Charges } from "@/features/shared/charges/types"

describe("resolveChargesTotal", () => {
    const contextBase = {
        proficiencyBonus: 3,
        attributeModifiers: {
            strength: 1,
            dexterity: 2,
            constitution: 3,
            intelligence: 4,
            wisdom: 5,
            charisma: 6,
        },
    }

    it("returns exact mapped by-level value when the current level exists", () => {
        const charges: Charges = {
            mode: "byLevel",
            values: [
                { level: 3, value: "4d6" },
                { level: 5, value: "6d8" },
            ],
        }

        expect(resolveChargesTotal(charges, { ...contextBase, level: 3 })).toBe(4)
    })

    it("reuses the closest previous by-level value for intermediate levels", () => {
        const charges: Charges = {
            mode: "byLevel",
            values: [
                { level: 3, value: "4d6" },
                { level: 5, value: "6d8" },
            ],
        }

        expect(resolveChargesTotal(charges, { ...contextBase, level: 4 })).toBe(4)
    })

    it("returns null when current level is below the first mapped level", () => {
        const charges: Charges = {
            mode: "byLevel",
            values: [
                { level: 3, value: "4d6" },
                { level: 5, value: "6d8" },
            ],
        }

        expect(resolveChargesTotal(charges, { ...contextBase, level: 2 })).toBeNull()
    })
})
