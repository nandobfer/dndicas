import { describe, expect, it } from "vitest"

import { getArmorClass } from "@/features/character-sheets/utils/dnd-calculations"

describe("character sheet armor class calculations", () => {
    it("keeps the manual armor class bonus in the standard calculation", () => {
        const result = getArmorClass(14, null, null, [], 1)

        expect(result.value).toBe(13)
        expect(result.formula).toContain("bônus(1)")
    })

    it("applies unarmored defense with multiple attributes only when no base armor is equipped", () => {
        const result = getArmorClass(
            14,
            null,
            null,
            [{ name: "Anel de Proteção", acBonus: 1 }],
            1,
            { enabled: true, base: 10, attributes: ["constitution", "wisdom"] },
            { constitution: 16, wisdom: 12 },
        )

        expect(result.value).toBe(18)
        expect(result.formula).toBe("Defesa sem Armadura(10) + DEX(2) + CON(3) + SAB(1) + Anel de Proteção(1) + bônus(1) = 18")
    })

    it("handles legacy unarmored defense data without attributes array", () => {
        const result = getArmorClass(
            14,
            null,
            null,
            [],
            null,
            { enabled: true, base: 10, attribute: "constitution" },
            { constitution: 16 },
        )

        expect(result.value).toBe(15)
        expect(result.formula).toBe("Defesa sem Armadura(10) + DEX(2) + CON(3) = 15")
    })

    it("handles incomplete unarmored defense data without selected attributes", () => {
        const result = getArmorClass(14, null, null, [], null, { enabled: true, base: 10 })

        expect(result.value).toBe(12)
        expect(result.formula).toBe("Defesa sem Armadura(10) + DEX(2) = 12")
    })

    it("ignores unarmored defense when base armor is equipped but keeps bonuses", () => {
        const result = getArmorClass(
            16,
            null,
            { name: "Cota de malha", ac: 16, armorType: "pesada" },
            [{ name: "Escudo", acBonus: 2 }],
            1,
            { enabled: true, base: 10, attributes: ["wisdom"] },
            { wisdom: 18 },
        )

        expect(result.value).toBe(19)
        expect(result.formula).toBe("Cota de malha(16) + Escudo(2) + bônus(1) = 19")
    })

    it("keeps the medium armor dexterity cap", () => {
        const result = getArmorClass(18, null, { name: "Peitoral", ac: 14, armorType: "média" })

        expect(result.value).toBe(16)
        expect(result.formula).toBe("Peitoral(14) + DEX(2) = 16")
    })
})
