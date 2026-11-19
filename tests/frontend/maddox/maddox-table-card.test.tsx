/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { TurnPanel } from "@/features/maddox/components/game/TurnPanel"
import { combatPhaseLabel, tableSeatsView } from "@/features/maddox/game-view"
import { experienceProgress } from "@/features/maddox/experience-progress"
import type { MaddoxTacticalCombatDto, MaddoxTacticalSlotDto } from "@/features/maddox/game-types"
import { renderCombatTable, tableSeat, tableState } from "../../helpers/maddox-table"

/** DND-75: um único card de personagens na mesa — "Na mesa (N)" fora do combate, a ordem de iniciativa no combate tático. */

const slot = (over: Partial<MaddoxTacticalSlotDto>): MaddoxTacticalSlotDto => ({ actorKey: "pc:x", kind: "character", side: "personagem", name: "X", portraitUrl: null, memberId: null, initiative: null, active: false, hp: null, band: null, conditions: [], concentration: null, defeated: false, dead: false, stable: false, dying: false, ...over })

const combat: MaddoxTacticalCombatDto = {
    phase: "running",
    round: 2,
    activeKey: "npc:g1",
    order: [
        slot({ actorKey: "npc:g1", kind: "combatant", side: "inimigo", name: "Goblin", initiative: 19, active: true, band: "ferido", concentration: "Bênção" }),
        slot({ actorKey: "pc:kael", name: "Kael", memberId: "m1", initiative: 15, hp: { current: 20, max: 30, temp: 0 } }),
        slot({ actorKey: "npc:a1", kind: "combatant", side: "aliado", name: "Guarda", initiative: 8, band: "ileso" }),
        slot({ actorKey: "pc:lyra", name: "Lyra", memberId: "m2", initiative: 4, hp: { current: 9, max: 12, temp: 0 } }),
    ],
}
const participants = [
    tableSeat({ memberId: "m1", userId: "u1", name: "Marina", characterName: "Kael", role: "owner", armorClass: { value: 17, formula: "Base(10) + DEX(4) + Armadura(3) = 17", parts: [] } }),
    tableSeat({ memberId: "m2", userId: "u2", name: "Ana", characterName: "Lyra", xp: experienceProgress(900, 3) }),
    tableSeat({ memberId: "m3", userId: "u3", name: "Bia", characterName: "Nala", eligible: false }),
]
const rowsOf = () => [...screen.getByTestId("table-combat-order").querySelectorAll<HTMLElement>("[data-combat-slot]")]

describe("card da mesa — regras (game-view)", () => {
    it("combatPhaseLabel: preparação, iniciativa e rodada", () => {
        expect(combatPhaseLabel({ phase: "initiative", round: 0, preparation: { active: true, blocked: false, failures: [] } })).toBe("Preparando o combate")
        expect(combatPhaseLabel({ phase: "initiative", round: 0, preparation: null })).toBe("Rolando iniciativa")
        expect(combatPhaseLabel({ phase: "running", round: 3 })).toBe("Combate · Rodada 3")
    })

    it("tableSeatsView: sem combate tático, os participantes; com ele, a ordem ligada pelo memberId e quem ficou de fora", () => {
        expect(tableSeatsView(tableState({ participants }))).toEqual({ mode: "table", seats: participants })
        const view = tableSeatsView(tableState({ participants, combat: { ...combat, order: [...combat.order, slot({ actorKey: "pc:orfao", name: "Órfão", memberId: "m9", initiative: 1 })] } }))
        if (view.mode !== "combat") throw new Error("esperado combate")
        expect(view.label).toBe("Combate · Rodada 2")
        expect(view.title).toBe("Cripta")
        expect(view.order.map((item) => [item.slot.actorKey, item.participant?.memberId ?? null])).toEqual([
            ["npc:g1", null],
            ["pc:kael", "m1"],
            ["npc:a1", null],
            ["pc:lyra", "m2"],
            ["pc:orfao", null],
        ])
        expect(view.outside.map((participant) => participant.memberId)).toEqual(["m3"])
    })
})

