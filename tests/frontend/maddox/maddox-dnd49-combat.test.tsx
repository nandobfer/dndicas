/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxGameMessageDto } from "@/features/maddox/game-types"

/** DND-49: o card da ação no combate — a escolha do ataque furtivo depois do acerto e o motivo da vantagem. */

vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({
    DiceRollerPanel: (props: { rollButtonLabel?: string; preset?: { mode?: string } }) => (
        <div data-testid="dice-panel" data-mode={props.preset?.mode}>
            {props.rollButtonLabel}
        </div>
    ),
}))

const { CombatActionCard } = await import("@/features/maddox/components/game/combat/CombatCards")

const attackRoll: DiceRollResponse = { rollId: "r1", label: "Ataque", terms: [{ dice: "d20", quantity: 2, results: [17, 4] }], mode: "advantage", diceTotal: 17, modifier: 5, total: 22, selectedD20: { kept: 17, discarded: 4 }, createdAt: "2026-11-11T10:00:00.000Z" } as DiceRollResponse
const baseStep = { targetKey: "npc:g1", targetName: "Goblin 1", roller: "player" as const, mode: "normal" as const, roll: null, total: null, hit: null, critical: false, success: null, amount: null, damageType: "perfurante", note: null, skill: null }
const message = (steps: NonNullable<MaddoxGameMessageDto["combatAction"]>["steps"]): MaddoxGameMessageDto =>
    ({
        id: "a1",
        turnNumber: 4,
        phase: "players",
        kind: "combat-action",
        memberId: "m1",
        characterName: "Nala",
        portraitUrl: null,
        content: "",
        replyToId: null,
        skippedByName: null,
        error: null,
        check: null,
        combat: null,
        createdAt: "2026-11-11T10:00:00.000Z",
        combatAction: { actorKey: "pc:nala", actorName: "Nala", actorKind: "character", economy: "action", category: "weapons", label: "Adaga", targets: [{ actorKey: "npc:g1", name: "Goblin 1" }], spellLevel: null, freeText: null, status: "pending", steps, summary: "", cancellable: false, round: 3 },
    }) as MaddoxGameMessageDto

const hitWithAdvantage = { ...baseStep, kind: "attack" as const, status: "done" as const, dice: "1d20+5", mode: "advantage" as const, modeReasons: ["atacante invisível"], roll: attackRoll, total: 22, hit: true }
const sneakChoice = { ...baseStep, kind: "sneak-choice" as const, status: "pending" as const, dice: "1d6" }
const damage = { ...baseStep, kind: "damage" as const, status: "pending" as const, dice: "1d4+3" }

describe("DND-49 — ataque furtivo perguntado depois do acerto", () => {
    it("quem age vê 'Somar ataque furtivo (+1d6)' e 'Não somar'; o dado do dano só aparece depois da resposta", () => {
        const onSneakChoice = vi.fn()
        render(<CombatActionCard message={message([hitWithAdvantage, sneakChoice, damage])} mine replay={null} onRoll={vi.fn()} onCancel={vi.fn()} onSneakChoice={onSneakChoice} />)
        const choice = screen.getByTestId("combat-sneak-choice")
        expect(screen.queryByTestId("dice-panel")).not.toBeInTheDocument()
        fireEvent.click(within(choice).getByTestId("combat-sneak-add"))
        expect(onSneakChoice).toHaveBeenCalledWith("a1", true)
        expect(within(choice).getByTestId("combat-sneak-add")).toHaveTextContent("Somar ataque furtivo (+1d6)")
        fireEvent.click(within(choice).getByTestId("combat-sneak-skip"))
        expect(onSneakChoice).toHaveBeenLastCalledWith("a1", false)
    })

    it("os demais jogadores veem só 'aguardando a escolha'", () => {
        render(<CombatActionCard message={message([hitWithAdvantage, sneakChoice, damage])} mine={false} replay={null} onRoll={vi.fn()} onCancel={vi.fn()} onSneakChoice={vi.fn()} />)
        expect(screen.queryByTestId("combat-sneak-choice")).not.toBeInTheDocument()
        expect(screen.getAllByTestId("combat-step").find((step) => step.getAttribute("data-kind") === "sneak-choice")).toHaveTextContent("aguardando a escolha")
    })

    it("depois de somar, o card mostra 'somado' e o dado do dano volta", () => {
        render(<CombatActionCard message={message([hitWithAdvantage, { ...sneakChoice, status: "done", success: true }, { ...damage, dice: "1d4+3+1d6" }])} mine replay={null} onRoll={vi.fn()} onCancel={vi.fn()} onSneakChoice={vi.fn()} />)
        expect(screen.getByTestId("combat-step-sneak")).toHaveTextContent("somado (+1d6)")
        expect(screen.getByTestId("dice-panel")).toHaveTextContent("Rolar dano")
    })
})

describe("DND-49 — vantagem com o motivo e os dois d20", () => {
    it("ataque escondido: 'Vantagem: atacante invisível' e os dois d20 (o mantido em destaque)", () => {
        render(<CombatActionCard message={message([hitWithAdvantage, { ...damage }])} mine replay={null} onRoll={vi.fn()} onCancel={vi.fn()} />)
        expect(screen.getByTestId("combat-step-mode")).toHaveTextContent("Vantagem: atacante invisível")
        expect(screen.getByTestId("combat-step-d20s")).toHaveTextContent("d20: 17 · 4")
    })

    it("antes de rolar, o rolador já vem com a vantagem e o motivo aparece no passo", () => {
        render(<CombatActionCard message={message([{ ...baseStep, kind: "attack", status: "pending", dice: "1d20+5", mode: "advantage", modeReasons: ["atacante invisível"] }, damage])} mine replay={null} onRoll={vi.fn()} onCancel={vi.fn()} />)
        expect(screen.getByTestId("dice-panel")).toHaveAttribute("data-mode", "advantage")
        expect(screen.getByTestId("combat-step-mode")).toHaveTextContent("Vantagem: atacante invisível")
    })

    it("vantagem e desvantagem juntas: rolagem normal com os dois motivos", () => {
        render(<CombatActionCard message={message([{ ...hitWithAdvantage, mode: "normal", modeReasons: ["atacante invisível", "atacante envenenado"], roll: { ...attackRoll, selectedD20: undefined } }, damage])} mine replay={null} onRoll={vi.fn()} onCancel={vi.fn()} />)
        expect(screen.getByTestId("combat-step-mode")).toHaveTextContent("Normal: vantagem e desvantagem se anulam (atacante invisível, atacante envenenado)")
        expect(screen.queryByTestId("combat-step-d20s")).not.toBeInTheDocument()
    })
})
