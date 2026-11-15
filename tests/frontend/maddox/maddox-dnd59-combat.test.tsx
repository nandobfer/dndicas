/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { MaddoxGameMessageDto } from "@/features/maddox/game-types"

/**
 * DND-59: o card da ação espera a revisão do mestre (pergunta ou lembrete sendo respondido) e mostra a vantagem que veio da
 * correção; a correção do combate aparece como linha na mesa.
 */

vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({
    DiceRollerPanel: (props: { rollButtonLabel?: string; preset?: { mode?: string }; disableRolling?: boolean }) => (
        <div data-testid="dice-panel" data-mode={props.preset?.mode} data-disabled={props.disableRolling ? "true" : "false"}>
            {props.rollButtonLabel}
        </div>
    ),
}))

const { CombatActionCard } = await import("@/features/maddox/components/game/combat/CombatCards")
const { CombatFixLine } = await import("@/features/maddox/components/game/CombatFixLine")

const baseStep = { targetKey: "npc:r1", targetName: "Rato gigante 1", roller: "player" as const, roll: null, total: null, hit: null, critical: false, success: null, amount: null, damageType: "perfurante", note: null, skill: null }
const attack = { ...baseStep, kind: "attack" as const, status: "pending" as const, dice: "1d20+6", mode: "advantage" as const, modeReasons: ["atacante invisível"] }
const damage = { ...baseStep, kind: "damage" as const, status: "pending" as const, dice: "1d4+4", mode: "normal" as const }
const card = (): MaddoxGameMessageDto =>
    ({
        id: "a1",
        turnNumber: 7,
        phase: "players",
        kind: "combat-action",
        memberId: "m1",
        characterName: "Lizwan",
        portraitUrl: null,
        content: "",
        replyToId: null,
        skippedByName: null,
        error: null,
        check: null,
        combat: null,
        createdAt: "2026-11-14T23:30:12.000Z",
        combatAction: { actorKey: "pc:liz", actorName: "Lizwan", actorKind: "character", economy: "action", category: "weapons", label: "Adaga", targets: [{ actorKey: "npc:r1", name: "Rato gigante 1" }], spellLevel: null, freeText: null, status: "pending", steps: [attack, damage], summary: "", cancellable: false, round: 1 },
    }) as MaddoxGameMessageDto

describe("DND-59 — card de ação com o mestre revisando", () => {
    it("enquanto o mestre revisa, o Rolar fica desabilitado com o aviso; o rolador já vem com a vantagem e o motivo", () => {
        render(<CombatActionCard message={card()} mine replay={null} onRoll={vi.fn()} onCancel={vi.fn()} masterReviewing />)
        expect(screen.getByTestId("dice-panel")).toHaveAttribute("data-disabled", "true")
        expect(screen.getByTestId("dice-panel")).toHaveAttribute("data-mode", "advantage")
        expect(screen.getByTestId("combat-roll-reviewing")).toHaveTextContent("O mestre está revisando um pedido; role quando a resposta chegar.")
        expect(screen.getByText(/Vantagem: atacante invisível/)).toBeInTheDocument()
    })

    it("sem revisão, o Rolar fica livre e sem aviso", () => {
        render(<CombatActionCard message={card()} mine replay={null} onRoll={vi.fn()} onCancel={vi.fn()} />)
        expect(screen.getByTestId("dice-panel")).toHaveAttribute("data-disabled", "false")
        expect(screen.queryByTestId("combat-roll-reviewing")).not.toBeInTheDocument()
    })

    it("quem só assiste não vê o aviso", () => {
        render(<CombatActionCard message={card()} mine={false} replay={null} onRoll={vi.fn()} onCancel={vi.fn()} masterReviewing />)
        expect(screen.queryByTestId("combat-roll-reviewing")).not.toBeInTheDocument()
    })
})

describe("DND-59 — linha da correção do combate", () => {
    it("mostra o texto da correção para toda a mesa", () => {
        render(<CombatFixLine message={{ ...card(), kind: "combat-fix", combatAction: null, content: "Lizwan está Invisível (Esconder-se · CD 15) — Venceu a Furtividade (15)" } as MaddoxGameMessageDto} />)
        expect(screen.getByTestId("combat-fix-line")).toHaveTextContent("Lizwan está Invisível (Esconder-se · CD 15) — Venceu a Furtividade (15)")
    })
})
