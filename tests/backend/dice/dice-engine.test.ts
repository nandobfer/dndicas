import { describe, expect, it } from "vitest"
import { rollDice } from "@/features/dice-roller/server/dice-engine"

describe("dice engine", () => {
    it("rolls multiple terms with a modifier", () => {
        const values = [4, 2, 3]
        const result = rollDice(
            {
                terms: [
                    { dice: "d6", quantity: 1 },
                    { dice: "d4", quantity: 2 },
                ],
                modifier: 2,
                mode: "normal",
                source: "manual",
            },
            {
                randomInt: () => values.shift()!,
                now: new Date("2026-01-01T00:00:00.000Z"),
                rollId: "roll-1",
            }
        )

        expect(result.diceTotal).toBe(9)
        expect(result.total).toBe(11)
        expect(result.terms).toEqual([
            { dice: "d6", quantity: 1, results: [4] },
            { dice: "d4", quantity: 2, results: [2, 3] },
        ])
    })

    it("keeps the highest primary d20 with advantage", () => {
        const result = rollDice(
            {
                terms: [{ dice: "d20", quantity: 1 }],
                modifier: 0,
                mode: "advantage",
                source: "manual",
            },
            {
                randomInt: (min, max) => max - 1,
            }
        )

        expect(result.selectedD20).toEqual({ kept: 20, discarded: 20, reason: "advantage" })
        expect(result.total).toBe(20)
    })

    it("uses an exact override for the kept d20 before applying modifier", () => {
        const result = rollDice(
            {
                terms: [{ dice: "d20", quantity: 1 }],
                modifier: 5,
                mode: "disadvantage",
                source: "manual",
            },
            {
                override: { dice: "d20", exact: 17 },
                randomInt: (min) => min,
            }
        )

        expect(result.selectedD20?.kept).toBe(17)
        expect(result.diceTotal).toBe(17)
        expect(result.total).toBe(22)
    })

    it("clamps range overrides to dice faces", () => {
        const result = rollDice(
            {
                terms: [{ dice: "d4", quantity: 1 }],
                modifier: 0,
                mode: "normal",
                source: "manual",
            },
            {
                override: { dice: "d4", min: 10, max: 20 },
                randomInt: (min) => min,
            }
        )

        expect(result.total).toBe(4)
    })

    it("rolls d100 values", () => {
        const result = rollDice(
            {
                terms: [{ dice: "d100", quantity: 1 }],
                modifier: 0,
                mode: "normal",
                source: "manual",
            },
            {
                randomInt: (min, max) => {
                    expect(min).toBe(1)
                    expect(max).toBe(101)
                    return 88
                },
            }
        )

        expect(result.terms).toEqual([{ dice: "d100", quantity: 1, results: [88] }])
        expect(result.total).toBe(88)
    })

    it("clamps d100 overrides to percentile faces", () => {
        const result = rollDice(
            {
                terms: [{ dice: "d100", quantity: 1 }],
                modifier: 0,
                mode: "normal",
                source: "manual",
            },
            {
                override: { dice: "d100", exact: 120 },
                randomInt: (min) => min,
            }
        )

        expect(result.total).toBe(100)
    })

    it("forces non-single d20 advantage rolls to normal", () => {
        const values = [12, 3]
        const result = rollDice(
            {
                terms: [
                    { dice: "d20", quantity: 1 },
                    { dice: "d4", quantity: 1 },
                ],
                modifier: 0,
                mode: "advantage",
                source: "manual",
            },
            {
                randomInt: () => values.shift()!,
            }
        )

        expect(result.mode).toBe("normal")
        expect(result.selectedD20).toEqual({ kept: 12, reason: "normal" })
        expect(result.total).toBe(15)
    })
})
