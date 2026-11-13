/** @vitest-environment happy-dom */
import * as React from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MaddoxGameMessageDto, MaddoxLevelUpStepDto } from "@/features/maddox/game-types"

/**
 * DND-56: cards "Subida de nível" (Pendente/Concluído, com o que cada um ganhou), de XP e de capítulo; o aviso e o wizard
 * que abre sozinho na mesa; o campo "Progressão de nível" da criação (só leitura no Editar).
 */

vi.mock("@/features/character-sheets/components/level-up/level-up-wizard", () => ({
    LevelUpWizard: ({ open, sheetId, characterName }: { open: boolean; sheetId: string; characterName?: string }) => (open ? <div data-testid="level-up-modal" data-sheet-id={sheetId}>{characterName}</div> : null),
}))

const { LevelUpCard, ExperienceCard, ChapterLine } = await import("@/features/maddox/components/game/ProgressionCards")
const { useGameLevelUps } = await import("@/features/maddox/components/game/GameLevelUps")
const { ProgressionModeField } = await import("@/features/maddox/components/campaigns/ProgressionModeField")

const step = (overrides: Partial<MaddoxLevelUpStepDto> = {}): MaddoxLevelUpStepDto => ({ id: "s1", characterId: "c1", characterName: "Nala", kind: "human", fromLevel: 1, toLevel: 2, status: "pending", gains: null, error: null, mine: true, canComplete: true, sheetId: "sheet-1", ...overrides })

const message = (extra: Partial<MaddoxGameMessageDto>): MaddoxGameMessageDto => ({ id: "m1", turnNumber: 5, phase: "master", kind: "level-up", memberId: null, characterName: null, portraitUrl: null, content: "", replyToId: null, skippedByName: null, error: null, check: null, combat: null, createdAt: new Date(0).toISOString(), ...extra })

beforeEach(() => window.sessionStorage.clear())

describe("card Subida de nível", () => {
    it("lista cada personagem com Pendente/Concluído; o Opex já aparece concluído com as escolhas", () => {
        const onComplete = vi.fn()
        render(
            <LevelUpCard
                onComplete={onComplete}
                message={message({
                    levelUp: {
                        toLevel: 2,
                        reason: "Fim da emboscada.",
                        source: "marco",
                        entries: [
                            step(),
                            step({ id: "s2", characterName: "Vaelyra", kind: "opex", status: "done", mine: false, canComplete: false, gains: { fromLevel: 1, toLevel: 2, hp: { method: "roll", gain: 6, die: 4, hpMax: 14 }, subclass: null, feat: { name: "Aumento no Valor de Atributo", attributes: { intelligence: 2 } }, traits: ["Erudito"], cantrips: [], spells: ["Sono"], swap: null } }),
                        ],
                    },
                })}
            />,
        )
        const card = screen.getByTestId("level-up-card")
        expect(card).toHaveTextContent("Subida de nível · nível 2")
        expect(card).toHaveTextContent("Fim da emboscada.")
        const [nala, vaelyra] = screen.getAllByTestId("level-up-entry")
        expect(within(nala!).getByTestId("level-up-status")).toHaveTextContent("Pendente")
        expect(within(vaelyra!).getByTestId("level-up-status")).toHaveTextContent("Concluído")
        expect(within(vaelyra!).getByTestId("level-up-gains")).toHaveTextContent("PV +6 (rolagem: 4) → 14")
        expect(within(vaelyra!).getByTestId("level-up-gains")).toHaveTextContent("Talento: Aumento no Valor de Atributo (INT +2)")
        expect(within(vaelyra!).getByTestId("level-up-gains")).toHaveTextContent("Magias: Sono")
        fireEvent.click(within(nala!).getByRole("button", { name: "Subir de nível" }))
        expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }))
        expect(within(vaelyra!).queryByRole("button")).not.toBeInTheDocument()
    })

    it("cards de XP e de capítulo", () => {
        render(
            <>
                <ExperienceCard message={message({ kind: "experience", experience: { source: "combat", reason: "Combate \"Emboscada\"", total: 99, entries: [{ characterId: "c1", characterName: "Nala", amount: 33, total: 333 }] } })} />
                <ChapterLine message={message({ id: "m2", kind: "chapter", chapter: { title: "A Trilha Triboar", summary: "…" } })} />
            </>,
        )
        expect(screen.getByTestId("experience-card")).toHaveTextContent("Experiência: 99 XP")
        expect(screen.getByTestId("experience-card")).toHaveTextContent("Nala: +33 XP (total 333)")
        expect(screen.getByTestId("chapter-line")).toHaveTextContent("Capítulo encerrado: A Trilha Triboar")
    })
})

function Harness({ steps }: { steps: MaddoxLevelUpStepDto[] }) {
    const levelUps = useGameLevelUps(steps)
    return (
        <>
            {levelUps.banner}
            {levelUps.dialog}
        </>
    )
}

describe("aviso e wizard na mesa", () => {
    const wrap = (node: React.ReactNode) => <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>

    it("abre sozinho uma vez para o jogador e o aviso fica até concluir", async () => {
        const { unmount } = render(wrap(<Harness steps={[step()]} />))
        expect(await screen.findByTestId("level-up-modal")).toHaveAttribute("data-sheet-id", "sheet-1")
        expect(screen.getByTestId("level-up-banner")).toHaveTextContent("Nala pode subir para o nível 2.")
        unmount()
        render(wrap(<Harness steps={[step()]} />))
        expect(screen.getByTestId("level-up-banner")).toBeInTheDocument()
        expect(screen.queryByTestId("level-up-modal")).not.toBeInTheDocument()
    })

    it("o dono vê a subida do Opex que falhou e conclui pelo aviso (sem abrir sozinho)", () => {
        render(wrap(<Harness steps={[step({ id: "s9", characterName: "Uther", kind: "opex", status: "failed", mine: false, sheetId: "sheet-uther" })]} />))
        expect(screen.queryByTestId("level-up-modal")).not.toBeInTheDocument()
        expect(screen.getByTestId("level-up-banner")).toHaveTextContent("A subida de Uther para o nível 2 falhou.")
        fireEvent.click(screen.getByRole("button", { name: "Subir de nível" }))
        expect(screen.getByTestId("level-up-modal")).toHaveAttribute("data-sheet-id", "sheet-uther")
    })
})

describe("Progressão de nível da campanha", () => {
    it("só nos graus com ficha; escolhida na criação e só leitura no Editar", () => {
        const onChange = vi.fn()
        const { rerender } = render(<ProgressionModeField rigor="narrativo" value="marco" onChange={onChange} />)
        expect(screen.queryByTestId("progression-mode-field")).not.toBeInTheDocument()
        rerender(<ProgressionModeField rigor="rigoroso" value="marco" onChange={onChange} />)
        fireEvent.click(screen.getByRole("button", { name: "Experiência" }))
        expect(onChange).toHaveBeenCalledWith("experiencia")
        rerender(<ProgressionModeField rigor="fiel-dnd" value={null} readOnly />)
        expect(screen.getByTestId("progression-mode-value")).toHaveTextContent("Marco")
        expect(screen.queryByRole("button", { name: "Experiência" })).not.toBeInTheDocument()
    })
})
