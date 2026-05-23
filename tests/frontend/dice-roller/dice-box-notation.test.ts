import { describe, expect, it } from "vitest"
import {
    buildDiceBoxNotation,
    expandStandbyVisualTerms,
    expandVisualResult,
} from "@/features/dice-roller/dice-box-notation"

describe("dice box notation", () => {
    it("builds predetermined notation from backend results", () => {
        expect(buildDiceBoxNotation({
            rollId: "roll-1",
            terms: [
                { dice: "d6", quantity: 2, results: [4, 5] },
                { dice: "d4", quantity: 1, results: [3] },
            ],
            mode: "normal",
            diceTotal: 12,
            modifier: 0,
            total: 12,
            createdAt: "2026-01-01T00:00:00.000Z",
        })).toBe("1d6+1d6+1d4@4,5,3!!")
    })

    it("uses kept and discarded d20 values for advantage", () => {
        const result = {
            rollId: "roll-adv",
            terms: [{ dice: "d20" as const, quantity: 1, results: [18] }],
            mode: "advantage" as const,
            selectedD20: { kept: 18, discarded: 7, reason: "advantage" as const },
            diceTotal: 18,
            modifier: 2,
            total: 20,
            createdAt: "2026-01-01T00:00:00.000Z",
        }

        expect(buildDiceBoxNotation(result)).toBe("1d20+1d20@18,7!!")
        expect(expandVisualResult(result).map((die) => die.rollRole)).toEqual(["kept", "discarded"])
    })

    it("represents d100 as two d10 dice", () => {
        const result = {
            rollId: "roll-d100",
            terms: [{ dice: "d100" as const, quantity: 1, results: [88] }],
            mode: "normal" as const,
            diceTotal: 88,
            modifier: 0,
            total: 88,
            createdAt: "2026-01-01T00:00:00.000Z",
        }

        expect(buildDiceBoxNotation(result)).toBe("1d10+1d10@8,8!!")
        expect(expandVisualResult(result).map((die) => die.dice)).toEqual(["d10", "d10"])
        expect(expandVisualResult(result).map((die) => die.sourceDice)).toEqual(["d100", "d100"])
    })

    it("encodes d100 zero-like faces as 10 on d10 dice", () => {
        const buildD100Notation = (value: number) => buildDiceBoxNotation({
            rollId: `roll-${value}`,
            terms: [{ dice: "d100", quantity: 1, results: [value] }],
            mode: "normal",
            diceTotal: value,
            modifier: 0,
            total: value,
            createdAt: "2026-01-01T00:00:00.000Z",
        })

        expect(buildD100Notation(20)).toBe("1d10+1d10@2,10!!")
        expect(buildD100Notation(7)).toBe("1d10+1d10@10,7!!")
        expect(buildD100Notation(100)).toBe("1d10+1d10@10,10!!")
    })

    it("shows max-face standby dice before rolling", () => {
        expect(expandStandbyVisualTerms([
            { dice: "d20", quantity: 1 },
            { dice: "d6", quantity: 2 },
        ], "normal").map((die) => `${die.dice}:${die.value}`)).toEqual(["d20:20", "d6:6", "d6:6"])
    })

    it("shows two max-face d20 dice while advantage is selected before rolling", () => {
        expect(expandStandbyVisualTerms([{ dice: "d20", quantity: 1 }], "advantage")).toMatchObject([
            { dice: "d20", value: 20, rollRole: "kept" },
            { dice: "d20", value: 20, rollRole: "discarded" },
        ])
    })

    it("shows d100 standby as two max-face d10 dice", () => {
        expect(expandStandbyVisualTerms([{ dice: "d100", quantity: 1 }], "normal")).toMatchObject([
            { dice: "d10", sourceDice: "d100", value: 10 },
            { dice: "d10", sourceDice: "d100", value: 10 },
        ])
    })
})
