/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { XpBar } from "@/features/maddox/components/campaigns/XpBar"
import { TurnPanel } from "@/features/maddox/components/game/TurnPanel"
import { experienceProgress } from "@/features/maddox/experience-progress"
import type { MaddoxGameParticipantDto, MaddoxGameStateDto } from "@/features/maddox/game-types"

describe("XpBar (DND-63)", () => {
    it("mostra a XP, quanto falta e o progresso acessível", () => {
        render(<XpBar xp={experienceProgress(12_300, 5)} color="#3b82f6" />)
        const bar = screen.getByTestId("xp-bar")
        expect(bar).toHaveAttribute("title", "12.300 XP · faltam 1.700 para o nível 6")
        const progress = within(bar).getByRole("progressbar", { name: "12.300 XP · faltam 1.700 para o nível 6" })
        expect(progress).toHaveAttribute("aria-valuenow", "77")
        expect(bar).toHaveTextContent("12.300 / 14.000 XP")
    })

    it("nível 20: barra cheia com 'Nível máximo'", () => {
        render(<XpBar xp={experienceProgress(355_000, 20)} color="#3b82f6" />)
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
        expect(screen.getByTestId("xp-bar")).toHaveTextContent("Nível máximo")
    })

    it("sem XP (modo Marco ou sem ficha) não renderiza nada", () => {
        const { container } = render(<XpBar xp={null} color="#3b82f6" />)
        expect(container).toBeEmptyDOMElement()
        expect(screen.queryByTestId("xp-bar")).toBeNull()
    })

    it("Na mesa (TurnPanel): só o assento com XP mostra a barra", () => {
        const seat = (over: Partial<MaddoxGameParticipantDto>): MaddoxGameParticipantDto => ({ memberId: "m1", userId: "u1", name: "Marina Dona", characterName: "Kael", portraitUrl: null, role: "owner", ready: true, eligible: true, declared: false, xp: null, ...over })
        const state = {
            campaignId: "c1",
            status: "active",
            turn: { number: 2, phase: "players", startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [], opexActor: null },
            participants: [seat({}), seat({ memberId: "m2", userId: "u2", name: "Ana", characterName: "Lyra", role: "player", xp: experienceProgress(900, 3) })],
            me: { memberId: "m1", isOwner: false, ready: true, eligible: true, declared: false, sheet: null },
        } as unknown as MaddoxGameStateDto
        render(<TurnPanel state={state} presence={{ available: false, online: new Set() }} color="#3b82f6" skipping={false} onSkip={vi.fn()} />)
        expect(screen.getAllByTestId("xp-bar")).toHaveLength(1)
        expect(within(screen.getByTestId("seat-m2")).getByRole("progressbar", { name: "900 XP · faltam 1.800 para o nível 4" })).toBeInTheDocument()
        expect(within(screen.getByTestId("seat-m1")).queryByTestId("xp-bar")).toBeNull()
    })
})
