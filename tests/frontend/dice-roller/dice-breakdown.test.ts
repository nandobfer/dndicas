import { describe, expect, it } from "vitest"
import { buildDiceBreakdown } from "@/features/dice-roller/dice-breakdown"
import type { DiceRollResponse } from "@/features/dice-roller/types"

const roll = (overrides: Partial<DiceRollResponse>): DiceRollResponse => ({
    rollId: "r1",
    label: "Teste",
    terms: [{ dice: "d20", quantity: 1, results: [12] }],
    mode: "normal",
    diceTotal: 12,
    modifier: 0,
    total: 12,
    createdAt: "2026-01-01T12:34:56.000Z",
    ...overrides,
})

describe("buildDiceBreakdown (DND-47)", () => {
    it("rolagem normal com vários termos: um valor por dado, linha dos dados e 'Modificador' sem parcelas", () => {
        const breakdown = buildDiceBreakdown(roll({ terms: [{ dice: "d6", quantity: 2, results: [4, 6] }, { dice: "d4", quantity: 1, results: [3] }], diceTotal: 13, modifier: 3, total: 16 }))
        expect(breakdown.terms.map((term) => [term.label, term.values.map((die) => die.value)])).toEqual([["2d6", [4, 6]], ["1d4", [3]]])
        expect(breakdown.diceLabel).toBe("Dados (2d6 + 1d4)")
        expect(breakdown.lines).toEqual([{ label: "Modificador", value: 3, color: "manual" }])
        expect(breakdown.equation).toBe("13 + 3 = 16")
        expect(breakdown.formula).toBe("2d6 + 1d4 + 3")
        expect(breakdown.d20Pair).toBeNull()
    })

    it("vantagem: os dois d20 com o maior mantido; desvantagem: o menor mantido", () => {
        const advantage = buildDiceBreakdown(roll({ mode: "advantage", terms: [{ dice: "d20", quantity: 1, results: [17] }], selectedD20: { kept: 17, discarded: 4, reason: "advantage" }, diceTotal: 17, modifier: 2, total: 19 }))
        expect(advantage.d20Pair).toEqual({ kept: 17, discarded: 4, mode: "advantage" })
        expect(advantage.modeLabel).toBe("Vantagem")
        expect(advantage.terms[0]!.values).toEqual([{ value: 17, role: "kept" }])
        const disadvantage = buildDiceBreakdown(roll({ mode: "disadvantage", terms: [{ dice: "d20", quantity: 1, results: [4] }], selectedD20: { kept: 4, discarded: 17, reason: "disadvantage" }, diceTotal: 4, modifier: 2, total: 6 }))
        expect(disadvantage.d20Pair).toEqual({ kept: 4, discarded: 17, mode: "disadvantage" })
        expect(disadvantage.modeLabel).toBe("Desvantagem")
    })

    it("parcelas nomeadas: cada uma com o seu valor e a conta fechando no total do servidor", () => {
        const breakdown = buildDiceBreakdown(roll({ terms: [{ dice: "d20", quantity: 1, results: [15] }], diceTotal: 15, modifier: 3, modifierParts: [{ label: "Destreza", value: 5, color: "dexterity" }, { label: "Exaustão", value: -2, color: "manual" }], total: 18 }))
        expect(breakdown.lines.map((line) => [line.label, line.value])).toEqual([["Destreza", 5], ["Exaustão", -2]])
        expect(breakdown.equation).toBe("15 + 5 − 2 = 18")
        expect(breakdown.total).toBe(18)
    })

    it("parcelas antigas que não batem e total fora da soma: as diferenças entram como linhas e a conta fecha", () => {
        const breakdown = buildDiceBreakdown(roll({ diceTotal: 12, modifier: 4, modifierParts: [{ label: "Força", value: 3 }], total: 17 }))
        expect(breakdown.lines.map((line) => [line.label, line.value])).toEqual([["Força", 3], ["Outros", 1], ["Ajuste do servidor", 1]])
        expect(breakdown.equation).toBe("12 + 3 + 1 + 1 = 17")
    })

    it("sem modificador: nenhuma linha; crítico pelo d20 natural (ou o informado)", () => {
        const twenty = buildDiceBreakdown(roll({ terms: [{ dice: "d20", quantity: 1, results: [20] }], diceTotal: 20, total: 20 }))
        expect(twenty.lines).toEqual([])
        expect(twenty.equation).toBe("20 = 20")
        expect(twenty.critical).toBe("critical-success")
        expect(buildDiceBreakdown(roll({ terms: [{ dice: "d20", quantity: 1, results: [1] }], diceTotal: 1, total: 1 })).critical).toBe("critical-failure")
        expect(buildDiceBreakdown(roll({ terms: [{ dice: "d20", quantity: 1, results: [20] }], diceTotal: 20, total: 20 }), { criticalState: null }).critical).toBeNull()
    })

    it("4d6 dos atributos (dropLowest): o menor dado aparece descartado e a pontuação sem ele", () => {
        const breakdown = buildDiceBreakdown(roll({ terms: [{ dice: "d6", quantity: 4, results: [5, 2, 6, 2] }], diceTotal: 15, total: 15 }), { dropLowest: true })
        expect(breakdown.terms[0]!.values.map((die) => die.role)).toEqual(["rolled", "dropped", "rolled", "rolled"])
        expect(breakdown.keptScore).toBe(13)
        expect(breakdown.total).toBe(15)
    })

    it("d100 mostra o valor oficial", () => {
        const breakdown = buildDiceBreakdown(roll({ terms: [{ dice: "d100", quantity: 1, results: [73] }], diceTotal: 73, total: 73 }))
        expect(breakdown.terms[0]!.values).toEqual([{ value: 73, role: "rolled" }])
    })
})
