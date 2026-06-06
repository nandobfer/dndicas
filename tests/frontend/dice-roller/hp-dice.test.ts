import { describe, expect, it } from "vitest"
import { parseHpDiceFormula, parseStaticHpValue } from "@/features/dice-roller/utils/hp-dice"

describe("hp dice utilities", () => {
    it("parses static HP values", () => {
        expect(parseStaticHpValue("42")).toBe(42)
        expect(parseStaticHpValue(" 7 ")).toBe(7)
        expect(parseStaticHpValue("2d8 + 2")).toBeNull()
    })

    it("parses dice terms and fixed modifiers", () => {
        expect(parseHpDiceFormula("2d8 + 2")).toEqual({
            terms: [{ dice: "d8", quantity: 2 }],
            modifier: 2,
        })
        expect(parseHpDiceFormula("d6-1")).toEqual({
            terms: [{ dice: "d6", quantity: 1 }],
            modifier: -1,
        })
    })

    it("rejects unsupported or subtractive dice expressions", () => {
        expect(parseHpDiceFormula("2d3 + 1")).toBeNull()
        expect(parseHpDiceFormula("2d8 - 1d6")).toBeNull()
        expect(parseHpDiceFormula("especial")).toBeNull()
    })
})
