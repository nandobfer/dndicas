/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxGameMessageDto, MaddoxRestCharacterDto, MaddoxRestDto } from "@/features/maddox/game-types"

/**
 * DND-58: o balão do descanso. Textos de curto e longo, interrompido, resumo por personagem, dados de vida (o painel fica
 * montado até o dado sair), trocas com "Nada a trocar"/"Concluir trocas", a falha da preparação para o dono e o Opex.
 */

/** Painel de dados falso: "Rolar" chama a rolagem oficial; "Fim" simula o palco saindo. */
vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({
    DiceRollerPanel: (props: { rollButtonLabel?: string; hideRollButton?: boolean; disableRolling?: boolean; rollRequest?: () => Promise<DiceRollResponse>; onStageHidden?: (roll: DiceRollResponse) => void; externalResult?: DiceRollResponse | null }) => (
        <div data-testid="dice-panel" data-external={props.externalResult ? "true" : "false"}>
            {!props.hideRollButton && (
                <button type="button" disabled={props.disableRolling} onClick={() => void props.rollRequest?.()}>
                    {props.rollButtonLabel ?? "JOGAR"}
                </button>
            )}
            <button type="button" onClick={() => props.onStageHidden?.({} as DiceRollResponse)}>
                Fim
            </button>
        </div>
    ),
}))

const { RestCard } = await import("@/features/maddox/components/game/rest/RestCard")

const roll = (total: number): DiceRollResponse => ({ rollId: "r", terms: [{ dice: "d8", quantity: 1, results: [total - 2] }], mode: "normal", diceTotal: total - 2, modifier: 2, total, createdAt: "" })

const entry = (over: Partial<MaddoxRestCharacterDto> = {}): MaddoxRestCharacterDto => ({
    characterId: "c1",
    name: "Lyra",
    portraitUrl: null,
    opex: false,
    prep: { status: "ready", recovered: [{ label: "PV", before: "4", after: "20" }], notRecovered: [{ label: "Sorte", reason: "o catálogo não diz como esta carga se recupera" }], skippedCatalog: false, error: null },
    hitDice: { status: "none", die: "d8", available: 0, hp: 20, hpMax: 20, constitution: 2, rolls: [] },
    exchange: { status: "open", applied: [], requests: 0 },
    answeredBy: "player",
    doneReason: null,
    done: false,
    can: { roll: false, exchange: true, retryPrep: false },
    ...over,
})

const message = (rest: Partial<MaddoxRestDto>): MaddoxGameMessageDto => ({
    id: "rest-1",
    turnNumber: 3,
    phase: "master",
    kind: "rest",
    memberId: null,
    characterName: null,
    portraitUrl: null,
    content: "",
    replyToId: null,
    skippedByName: null,
    error: null,
    check: null,
    combat: null,
    createdAt: "",
    rest: { type: "long", status: "running", description: "Noite na estalagem.", interruption: null, characters: [entry()], ...rest },
})

const handlers = (over: Record<string, unknown> = {}) => ({
    isOwner: false,
    onRollHitDie: vi.fn(async () => roll(8)),
    onDeclineHitDice: vi.fn(),
    onExchange: vi.fn(async () => undefined),
    onFinishExchange: vi.fn(),
    onRetryPrep: vi.fn(),
    onSkipPrep: vi.fn(),
    ...over,
})

