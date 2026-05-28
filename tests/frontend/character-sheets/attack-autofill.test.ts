import { describe, expect, it } from "vitest"
import { buildSpellAttackAutofill, getAutoSpellAttackNotes, getCantripDamageDiceQuantity } from "@/features/character-sheets/utils/attack-autofill"

const calc = {
    spellAttackBonus: { value: 7 },
}

describe("character sheet attack autofill", () => {
    it("scales cantrip base dice quantity at levels 5, 11, and 17", () => {
        expect(getCantripDamageDiceQuantity(1, 1)).toBe(1)
        expect(getCantripDamageDiceQuantity(1, 5)).toBe(2)
        expect(getCantripDamageDiceQuantity(1, 11)).toBe(3)
        expect(getCantripDamageDiceQuantity(1, 17)).toBe(4)
    })

    it("keeps the base die type while scaling cantrip damage", () => {
        const autofill = buildSpellAttackAutofill({
            circle: 0,
            baseDice: { quantidade: 1, tipo: "d10" },
        }, calc, 11)

        expect(autofill.attackBonus).toBe("+7")
        expect(autofill.damageType).toContain('data-qty="3"')
        expect(autofill.damageType).toContain('data-faces="10"')
    })

    it("does not scale non-cantrip spell base dice", () => {
        const autofill = buildSpellAttackAutofill({
            circle: 1,
            baseDice: { quantidade: 1, tipo: "d8" },
        }, calc, 17)

        expect(autofill.damageType).toContain('data-qty="1"')
        expect(autofill.damageType).toContain('data-faces="8"')
    })

    it("marks auto-created spell attacks with a stable note", () => {
        expect(getAutoSpellAttackNotes("spell-1")).toBe("auto:spell:spell-1")
    })
})