describe("card da mesa — fora do combate", () => {
    it('"Na mesa (N)" só com os participantes, sem iniciativa', () => {
        render(<TurnPanel state={tableState({ participants })} presence={{ available: false, online: new Set() }} color="#3B82F6" skipping={false} onSkip={vi.fn()} />)
        expect(screen.getByTestId("table-card")).toHaveAttribute("data-mode", "table")
        expect(screen.getByText("Na mesa (3)")).toBeInTheDocument()
        expect(within(screen.getByRole("list", { name: "Participantes da mesa" })).getAllByRole("listitem")).toHaveLength(3)
        expect(screen.queryByTestId("table-combat-order")).not.toBeInTheDocument()
        expect(screen.queryByTestId("initiative-value")).not.toBeInTheDocument()
        expect(screen.queryByText("Goblin")).not.toBeInTheDocument()
    })
})

describe("card da mesa — combate tático", () => {
    it("uma única lista com jogadores e inimigos na ordem de iniciativa, quem age em destaque", () => {
        renderCombatTable(combat, { participants })
        expect(screen.getByTestId("table-card")).toHaveAttribute("data-mode", "combat")
        expect(screen.getAllByTestId("table-combat-order")).toHaveLength(1)
        expect(screen.queryByRole("list", { name: "Participantes da mesa" })).not.toBeInTheDocument()
        const rows = rowsOf()
        expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual(["combatant-npc:g1", "seat-m1", "combatant-npc:a1", "seat-m2"])
        expect(rows.map((row) => within(row).getByTestId("initiative-value").textContent)).toEqual(["19", "15", "8", "4"])
        expect(rows.map((row) => row.getAttribute("data-active"))).toEqual(["true", "false", "false", "false"])
        expect(within(rows[0]!).getByTestId("initiative-band")).toHaveTextContent("Ferido")
        expect(rows[0]).toHaveTextContent("Bênção")
    })

    it("título com a fase e o nome do combate", () => {
        const { unmount } = renderCombatTable({ ...combat, phase: "initiative", round: 0, preparation: { active: true, blocked: false, failures: [] } }, { participants, title: "Emboscada" })
        expect(screen.getByText("Preparando o combate")).toBeInTheDocument()
        expect(screen.getByTestId("table-combat-title")).toHaveTextContent("Emboscada")
        unmount()
        const second = renderCombatTable({ ...combat, phase: "initiative", round: 0 }, { participants })
        expect(screen.getByText("Rolando iniciativa")).toBeInTheDocument()
        second.unmount()
        renderCombatTable(combat, { participants })
        expect(screen.getByText("Combate · Rodada 2")).toBeInTheDocument()
        expect(screen.queryByText(/Na mesa/)).not.toBeInTheDocument()
    })

    it("a linha do jogador mantém situação, CA, PV, XP e Pular a vez; a do inimigo não tem nada disso", () => {
        renderCombatTable(combat, { participants, me: { memberId: "m1", isOwner: true } })
        const kael = screen.getByTestId("seat-m1")
        expect(within(kael).getByTestId("seat-status")).toBeInTheDocument()
        expect(within(kael).getByTestId("seat-armor-class")).toHaveTextContent("17")
        expect(within(kael).getByTestId("seat-hp")).toHaveTextContent("20/30")
        expect(kael).toHaveTextContent("Marina · você")
        const lyra = screen.getByTestId("seat-m2")
        expect(within(lyra).getByTestId("xp-bar")).toBeInTheDocument()
        expect(within(lyra).getByRole("button", { name: "Pular a vez de Lyra" })).toBeInTheDocument()
        const goblin = screen.getByTestId("combatant-npc:g1")
        expect(within(goblin).queryByRole("button")).not.toBeInTheDocument()
        expect(within(goblin).queryByTestId("seat-status")).not.toBeInTheDocument()
        expect(within(goblin).queryByTestId("seat-armor-class")).not.toBeInTheDocument()
        expect(within(goblin).queryByTestId("xp-bar")).not.toBeInTheDocument()
    })

    it('quem não está na ordem aparece em "Fora do combate"; sem ninguém de fora, o bloco não existe', () => {
        const { unmount } = renderCombatTable(combat, { participants })
        const outside = screen.getByRole("list", { name: "Fora do combate" })
        expect(within(outside).getByTestId("seat-m3")).toHaveTextContent("Nala")
        expect(within(outside).queryByTestId("initiative-value")).not.toBeInTheDocument()
        unmount()
        renderCombatTable(combat, { participants: participants.slice(0, 2) })
        expect(screen.queryByRole("list", { name: "Fora do combate" })).not.toBeInTheDocument()
        expect(screen.queryByText("Fora do combate")).not.toBeInTheDocument()
    })
})
