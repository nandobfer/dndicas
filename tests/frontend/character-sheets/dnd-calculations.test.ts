import { describe, expect, it } from "vitest"

import { getArmorClass } from "@/features/character-sheets/utils/dnd-calculations"

describe("character sheet armor class calculations", () => {
    it("sums every named armor class bonus with its own name (DND-66)", () => {
        const result = getArmorClass(14, null, null, [], [{ name: "Escudo da Fé", value: 2 }, { name: "Cobertura parcial", value: 2 }])

        expect(result.value).toBe(16)
        expect(result.formula).toBe("Base(10) + DEX(2) + Escudo da Fé(2) + Cobertura parcial(2) = 16")
        expect((result.parts ?? []).filter((part) => part.color === "bonus").map((part) => [part.label, part.value])).toEqual([["Escudo da Fé", "+2"], ["Cobertura parcial", "+2"]])
    })

    it("applies unarmored defense with multiple attributes only when no base armor is equipped", () => {
        const result = getArmorClass(
            14,
            null,
            null,
            [{ name: "Anel de Proteção", acBonus: 1 }],
            [{ name: "Bônus manual", value: 1 }],
            { enabled: true, base: 10, attributes: ["constitution", "wisdom"] },
            { constitution: 16, wisdom: 12 },
        )

        expect(result.value).toBe(18)
        expect(result.formula).toBe("Defesa sem Armadura(10) + DEX(2) + CON(3) + SAB(1) + Anel de Proteção(1) + Bônus manual(1) = 18")
    })

    it("handles legacy unarmored defense data without attributes array", () => {
        const result = getArmorClass(
            14,
            null,
            null,
            [],
            [],
            { enabled: true, base: 10, attribute: "constitution" },
            { constitution: 16 },
        )

        expect(result.value).toBe(15)
        expect(result.formula).toBe("Defesa sem Armadura(10) + DEX(2) + CON(3) = 15")
    })

    it("handles incomplete unarmored defense data without selected attributes", () => {
        const result = getArmorClass(14, null, null, [], [], { enabled: true, base: 10 })

        expect(result.value).toBe(12)
        expect(result.formula).toBe("Defesa sem Armadura(10) + DEX(2) = 12")
    })

    it("ignores unarmored defense when base armor is equipped but keeps bonuses", () => {
        const result = getArmorClass(
            16,
            null,
            { name: "Cota de malha", ac: 16, armorType: "pesada" },
            [{ name: "Escudo", acBonus: 2 }],
            [{ name: "Escudo da Fé", value: 1 }],
            { enabled: true, base: 10, attributes: ["wisdom"] },
            { wisdom: 18 },
        )

        expect(result.value).toBe(19)
        expect(result.formula).toBe("Cota de malha(16) + Escudo(2) + Escudo da Fé(1) = 19")
    })

    it("keeps the medium armor dexterity cap", () => {
        const result = getArmorClass(18, null, { name: "Peitoral", ac: 14, armorType: "média" })

        expect(result.value).toBe(16)
        expect(result.formula).toBe("Peitoral(14) + DEX(2) = 16")
    })
})
