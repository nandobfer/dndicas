/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
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

    describe("layout do assento (DND-63, reabertura)", () => {
        const seat = (over: Partial<MaddoxGameParticipantDto>): MaddoxGameParticipantDto => ({ memberId: "m1", userId: "u1", name: "Marina Dona", characterName: "Kael", portraitUrl: null, role: "owner", ready: true, eligible: true, declared: false, xp: null, ...over })
        const renderSeats = (participants: MaddoxGameParticipantDto[]) => {
            const state = {
                campaignId: "c1",
                status: "active",
                turn: { number: 2, phase: "players", startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [], opexActor: null },
                participants,
                me: { memberId: "m1", isOwner: false, ready: true, eligible: true, declared: false, sheet: null },
            } as unknown as MaddoxGameStateDto
            return render(<TurnPanel state={state} presence={{ available: true, online: new Set(["u1", "u2"]) }} color="#3b82f6" skipping={false} onSkip={vi.fn()} />)
        }
        const armorClass = { value: 17, formula: "Base(10) + DEX(4) + Escudo da Fé(2) + Armadura(1) = 17", parts: [] }

        it("a barra de XP ocupa a largura do assento: filha direta do card, fora da coluna do nome", () => {
            renderSeats([seat({ xp: experienceProgress(900, 3), hp: { current: 9, max: 12, temp: 0 }, armorClass })])
            const card = screen.getByTestId("seat-m1")
            const xpBar = within(card).getByTestId("xp-bar")
            expect(xpBar.parentElement).toBe(card)
            expect(xpBar.parentElement?.lastElementChild).toBe(xpBar)
            expect(within(card).getByTestId("seat-character-name").contains(xpBar)).toBe(false)
        })

        it("PV logo abaixo do nome, com a CA à direita na mesma linha, também fora do combate", () => {
            renderSeats([seat({ hp: { current: 9, max: 12, temp: 3 }, armorClass })])
            const vitals = screen.getByTestId("seat-vitals")
            const hp = within(vitals).getByTestId("seat-hp")
            const ca = within(vitals).getByTestId("seat-armor-class")
            // Ordem: barra de PV primeiro, CA depois (à direita).
            expect(hp.compareDocumentPosition(ca) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
            expect(hp).toHaveTextContent("9/12 +3")
            expect(within(hp).getByRole("progressbar", { name: "PV de Kael: 9 de 12 (+3 temporários)" })).toHaveAttribute("aria-valuenow", "9")
            // A linha fica na coluna do nome, logo depois do nome do jogador.
            expect(screen.getByTestId("seat-character-name").parentElement).toBe(vitals.parentElement)
            // Badge de CA: só o valor, sem o rótulo "CA".
            expect(ca).toHaveTextContent(/^17$/)
        })

        it("sem PV e sem CA (grau narrativo) não há linha de PV/CA; só com CA aparece só ela", () => {
            renderSeats([seat({}), seat({ memberId: "m2", userId: "u2", characterName: "Lyra", role: "player", armorClass })])
            expect(within(screen.getByTestId("seat-m1")).queryByTestId("seat-vitals")).toBeNull()
            const vitals = within(screen.getByTestId("seat-m2")).getByTestId("seat-vitals")
            expect(within(vitals).queryByTestId("seat-hp")).toBeNull()
            expect(within(vitals).getByTestId("seat-armor-class")).toBeInTheDocument()
        })

        it("situação como bolinha no canto superior direito do avatar (com tooltip); sem bolinha de online; o Opex sem a linha 'Personagem Opex'", async () => {
            renderSeats([seat({}), seat({ memberId: "m9", userId: "opex:m9", name: "Personagem Opex", characterName: "Tork", role: "player", opex: true })])
            const card = screen.getByTestId("seat-m1")
            const dot = within(card).getByTestId("seat-status")
            expect(dot).toHaveAccessibleName("Aguardando")
            expect(dot.className).toContain("-top-0.5")
            expect(dot.className).toContain("-right-0.5")
            expect(dot.parentElement?.querySelector("button")).not.toBeNull()
            expect(card).not.toHaveTextContent("Aguardando")
            expect(within(card).queryByRole("img", { name: /^(Online|Offline)$/ })).toBeNull()
            fireEvent.focus(dot)
            expect(await screen.findByRole("tooltip")).toHaveTextContent("Aguardando")
            const opex = screen.getByTestId("seat-m9")
            expect(within(opex).getByText("Opex")).toBeInTheDocument()
            expect(opex).not.toHaveTextContent("Personagem Opex")
            expect(within(opex).queryByTestId("seat-status")).toBeNull()
        })
    })
})

