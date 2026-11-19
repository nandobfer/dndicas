/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxGameMessageDto, MaddoxLiveGenerationDto, MaddoxLiveRollDto } from "@/features/maddox/game-types"

// O painel de dados só repete o resultado; "parar" simula o fim da animação (onRollSettled).
vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({
    DiceRollerPanel: (props: { externalResult?: DiceRollResponse | null; onRollSettled?: (roll: DiceRollResponse) => void; preset?: { label: string } }) => (
        <div data-testid="dice-panel" data-label={props.preset?.label}>
            {props.externalResult && <span data-testid="dice-replay">{props.externalResult.total}</span>}
            {props.externalResult && (
                <button type="button" onClick={() => props.onRollSettled?.(props.externalResult!)}>
                    parar
                </button>
            )}
        </div>
    ),
}))

const { MasterFixLine } = await import("@/features/maddox/components/game/MasterFixLine")
const { ReminderLine } = await import("@/features/maddox/components/game/ReminderLine")
const { EnemyInitiativeCard, CombatActionCard } = await import("@/features/maddox/components/game/combat/CombatCards")
const { GameMessageList } = await import("@/features/maddox/components/game/GameMessageList")
const { reduceGameStream, MADDOX_GAME_STREAM_INITIAL } = await import("@/features/maddox/hooks/useMaddoxGameStream")
const { talkBlockReason, masterBannerText } = await import("@/features/maddox/game-view")

const d20 = (kept: number, modifier: number, discarded?: number): DiceRollResponse => ({
    rollId: `r-${kept}-${modifier}-${discarded ?? "n"}`,
    terms: [{ dice: "d20", quantity: 1, results: [kept] }],
    mode: discarded !== undefined ? "disadvantage" : "normal",
    ...(discarded !== undefined ? { selectedD20: { kept, discarded, reason: "disadvantage" as const } } : {}),
    diceTotal: kept,
    modifier,
    total: kept + modifier,
    createdAt: "2026-11-07T00:00:00.000Z",
})

const message = (over: Partial<MaddoxGameMessageDto>): MaddoxGameMessageDto => ({
    id: "m1",
    turnNumber: 3,
    phase: "master",
    kind: "narration",
    memberId: null,
    characterName: null,
    portraitUrl: null,
    content: "",
    replyToId: null,
    skippedByName: null,
    error: null,
    check: null,
    combat: null,
    createdAt: "2026-11-07T00:00:00.000Z",
    ...over,
})

