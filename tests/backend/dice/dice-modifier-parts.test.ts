import { describe, expect, it } from "vitest"
import { alignModifierParts, partsFromCalc } from "@/features/dice-roller/dice-breakdown"
import { DiceRollRequestSchema } from "@/features/dice-roller/schemas"
import { rollDice } from "@/features/dice-roller/server/dice-engine"

const fixed = (values: number[]) => ({ randomInt: () => values.shift()!, now: new Date("2026-01-01T00:00:00.000Z"), rollId: "roll-1" })

describe("DND-47 — parcelas do modificador na rolagem", () => {
    it("sem parcelas, a resposta é a de sempre (sem o campo)", () => {
        const result = rollDice({ terms: [{ dice: "d20", quantity: 1 }], modifier: 5, mode: "normal", source: "manual" }, fixed([12]))
        expect(result).not.toHaveProperty("modifierParts")
        expect(result.total).toBe(17)
    })

    it("com parcelas que somam o modificador, elas voltam como vieram (sem as de valor 0)", () => {
        const result = rollDice(
            { terms: [{ dice: "d20", quantity: 1 }], modifier: 5, mode: "normal", source: "sheet", modifierParts: [{ label: "Destreza", value: 3, color: "dexterity" }, { label: "Proficiência", value: 2, color: "prof" }, { label: "Nada", value: 0 }] },
            fixed([12]),
        )
        expect(result.modifierParts).toEqual([{ label: "Destreza", value: 3, color: "dexterity" }, { label: "Proficiência", value: 2, color: "prof" }])
        expect(result.total).toBe(17)
    })

    it("parcelas que não batem ganham a linha da diferença: a soma sempre fecha no modificador", () => {
        const result = rollDice({ terms: [{ dice: "d20", quantity: 1 }], modifier: 7, mode: "normal", source: "sheet", modifierParts: [{ label: "Destreza", value: 3 }] }, fixed([10]))
        expect(result.modifierParts).toEqual([{ label: "Destreza", value: 3 }, { label: "Outros", value: 4, color: "manual" }])
        expect(result.modifierParts!.reduce((sum, part) => sum + part.value, 0)).toBe(result.modifier)
    })

    it("alignModifierParts: rótulo do contexto, modificador negativo e sem parcelas", () => {
        expect(alignModifierParts([{ label: "Força", value: 3 }, { label: "Proficiência", value: 2 }], 7, "Ajuste da preparação do Maddox")).toEqual([
            { label: "Força", value: 3 },
            { label: "Proficiência", value: 2 },
            { label: "Ajuste da preparação do Maddox", value: 2, color: "manual" },
        ])
        expect(alignModifierParts([], -2)).toEqual([{ label: "Modificador", value: -2, color: "manual" }])
        expect(alignModifierParts(undefined, 0)).toEqual([])
    })

    it("partsFromCalc converte as partes da ficha (\"+3\", \"−1\", número) e ignora as não numéricas", () => {
        expect(partsFromCalc([{ label: "Destreza", value: "+3", color: "dexterity" }, { label: "Penalidade", value: "−1", color: "manual" }, { label: "Prof.", value: 2, color: "prof" }, { label: "Base", value: "x", color: "base" }])).toEqual([
            { label: "Destreza", value: 3, color: "dexterity" },
            { label: "Penalidade", value: -1, color: "manual" },
            { label: "Prof.", value: 2, color: "prof" },
        ])
    })

    it("o schema da rota aceita parcelas válidas e recusa rótulo vazio ou valor fracionado", () => {
        const base = { terms: [{ dice: "d20", quantity: 1 }], modifier: 2, mode: "normal", diceSessionId: "session-12345" }
        expect(DiceRollRequestSchema.safeParse({ ...base, modifierParts: [{ label: "Força", value: 2, color: "strength" }] }).success).toBe(true)
        expect(DiceRollRequestSchema.safeParse({ ...base, modifierParts: [{ label: " ", value: 2 }] }).success).toBe(false)
        expect(DiceRollRequestSchema.safeParse({ ...base, modifierParts: [{ label: "Força", value: 1.5 }] }).success).toBe(false)
    })
})