describe("DND-58 — balão do descanso", () => {
    it("longo: título, texto próprio, frase do Maddox e o resumo do que voltou e do que não voltou", () => {
        render(<RestCard message={message({})} color="#fff" handlers={null} replays={new Map()} />)
        expect(screen.getByTestId("rest-title")).toHaveTextContent("Descanso longo")
        expect(screen.getByTestId("rest-title")).toHaveTextContent("Em andamento")
        expect(screen.getByTestId("rest-intro")).toHaveTextContent("Oito horas de sono")
        expect(screen.getByText("Noite na estalagem.")).toBeInTheDocument()
        expect(screen.getByTestId("rest-recovered")).toHaveTextContent("PV: 4 → 20")
        expect(screen.getByTestId("rest-not-recovered")).toHaveTextContent("Sorte não voltou (o catálogo não diz como esta carga se recupera)")
        // Diário (sem ações): nenhum controle.
        expect(screen.queryByTestId("rest-exchange")).toBeNull()
    })

    it("curto tem outro texto; interrompido diz que nada foi recuperado", () => {
        const { rerender } = render(<RestCard message={message({ type: "short" })} color="#fff" handlers={null} replays={new Map()} />)
        expect(screen.getByTestId("rest-intro")).toHaveTextContent("Uma hora de pausa")
        rerender(<RestCard message={message({ status: "interrupted", interruption: "Lobos atacam." })} color="#fff" handlers={null} replays={new Map()} />)
        expect(screen.getByTestId("rest-interrupted")).toHaveTextContent("O descanso foi interrompido: Lobos atacam.. Nada foi recuperado (Lyra).")
        expect(screen.getByTestId("rest-title")).toHaveTextContent("Interrompido")
    })

    it("dados de vida: rola um por vez, o painel fica até o dado sair (mesmo com a parte fechada) e 'Parar de rolar'", async () => {
        const h = handlers()
        const open = entry({ hitDice: { status: "open", die: "d8", available: 2, hp: 5, hpMax: 20, constitution: 2, rolls: [] }, can: { roll: true, exchange: true, retryPrep: false } })
        const { rerender } = render(<RestCard message={message({ type: "short", characters: [open] })} color="#fff" handlers={h} replays={new Map()} />)
        expect(screen.getByTestId("rest-hit-die-roller")).toHaveTextContent("PV 5/20 · 2 dado(s) restante(s)")
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Rolar dado de vida" })))
        expect(h.onRollHitDie).toHaveBeenCalledWith("rest-1", "c1")
        // A mesa nova chega no meio da animação com a parte fechada: o painel continua montado.
        const closed = entry({ hitDice: { status: "done", die: "d8", available: 1, hp: 13, hpMax: 20, constitution: 2, rolls: [{ roll: roll(8), total: 8, healed: 8, hpBefore: 5, hpAfter: 13 }] }, can: { roll: false, exchange: true, retryPrep: false } })
        rerender(<RestCard message={message({ type: "short", characters: [closed] })} color="#fff" handlers={h} replays={new Map()} />)
        expect(screen.getByTestId("rest-hit-die-roller")).toBeInTheDocument()
        expect(screen.getByTestId("rest-hit-die-roll")).toHaveTextContent("+8 PV (5 → 13)")
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Fim" })))
        expect(screen.queryByTestId("rest-hit-die-roller")).toBeNull()

        rerender(<RestCard message={message({ type: "short", characters: [{ ...open, hitDice: { ...open.hitDice, rolls: closed.hitDice.rolls } }] })} color="#fff" handlers={h} replays={new Map()} />)
        fireEvent.click(screen.getByTestId("rest-hit-dice-stop"))
        expect(screen.getByTestId("rest-hit-dice-stop")).toHaveTextContent("Parar de rolar")
        expect(h.onDeclineHitDice).toHaveBeenCalledWith("rest-1", "c1")
    })

    it("quem assiste vê o dado do outro pelo stream, sem botão", () => {
        const other = entry({ hitDice: { status: "open", die: "d8", available: 2, hp: 5, hpMax: 20, constitution: 2, rolls: [] }, can: { roll: false, exchange: false, retryPrep: false } })
        render(<RestCard message={message({ type: "short", characters: [other] })} color="#fff" handlers={handlers()} replays={new Map([["rest-1:c1", roll(6)]])} />)
        expect(screen.getByTestId("rest-hit-die-replay")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Rolar dado de vida" })).toBeNull()
    })

    it("trocas: envia o pedido em texto, 'Nada a trocar' antes do primeiro pedido e 'Concluir trocas' com confirmação depois", async () => {
        const h = handlers()
        const { rerender } = render(<RestCard message={message({})} color="#fff" handlers={h} replays={new Map()} />)
        fireEvent.change(screen.getByLabelText("Trocas de Lyra depois do descanso"), { target: { value: "Troco Escudo por Mísseis." } })
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Enviar pedido de troca" })))
        expect(h.onExchange).toHaveBeenCalledWith("rest-1", "c1", "Troco Escudo por Mísseis.")
        fireEvent.click(screen.getByRole("button", { name: "Nada a trocar" }))
        expect(h.onFinishExchange).toHaveBeenCalledWith("rest-1", "c1", true)

        rerender(<RestCard message={message({ characters: [entry({ exchange: { status: "open", applied: ["Magia Escudo: preparada → não preparada"], requests: 1 } })] })} color="#fff" handlers={h} replays={new Map()} />)
        expect(screen.getByTestId("rest-exchanges")).toHaveTextContent("Magia Escudo: preparada → não preparada")
        fireEvent.click(screen.getByRole("button", { name: "Concluir trocas" }))
        const dialog = await screen.findByRole("alertdialog")
        fireEvent.click(within(dialog).getByRole("button", { name: "Concluir trocas" }))
        expect(h.onFinishExchange).toHaveBeenCalledWith("rest-1", "c1", false)
    })

    it("preparação com falha: o dono vê o motivo, 'Tentar de novo' e 'Seguir sem' (com confirmação)", async () => {
        const h = handlers({ isOwner: true })
        const failed = entry({ prep: { status: "failed", recovered: [], notRecovered: [], skippedCatalog: false, error: "provedor fora" }, can: { roll: false, exchange: false, retryPrep: true } })
        render(<RestCard message={message({ characters: [failed] })} color="#fff" handlers={h} replays={new Map()} />)
        expect(screen.getByTestId("rest-prep-failed")).toHaveTextContent("Motivo: provedor fora")
        fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }))
        expect(h.onRetryPrep).toHaveBeenCalledWith("rest-1", "c1")
        fireEvent.click(screen.getByRole("button", { name: "Seguir sem" }))
        const dialog = await screen.findByRole("alertdialog")
        fireEvent.click(within(dialog).getByRole("button", { name: "Seguir sem" }))
        expect(h.onSkipPrep).toHaveBeenCalledWith("rest-1", "c1")
    })

    it("Personagem Opex com o agente parado: o dono responde por ele; os outros só leem", () => {
        const opex = entry({ name: "Eco", opex: true, answeredBy: "owner", can: { roll: false, exchange: true, retryPrep: false } })
        const { rerender } = render(<RestCard message={message({ characters: [opex] })} color="#fff" handlers={handlers({ isOwner: true })} replays={new Map()} />)
        expect(screen.getByTestId("rest-owner-answers")).toHaveTextContent("O agente de Eco não respondeu: responda por ele.")
        expect(screen.getByTestId("rest-exchange")).toBeInTheDocument()
        rerender(<RestCard message={message({ characters: [{ ...opex, can: { roll: false, exchange: false, retryPrep: false } }] })} color="#fff" handlers={handlers()} replays={new Map()} />)
        expect(screen.getByTestId("rest-owner-answers")).toHaveTextContent("O dono da campanha está respondendo por Eco.")
        expect(screen.queryByTestId("rest-exchange")).toBeNull()
        expect(screen.getByTestId("rest-character-status")).toHaveTextContent("Aguardando o dono da campanha")
    })
})