describe("DND-25/74 — lembrança e Conversar com o Mestre na conversa da mesa", () => {
    it("a conversa com o mestre fica desabilitada com o motivo (fora de jogo, entrevista pendente)", () => {
        expect(talkBlockReason({ status: "paused", me: { memberId: "m1", ready: true } } as never)).toBe("A campanha não está em andamento.")
        expect(talkBlockReason({ status: "active", me: { memberId: "m1", ready: false } } as never)).toBe("Conclua a entrevista de personagem com o Maddox antes de entrar no jogo.")
        expect(talkBlockReason({ status: "active", me: { memberId: "m1", ready: true } } as never)).toBeNull()
    })

    it("DND-74: a conversa com o mestre é a bolha fora da mesa, com o nome do usuário (não a do personagem nem a linha da lembrança)", () => {
        render(<GameMessageList messages={[message({ id: "t1", kind: "reminder", phase: "players", memberId: "m2", characterName: "Doran", authorName: "Ana", content: "O que tem no chão?", reminder: { status: "pending", talk: true } })]} myMemberId="m1" maddoxAvatarUrl={null} color="#fff" narrating={false} hasMore={false} loadingMore={false} onLoadMore={() => undefined} />)
        const talk = screen.getByTestId("game-talk")
        expect(talk.textContent).toContain("Ana")
        expect(talk.textContent).not.toContain("Doran")
        expect(screen.getByTestId("game-talk-label").textContent).toContain("conversa com o mestre · fora da mesa")
        expect(screen.getByTestId("game-talk-pending").textContent).toContain("Aguardando o mestre")
        expect(screen.queryByTestId("reminder-line")).toBeNull()
        expect(screen.queryByTestId("game-question")).toBeNull()
        expect(screen.queryByTestId("game-talk-failed")).toBeNull()
    })

    it("DND-74: a conversa que falhou fica encerrada com o aviso para enviar de novo (sem “Aguardando o mestre”)", () => {
        render(<GameMessageList messages={[message({ id: "t2", kind: "reminder", phase: "players", memberId: "m1", characterName: "Kael", authorName: "Bruno", content: "Cancele o teste.", reminder: { status: "failed", talk: true } })]} myMemberId="m1" maddoxAvatarUrl={null} color="#fff" narrating={false} hasMore={false} loadingMore={false} onLoadMore={() => undefined} />)
        expect(screen.getByTestId("game-talk")).toHaveAttribute("data-status", "failed")
        expect(screen.getByTestId("game-talk-failed").textContent).toContain("O mestre não conseguiu responder: envie de novo")
        expect(screen.queryByTestId("game-talk-pending")).toBeNull()
    })

    it("DND-74: a linha de resultado segue o desenho da lembrança injetada, com o que aconteceu com a lembrança", () => {
        const { rerender } = render(<MasterFixLine message={message({ kind: "master-fix", content: "Teste de Furtividade de Fulano atualizado: CD 15 → 10", masterFix: { kind: "check-update" } })} color="#fff" />)
        expect(screen.getByTestId("master-fix-line")).toHaveAttribute("data-kind", "check-update")
        expect(screen.getByTestId("master-fix-line").textContent).toContain("Teste de Furtividade de Fulano atualizado: CD 15 → 10")
        expect(screen.queryByTestId("master-fix-status")).toBeNull()
        rerender(<MasterFixLine message={message({ kind: "master-fix", content: "Lembrança injetada: Fulano tem vantagem no teste", masterFix: { kind: "reminder", status: "saved" } })} color="#fff" />)
        expect(screen.getByTestId("master-fix-status").textContent).toContain("Guardada como memória")
        rerender(<MasterFixLine message={message({ kind: "master-fix", content: "Teste de Atletismo de Fulano cancelado", masterFix: { kind: "check-cancel" } })} color="#fff" />)
        expect(screen.getByTestId("master-fix-line")).toHaveAttribute("data-kind", "check-cancel")
    })

    it("lembrança antiga (sem a conversa) continua como a linha discreta (não a bolha de declaração)", () => {
        render(<GameMessageList messages={[message({ id: "r1", kind: "reminder", phase: "players", memberId: "m2", characterName: "Doran", content: "Falo élfico.", reminder: { status: "pending" } })]} myMemberId="m1" maddoxAvatarUrl={null} color="#fff" narrating={false} hasMore={false} loadingMore={false} onLoadMore={() => undefined} />)
        expect(screen.getByTestId("reminder-line").textContent).toContain("Doran lembrou o Maddox: “Falo élfico.”")
        expect(screen.getByTestId("reminder-status").textContent).toContain("Aguardando o Maddox")
        expect(screen.queryByTestId("game-declaration")).toBeNull()
    })

    it("a linha na conversa mostra quem lembrou e o aviso de cada situação", () => {
        const { rerender } = render(<ReminderLine message={message({ kind: "reminder", characterName: "Lyra", content: "Tenho Alerta.", reminder: { status: "pending" } })} color="#fff" />)
        expect(screen.getByTestId("reminder-line").textContent).toContain("Lyra lembrou o Maddox: “Tenho Alerta.”")
        expect(screen.getByTestId("reminder-status").textContent).toContain("Aguardando o Maddox")
        rerender(<ReminderLine message={message({ kind: "reminder", characterName: "Lyra", content: "Tenho Alerta.", reminder: { status: "saved" } })} color="#fff" />)
        expect(screen.getByTestId("reminder-status").textContent).toContain("Guardada como memória")
        rerender(<ReminderLine message={message({ kind: "reminder", characterName: "Lyra", content: "Tenho Alerta.", reminder: { status: "discarded" } })} color="#fff" />)
        expect(screen.getByTestId("reminder-status").textContent).toContain("Usada só neste turno")
    })
})

