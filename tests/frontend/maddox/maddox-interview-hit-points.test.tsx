/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { MaddoxHitPointsDto } from "@/features/maddox/interview-types"

vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({
    DiceRollerPanel: (props: { preset?: { terms?: { dice: string; quantity: number }[]; modifier?: number } | null; rollButtonLabel?: string; disableRolling?: boolean; rollRequest?: (input: unknown) => Promise<unknown>; onRollResolved?: (result: unknown) => void }) => (
        <div data-testid="fake-dice-panel" data-dice={props.preset?.terms?.map((term) => `${term.quantity}${term.dice}`).join("+")} data-modifier={props.preset?.modifier}>
            <button
                type="button"
                disabled={props.disableRolling}
                onClick={async () => {
                    const result = await props.rollRequest?.({})
                    props.onRollResolved?.(result)
                }}
            >
                {props.rollButtonLabel}
            </button>
        </div>
    ),
}))

const { HitPointsCard } = await import("@/features/maddox/components/interviews/HitPointsCard")

/** Card de PV por nível (Maddox 5): como o assistente de subir de nível da ficha — média ou dado de vida rolado. */

const pending = (over: Partial<MaddoxHitPointsDto> = {}): MaddoxHitPointsDto => ({
    status: "pending",
    level: 3,
    hitDie: "d10",
    constitutionModifier: 2,
    levelOne: 12,
    rows: [
        { level: 2, average: 7, die: null, rolled: null },
        { level: 3, average: 7, die: null, rolled: null },
    ],
    choices: null,
    total: null,
    reason: "PV dos níveis 2 e 3",
    submittedAt: null,
    ...over,
})

describe("card de pontos de vida da entrevista", () => {
    it("mostra o nível 1 automático e a média em cada nível; envia com confirmação", async () => {
        const onSubmit = vi.fn()
        render(<HitPointsCard card={pending()} color="#a855f7" disabled={false} onRoll={vi.fn()} onSubmit={onSubmit} />)
        const card = screen.getByTestId("hit-points-card")
        expect(card).toHaveTextContent("PV dos níveis 2 e 3")
        expect(card).toHaveTextContent("Dado de vida d10, Constituição +2. Nível 1: 12 (máximo do dado + CON).")
        expect(screen.getByTestId("hit-points-gain-2")).toHaveTextContent("+7")
        expect(screen.getByTestId("hit-points-total")).toHaveTextContent("PV máximo: 26")
        expect(screen.queryByTestId("hit-points-roller")).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: /Enviar pontos de vida/ }))
        fireEvent.click(await screen.findByRole("button", { name: "Enviar" }))
        expect(onSubmit).toHaveBeenCalledWith({ "2": "media", "3": "media" })
    })

    it("'Rolar vida' abre o painel com o dado de vida + CON; o ganho só aparece quando o dado para e então envia a rolagem", async () => {
        const onSubmit = vi.fn()
        let card = pending()
        const onRoll = vi.fn(async (level: number) => {
            card = pending({ rows: [card.rows[0]!, { level, average: 7, die: 7, rolled: 9 }] })
            view.rerender(<HitPointsCard card={card} color="#a855f7" disabled={false} onRoll={onRoll} onSubmit={onSubmit} />)
            return { rollId: "r1" } as never
        })
        const view = render(<HitPointsCard card={card} color="#a855f7" disabled={false} onRoll={onRoll} onSubmit={onSubmit} />)
        fireEvent.click(within(screen.getByTestId("hit-points-row-3")).getByRole("button", { name: "Rolar vida" }))
        const panel = screen.getByTestId("fake-dice-panel")
        expect(panel).toHaveAttribute("data-dice", "1d10")
        expect(panel).toHaveAttribute("data-modifier", "2")
        expect(screen.getByTestId("hit-points-total")).toHaveTextContent("PV máximo: —")
        expect(screen.getByRole("button", { name: /Enviar pontos de vida/ })).toBeDisabled()
        fireEvent.click(screen.getByRole("button", { name: "Rolar vida do nível 3" }))
        await waitFor(() => expect(screen.getByTestId("hit-points-gain-3")).toHaveTextContent("+9"))
        expect(onRoll).toHaveBeenCalledWith(3)
        expect(screen.getByTestId("hit-points-total")).toHaveTextContent("PV máximo: 28")
        expect(screen.queryByTestId("hit-points-roller")).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: /Enviar pontos de vida/ }))
        fireEvent.click(await screen.findByRole("button", { name: "Enviar" }))
        expect(onSubmit).toHaveBeenCalledWith({ "2": "media", "3": "rolagem" })
    })

    it("enviado: travado com o resumo por nível e o PV máximo; substituído mostra 'Reaberto abaixo'", () => {
        const submitted = pending({ status: "submitted", choices: { "2": "average", "3": "roll" }, rows: [{ level: 2, average: 7, die: null, rolled: null }, { level: 3, average: 7, die: 7, rolled: 9 }], total: 28 })
        const view = render(<HitPointsCard card={submitted} color="#a855f7" disabled={false} onRoll={vi.fn()} onSubmit={vi.fn()} />)
        expect(screen.getByTestId("hit-points-card")).toHaveAttribute("data-status", "submitted")
        expect(screen.getByTestId("hit-points-summary")).toHaveTextContent("Nível 1: 12Nível 2: média (+7)Nível 3: rolado 7 (+9)")
        expect(screen.getByTestId("hit-points-final")).toHaveTextContent("28")
        expect(screen.queryByRole("button", { name: /Enviar/ })).not.toBeInTheDocument()
        view.rerender(<HitPointsCard card={{ ...submitted, status: "superseded" }} color="#a855f7" disabled={false} onRoll={vi.fn()} onSubmit={vi.fn()} />)
        expect(screen.getByTestId("hit-points-card")).toHaveTextContent("Reaberto abaixo")
    })

    it("com o Maddox respondendo, nada pode ser escolhido nem enviado", () => {
        render(<HitPointsCard card={pending()} color="#a855f7" disabled onRoll={vi.fn()} onSubmit={vi.fn()} />)
        expect(screen.getByRole("button", { name: /Enviar pontos de vida/ })).toBeDisabled()
    })
})
