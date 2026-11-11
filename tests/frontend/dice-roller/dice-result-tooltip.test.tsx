/** @vitest-environment happy-dom */
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DiceResultTooltip } from "@/features/dice-roller/components/dice-result-tooltip"
import type { DiceRollResponse } from "@/features/dice-roller/types"

const base: DiceRollResponse = {
    rollId: "r1",
    label: "Espada Longa · ataque",
    terms: [{ dice: "d20", quantity: 1, results: [15] }],
    mode: "normal",
    diceTotal: 15,
    modifier: 5,
    modifierParts: [{ label: "Força", value: 3, color: "strength" }, { label: "Proficiência", value: 2, color: "prof" }],
    total: 20,
    createdAt: "2026-01-01T12:34:56.000Z",
}

const advantage: DiceRollResponse = { ...base, mode: "advantage", terms: [{ dice: "d20", quantity: 1, results: [17] }], selectedD20: { kept: 17, discarded: 4, reason: "advantage" }, diceTotal: 17, total: 22 }
const disadvantage: DiceRollResponse = { ...base, mode: "disadvantage", terms: [{ dice: "d20", quantity: 1, results: [4] }], selectedD20: { kept: 4, discarded: 17, reason: "disadvantage" }, diceTotal: 4, total: 9 }

function open(roll: DiceRollResponse) {
    render(
        <div>
            <DiceResultTooltip roll={roll}>{roll.total}</DiceResultTooltip>
            <button type="button">fora</button>
        </div>,
    )
    const trigger = screen.getByTestId("dice-result-tooltip-trigger")
    act(() => trigger.focus())
    return { trigger, tooltip: screen.getByRole("tooltip") }
}

describe("DiceResultTooltip (DND-47)", () => {
    it("rolagem normal: cabeçalho, dados, cada parcela nomeada e a conta até o total", () => {
        const { trigger, tooltip } = open(base)
        expect(trigger).toHaveAttribute("aria-describedby", tooltip.id)
        expect(tooltip.closest("body")).toBe(document.body)
        expect(within(tooltip).getByText("Espada Longa · ataque")).toBeInTheDocument()
        expect(within(tooltip).getByTestId("dice-tooltip-mode")).toHaveTextContent("Normal")
        expect(within(tooltip).getByTestId("dice-tooltip-formula")).toHaveTextContent("1d20 + 5")
        expect(within(tooltip).getAllByTestId("dice-tooltip-die").map((die) => die.textContent)).toEqual(["15"])
        expect(within(tooltip).queryByTestId("dice-tooltip-d20-pair")).not.toBeInTheDocument()
        const lines = within(tooltip).getAllByTestId("dice-tooltip-line").map((line) => line.textContent)
        expect(lines).toEqual(["Dados (1d20)15", "Força+3", "Proficiência+2"])
        expect(within(tooltip).getByTestId("dice-tooltip-equation")).toHaveTextContent("15 + 3 + 2 = 20")
        expect(within(tooltip).getByTestId("dice-tooltip-total")).toHaveTextContent("20")
    })

    it("vantagem: os dois d20, o maior mantido e o menor descartado (riscado)", () => {
        const { tooltip } = open(advantage)
        expect(within(tooltip).getByTestId("dice-tooltip-mode")).toHaveTextContent("Vantagem")
        expect(within(tooltip).getByTestId("dice-tooltip-d20-kept")).toHaveTextContent("d20 17mantido")
        const discarded = within(tooltip).getByTestId("dice-tooltip-d20-discarded")
        expect(discarded).toHaveTextContent("d20 4descartado")
        expect(discarded.querySelector(".line-through")).toHaveTextContent("d20 4")
        expect(within(tooltip).getByTestId("dice-tooltip-equation")).toHaveTextContent("17 + 3 + 2 = 22")
    })

    it("desvantagem: o menor mantido e o maior descartado, com as parcelas", () => {
        const { tooltip } = open(disadvantage)
        expect(within(tooltip).getByTestId("dice-tooltip-mode")).toHaveTextContent("Desvantagem")
        expect(within(tooltip).getByTestId("dice-tooltip-d20-kept")).toHaveTextContent("d20 4")
        expect(within(tooltip).getByTestId("dice-tooltip-d20-discarded")).toHaveTextContent("d20 17")
        expect(within(tooltip).getAllByTestId("dice-tooltip-line").map((line) => line.textContent)).toEqual(["Dados (1d20)4", "Força+3", "Proficiência+2"])
        expect(within(tooltip).getByTestId("dice-tooltip-total")).toHaveTextContent("9")
    })

    it("sem parcelas: uma linha 'Modificador'; 20 natural mostra 'Sucesso crítico'", () => {
        const { tooltip } = open({ ...base, modifierParts: undefined, terms: [{ dice: "d20", quantity: 1, results: [20] }], diceTotal: 20, total: 25 })
        expect(within(tooltip).getAllByTestId("dice-tooltip-line").map((line) => line.textContent)).toEqual(["Dados (1d20)20", "Modificador+5"])
        expect(within(tooltip).getByTestId("dice-tooltip-critical")).toHaveTextContent("Sucesso crítico")
    })

    it("fecha com Esc e ao perder o foco; o toque alterna", () => {
        const { trigger } = open(base)
        fireEvent.keyDown(trigger, { key: "Escape" })
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
        act(() => trigger.blur())
        // Toque: pointerdown (foco não abre) e clique abre; um segundo toque fecha.
        fireEvent.pointerDown(trigger, { pointerType: "touch" })
        act(() => trigger.focus())
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
        fireEvent.click(trigger)
        expect(screen.getByRole("tooltip")).toBeInTheDocument()
        fireEvent.pointerDown(trigger, { pointerType: "touch" })
        fireEvent.click(trigger)
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    })

    it("abre com o teclado (Enter) e no hover do mouse", async () => {
        render(<DiceResultTooltip roll={base}>{base.total}</DiceResultTooltip>)
        const trigger = screen.getByTestId("dice-result-tooltip-trigger")
        fireEvent.pointerEnter(trigger, { pointerType: "mouse" })
        expect(await screen.findByRole("tooltip")).toBeInTheDocument()
        fireEvent.pointerLeave(trigger, { pointerType: "mouse" })
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
        fireEvent.keyDown(trigger, { key: "Enter" })
        expect(screen.getByRole("tooltip")).toBeInTheDocument()
    })
})