describe("DND-25 — iniciativa dos inimigos", () => {
    const enemy = (over: Partial<NonNullable<MaddoxGameMessageDto["combatRoll"]>> = {}) =>
        message({ kind: "combat-roll", combatRoll: { kind: "enemy-initiative", status: "pending", reason: "Iniciativa · Goblin", dice: "1d20+2", mode: "normal", dc: null, roll: null, total: null, success: null, outcome: null, rolledByName: "o servidor", groupName: "Goblin", ...over } })

    it("espera os personagens; com o dado do stream, rola e só depois mostra dado, modificador e total; recarregado, mostra o resultado", () => {
        const { rerender } = render(<EnemyInitiativeCard message={enemy()} replay={null} />)
        expect(screen.getByTestId("enemy-initiative-name").textContent).toBe("Goblin")
        expect(screen.getByTestId("enemy-initiative-waiting").textContent).toBe("Aguardando os personagens")
        const roll = d20(11, 2)
        rerender(<EnemyInitiativeCard message={enemy({ status: "rolled", roll, total: 13 })} replay={roll} />)
        expect(screen.getByTestId("dice-replay").textContent).toBe("13")
        expect(screen.queryByTestId("enemy-initiative-result")).toBeNull()
        fireEvent.click(screen.getByText("parar"))
        expect(screen.getByTestId("enemy-initiative-result").textContent).toContain("13")
        expect(screen.getByTestId("enemy-initiative-result").textContent).toContain("d20 11 + 2")
        // Recarregada depois: resultado final, sem animação.
        rerender(<EnemyInitiativeCard key="reload" message={enemy({ status: "rolled", roll, total: 13 })} replay={null} />)
        expect(screen.queryByTestId("dice-panel")).toBeNull()
        expect(screen.getByTestId("enemy-initiative-result").textContent).toContain("13")
    })

    it("surpreendidos: mostra a desvantagem e o d20 descartado; vale o menor", () => {
        const roll = d20(4, 2, 17)
        render(<EnemyInitiativeCard message={enemy({ mode: "disadvantage", status: "rolled", roll, total: 6 })} replay={null} />)
        expect(screen.getByText("Desvantagem (surpreendidos)")).toBeTruthy()
        expect(screen.getByTestId("enemy-initiative-result").textContent).toContain("d20 4 (descartado 17)")
        expect(screen.getByTestId("enemy-initiative-result").textContent).toContain("6")
    })

    it("a faixa do turno do mestre não diz 'aguardando um jogador' enquanto o dado dos inimigos rola ou na pausa entre blocos", () => {
        expect(masterBannerText({ turn: { awaitingChecks: true, pendingChecks: [], pendingCombat: [], failed: false } } as never)).toBe("Turno do mestre — o Maddox está narrando…")
    })
})

describe("DND-25 — bloco de NPC ao vivo", () => {
    const liveRoll = (id: string, over: Partial<MaddoxLiveRollDto>): MaddoxLiveRollDto => ({ id, actorName: "Goblin 1", label: "Faca · ataque", step: "attack", targetName: "Kael", verdict: "hit", amount: null, damageType: null, roll: d20(15, 4), ...over })
    const live = (rolls: MaddoxLiveRollDto[]): MaddoxLiveGenerationDto => ({ liveId: "l1", kind: "narration", turnNumber: 3, replyToId: null, text: "O goblin crava a faca.", tool: false, startedAt: "2026-11-07T00:00:00.000Z", rolls })
    const list = (item: MaddoxLiveGenerationDto) => <GameMessageList messages={[]} myMemberId={null} maddoxAvatarUrl={null} color="#fff" narrating live={[item]} hasMore={false} loadingMore={false} onLoadMore={() => undefined} />

    it("os dados rolam um de cada vez (ataque, depois o dano) e a narração só aparece quando todos param", () => {
        const rolls = [liveRoll("a", {}), liveRoll("b", { label: "Faca · dano", step: "damage", verdict: null, amount: 5, damageType: "perfurante", roll: { ...d20(3, 2), rollId: "dmg", terms: [{ dice: "d4", quantity: 1, results: [3] }], total: 5 } })]
        render(list(live(rolls)))
        expect(screen.getAllByTestId("dice-panel")).toHaveLength(1)
        expect(screen.getByTestId("dice-replay").textContent).toBe("19")
        expect(screen.queryByText("O goblin crava a faca.")).toBeNull()
        fireEvent.click(screen.getByText("parar"))
        expect(screen.getByTestId("live-roll-result").textContent).toContain("Acertou")
        expect(screen.getByTestId("dice-replay").textContent).toBe("5")
        expect(screen.queryByText("O goblin crava a faca.")).toBeNull()
        fireEvent.click(screen.getByText("parar"))
        const results = screen.getAllByTestId("live-roll-result")
        expect(results.map((item) => item.dataset.step)).toEqual(["attack", "damage"])
        expect(results[1]!.textContent).toContain("5 de dano perfurante")
        expect(screen.queryByTestId("dice-panel")).toBeNull()
        expect(screen.getByText("O goblin crava a faca.")).toBeTruthy()
    })

    it("DND-53: 1 natural do adversário aparece como 'Falha crítica!' em vermelho, separado de 'Errou'", () => {
        render(list(live([liveRoll("a", { verdict: "fumble", roll: d20(1, 4) }), liveRoll("b", { verdict: "miss", targetName: "Lyra" })])))
        fireEvent.click(screen.getByText("parar"))
        fireEvent.click(screen.getByText("parar"))
        const verdicts = screen.getAllByTestId("live-roll-verdict")
        expect(verdicts.map((item) => [item.dataset.verdict, item.textContent])).toEqual([
            ["fumble", "Falha crítica!"],
            ["miss", "Errou"],
        ])
    })

    it("NPC sem ataque: bloco só com a narração", () => {
        render(list(live([])))
        expect(screen.queryByTestId("live-npc-rolls")).toBeNull()
        expect(screen.getByText("O goblin crava a faca.")).toBeTruthy()
    })

    it("stream: live-roll entra na geração ao vivo e combat-step-rolled vira o replay do passo", () => {
        let state = reduceGameStream(MADDOX_GAME_STREAM_INITIAL, { type: "live-start", live: live([]) })
        state = reduceGameStream(state, { type: "live-roll", liveId: "l1", roll: liveRoll("a", {}) })
        state = reduceGameStream(state, { type: "live-roll", liveId: "l1", roll: liveRoll("a", {}) })
        expect(state.live[0]!.rolls!.map((item) => item.id)).toEqual(["a"])
        state = reduceGameStream(state, { type: "combat-step-rolled", messageId: "card1", stepIndex: 1, roll: d20(8, 1) })
        expect(state.rolled.at(-1)).toMatchObject({ messageId: "card1:1", roll: { total: 9 } })
    })

    it("salvaguarda de um inimigo contra a magia do jogador rola no card antes do resultado", () => {
        const card = message({
            id: "card1",
            kind: "combat-action",
            combatAction: {
                actorKey: "pc:lyra",
                actorName: "Lyra",
                actorKind: "character",
                economy: "action",
                category: "spells",
                label: "Bola de Fogo",
                targets: [{ actorKey: "npc:g1", name: "Goblin 1" }],
                spellLevel: 3,
                freeText: null,
                status: "resolved",
                steps: [{ kind: "save", targetKey: "npc:g1", targetName: "Goblin 1", status: "done", roller: "server", dice: "1d20+2", mode: "normal", roll: d20(8, 1), total: 9, hit: null, critical: false, success: false, amount: 14, damageType: "fogo", note: null, skill: null }],
                summary: "",
                cancellable: false,
                round: 1,
            },
        } as never)
        render(<CombatActionCard message={card} mine={false} replay={null} stepReplays={new Map([[0, d20(8, 1)]])} onRoll={vi.fn()} onCancel={vi.fn()} />)
        expect(screen.getByTestId("dice-replay").textContent).toBe("9")
        expect(screen.queryByText("Falhou")).toBeNull()
        fireEvent.click(screen.getByText("parar"))
        expect(screen.getByText("Falhou")).toBeTruthy()
        expect(screen.queryByTestId("dice-panel")).toBeNull()
    })
})
