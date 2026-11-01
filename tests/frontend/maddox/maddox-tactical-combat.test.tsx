/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import type { CombatOption } from "@/features/maddox/combat-options"
import type { MaddoxGameMessageDto, MaddoxMyCombatDto, MaddoxTacticalCombatDto } from "@/features/maddox/game-types"
import { freshEconomy } from "@/features/maddox/combat-rules"
import { rarityColors } from "@/lib/config/colors"

vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({
    DiceRollerPanel: (props: { rollButtonLabel?: string; hideRollButton?: boolean; rollRequest?: () => Promise<unknown>; externalResult?: { total: number } | null }) => (
        <div data-testid="dice-panel">
            {!props.hideRollButton && (
                <button type="button" onClick={() => void props.rollRequest?.()}>
                    {props.rollButtonLabel}
                </button>
            )}
            {props.externalResult && <span data-testid="dice-replay">{props.externalResult.total}</span>}
        </div>
    ),
}))

const { CombatActionBar, CombatWaitBar, anchorLeft, COMBAT_MENU_WIDTH } = await import("@/features/maddox/components/game/combat/CombatActionBar")
const { InitiativeTracker } = await import("@/features/maddox/components/game/combat/InitiativeTracker")
const { CombatActionCard, CombatReactionCard } = await import("@/features/maddox/components/game/combat/CombatCards")

const option = (over: Partial<CombatOption>): CombatOption => ({ id: "x", category: "weapons", economy: "action", label: "X", detail: "", target: "enemy", multiTarget: false, resolution: "attack", ...over })

const combat: MaddoxTacticalCombatDto = {
    phase: "running",
    round: 2,
    activeKey: "pc:kael",
    order: [
        { actorKey: "pc:kael", kind: "character", side: "personagem", name: "Kael", portraitUrl: null, memberId: "m1", initiative: 18, active: true, hp: { current: 30, max: 44, temp: 0 }, band: null, conditions: [], concentration: null, defeated: false, dead: false, stable: false, dying: false },
        { actorKey: "npc:g1", kind: "combatant", side: "inimigo", name: "Goblin 1", portraitUrl: null, memberId: null, initiative: 10, active: false, hp: null, band: "muito-ferido", conditions: [{ key: "prone", label: "Caído" }], concentration: null, defeated: false, dead: false, stable: false, dying: false },
        { actorKey: "npc:g2", kind: "combatant", side: "inimigo", name: "Goblin 2", portraitUrl: null, memberId: null, initiative: 10, active: false, hp: null, band: "caido", conditions: [], concentration: null, defeated: true, dead: false, stable: false, dying: false },
        { actorKey: "pc:lyra", kind: "character", side: "personagem", name: "Lyra", portraitUrl: null, memberId: "m2", initiative: 5, active: false, hp: { current: 0, max: 18, temp: 0 }, band: null, conditions: [{ key: "unconscious", label: "Inconsciente" }], concentration: null, defeated: false, dead: false, stable: false, dying: true },
    ],
}

const me = (over: Partial<MaddoxMyCombatDto> = {}): MaddoxMyCombatDto => ({
    myTurn: true,
    actorKey: "pc:kael",
    economy: freshEconomy(),
    attacksPerAction: 2,
    options: {
        action: [
            option({ id: "weapon:w1", label: "Espada Curta", detail: "+6 para acertar · 1d6+3 perfurante", attack: { bonus: 6, damage: "1d6+3", damageType: "perfurante", ranged: false, light: true } }),
            option({ id: "spell:s1", category: "spells", label: "Mísseis Mágicos", detail: "1º círculo", resolution: "auto", multiTarget: true, spell: { circle: 1, levels: [1, 2], concentration: false } }),
            option({ id: "standard:dodge", category: "standard", label: "Esquivar", target: "none", resolution: "standard" }),
            option({ id: "free", category: "other", label: "Outra ação", target: "none", resolution: "free" }),
        ],
        bonus: [option({ id: "item:p:self", category: "items", economy: "bonus", label: "Poção de Cura (em você)", target: "self", resolution: "heal", heal: { dice: "2d4" } })],
    },
    dying: false,
    ...over,
})

describe("combate tático — barra da minha vez e menu de ações (Maddox 7)", () => {
    it("só mostra as categorias com opções, o alvo e o círculo; confirma a ação com o que foi escolhido", async () => {
        const onAct = vi.fn(async () => true)
        render(<CombatActionBar me={me()} combat={combat} color="#3B82F6" busy={false} invalidReason={null} onAct={onAct} onEndTurn={vi.fn()} onAsk={vi.fn()} />)
        expect(screen.queryByTestId("combat-menu")).not.toBeInTheDocument()
        fireEvent.click(screen.getByTestId("combat-action-button"))
        const menu = await screen.findByTestId("combat-menu")
        expect(menu).toHaveAttribute("data-anchor", "action")
        const tabs = within(menu).getAllByRole("radio").map((tab) => tab.textContent)
        expect(tabs).toEqual(["Armas", "Magias", "Ações comuns", "Outra ação"])
        fireEvent.click(within(menu).getByText("Espada Curta"))
        // Alvos: só inimigos de pé (o Goblin 2 caiu).
        expect(within(menu).getByText("Goblin 1")).toBeInTheDocument()
        expect(within(menu).queryByText("Goblin 2")).not.toBeInTheDocument()
        expect(within(menu).getByTestId("combat-confirm")).toBeDisabled()
        fireEvent.click(within(menu).getByText("Goblin 1"))
        await act(async () => fireEvent.click(within(menu).getByTestId("combat-confirm")))
        expect(onAct).toHaveBeenCalledWith({ economy: "action", optionId: "weapon:w1", targets: ["npc:g1"] })
    })

    it("magia com círculo acima e a Outra ação com o motivo da recusa no próprio menu", async () => {
        const onAct = vi.fn(async () => false)
        render(<CombatActionBar me={me()} combat={combat} color="#3B82F6" busy={false} invalidReason="Você não tem magia para isso." onAct={onAct} onEndTurn={vi.fn()} onAsk={vi.fn()} />)
        fireEvent.click(screen.getByTestId("combat-action-button"))
        const menu = await screen.findByTestId("combat-menu")
        fireEvent.click(within(menu).getByRole("radio", { name: "Magias" }))
        fireEvent.click(within(menu).getByText("Mísseis Mágicos"))
        fireEvent.click(within(menu).getByText("2º"))
        fireEvent.click(within(menu).getByText("Goblin 1"))
        await act(async () => fireEvent.click(within(menu).getByTestId("combat-confirm")))
        expect(onAct).toHaveBeenLastCalledWith(expect.objectContaining({ optionId: "spell:s1", spellLevel: 2, targets: ["npc:g1"] }))
        fireEvent.click(within(menu).getByRole("radio", { name: "Outra ação" }))
        fireEvent.click(within(menu).getAllByText("Outra ação").find((node) => node.closest("[data-testid='combat-option']"))!)
        fireEvent.change(within(menu).getByTestId("combat-free-text"), { target: { value: "Derrubo a estante." } })
        await act(async () => fireEvent.click(within(menu).getByTestId("combat-confirm")))
        expect(onAct).toHaveBeenLastCalledWith({ economy: "action", optionId: "free", freeText: "Derrubo a estante." })
        expect(within(menu).getByTestId("combat-invalid-reason")).toHaveTextContent("Você não tem magia para isso.")
        // A barra continua aberta depois da recusa (o jogador corrige o texto).
        expect(screen.getByTestId("combat-menu")).toBeInTheDocument()
    })

    it("um painel só, ancorado ao botão que o abriu e reposicionado ao trocar de Ação para Ação bônus", async () => {
        render(<CombatActionBar me={me()} combat={combat} color="#3B82F6" busy={false} invalidReason={null} onAct={vi.fn(async () => true)} onEndTurn={vi.fn()} onAsk={vi.fn()} />)
        const action = screen.getByTestId("combat-action-button")
        const bonus = screen.getByTestId("combat-bonus-button")
        Object.defineProperty(action, "offsetLeft", { configurable: true, value: 16 })
        Object.defineProperty(bonus, "offsetLeft", { configurable: true, value: 160 })
        const bar = screen.getByTestId("combat-bar")
        Object.defineProperty(bar, "clientWidth", { configurable: true, value: 900 })
        fireEvent.click(action)
        expect((await screen.findByTestId("combat-menu")).style.left).toBe("16px")
        fireEvent.click(bonus)
        const menus = screen.getAllByTestId("combat-menu")
        expect(menus.at(-1)).toHaveAttribute("data-anchor", "bonus")
        expect(menus.at(-1)!.style.left).toBe("160px")
        expect(menus.at(-1)!.style.width).toBe(`${COMBAT_MENU_WIDTH}px`)
        // Limites: dentro do contêiner e da janela.
        expect(anchorLeft(800, 900, 0, 1280)).toBe(900 - COMBAT_MENU_WIDTH)
        expect(anchorLeft(300, 1200, 1000, 1280)).toBe(1280 - 8 - COMBAT_MENU_WIDTH - 1000)
        // Janela estreita: o painel encolhe e guarda a margem de 8 px da borda.
        expect(anchorLeft(0, 300, 0, 320)).toBe(8)
    })

    it("economia do turno, encerrar com movimento e o aviso de quem está a 0 PV", () => {
        const onEndTurn = vi.fn()
        const { rerender } = render(<CombatActionBar me={me({ economy: { ...freshEconomy(), action: false, attackAction: true, attacksLeft: 1, bonus: false } })} combat={combat} color="#3B82F6" busy={false} invalidReason={null} onAct={vi.fn(async () => true)} onEndTurn={onEndTurn} onAsk={vi.fn()} />)
        const economy = screen.getByTestId("combat-economy")
        expect(economy.querySelector("[data-slot='action']")).toHaveAttribute("data-available", "true")
        expect(economy.querySelector("[data-slot='action']")).toHaveTextContent("1 ataque(s)")
        expect(economy.querySelector("[data-slot='bonus']")).toHaveAttribute("data-available", "false")
        fireEvent.change(screen.getByTestId("combat-movement"), { target: { value: "Recuo até a porta." } })
        fireEvent.click(screen.getByTestId("combat-end-turn"))
        expect(onEndTurn).toHaveBeenCalledWith("Recuo até a porta.")
        rerender(<CombatActionBar me={me({ dying: true })} combat={combat} color="#3B82F6" busy={false} invalidReason={null} onAct={vi.fn(async () => true)} onEndTurn={onEndTurn} onAsk={vi.fn()} />)
        expect(screen.getByTestId("combat-bar")).toHaveAttribute("data-dying", "true")
        expect(screen.queryByTestId("combat-action-button")).not.toBeInTheDocument()
    })

    it("fora da minha vez: de quem é a vez e a rodada", () => {
        render(<CombatWaitBar combat={combat} canAsk onAsk={vi.fn()} />)
        expect(screen.getByTestId("combat-wait-bar")).toHaveTextContent("Vez de Kael (iniciativa 18) · Rodada 2")
    })
})

describe("combate tático — rastreador de iniciativa", () => {
    it("ordem, quem age, PV do grupo, faixa dos adversários (sem números) e condições", () => {
        render(<InitiativeTracker combat={combat} title="Cripta" color="#3B82F6" />)
        const slots = screen.getAllByTestId("initiative-slot")
        expect(slots.map((slot) => slot.querySelector("[data-testid='initiative-value']")!.textContent)).toEqual(["18", "10", "10", "5"])
        expect(slots[0]).toHaveAttribute("data-active", "true")
        expect(within(slots[0]!).getByTestId("initiative-hp")).toHaveTextContent("30/44")
        expect(within(slots[1]!).getByTestId("initiative-band")).toHaveTextContent("Muito ferido")
        expect(within(slots[1]!).queryByTestId("initiative-hp")).not.toBeInTheDocument()
        expect(slots[1]).toHaveTextContent("Caído")
        expect(slots[3]).toHaveTextContent("Morrendo")
        expect(screen.getByText("Rodada 2")).toBeInTheDocument()
    })
})

const baseMessage = (over: Partial<MaddoxGameMessageDto>): MaddoxGameMessageDto => ({
    id: "msg1",
    turnNumber: 3,
    phase: "players",
    kind: "combat-action",
    memberId: "m1",
    characterName: "Kael",
    portraitUrl: null,
    content: "",
    replyToId: null,
    skippedByName: null,
    error: null,
    check: null,
    combat: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    ...over,
})

describe("combate tático — cards na conversa", () => {
    it("ação: Rolar ataque, Acertou, Rolar dano e o cancelamento só de quem age", async () => {
        const step = { targetKey: "npc:g1", targetName: "Goblin 1", roller: "player" as const, mode: "normal" as const, roll: null, total: null, hit: null, critical: false, success: null, amount: null, damageType: "perfurante", note: null, skill: null }
        const pending = baseMessage({
            combatAction: { actorKey: "pc:kael", actorName: "Kael", actorKind: "character", economy: "action", category: "weapons", label: "Espada Curta", targets: [{ actorKey: "npc:g1", name: "Goblin 1" }], spellLevel: null, freeText: null, status: "pending", steps: [{ ...step, kind: "attack", status: "pending", dice: "1d20+6" }, { ...step, kind: "damage", status: "pending", dice: "1d6+3" }], summary: "", cancellable: true, round: 2 },
        })
        const onRoll = vi.fn(async () => ({ total: 17 }) as never)
        const onCancel = vi.fn()
        const { rerender } = render(<CombatActionCard message={pending} mine replay={null} onRoll={onRoll} onCancel={onCancel} />)
        await act(async () => fireEvent.click(screen.getByText("Rolar ataque")))
        expect(onRoll).toHaveBeenCalledWith("msg1")
        fireEvent.click(screen.getByTestId("combat-action-cancel"))
        expect(onCancel).toHaveBeenCalledWith("msg1")
        const hit = { ...pending, combatAction: { ...pending.combatAction!, cancellable: false, steps: [{ ...step, kind: "attack" as const, status: "done" as const, dice: "1d20+6", total: 17, hit: true }, { ...step, kind: "damage" as const, status: "pending" as const, dice: "1d6+3" }] } }
        rerender(<CombatActionCard message={hit} mine replay={null} onRoll={onRoll} onCancel={onCancel} />)
        expect(screen.getByTestId("combat-step-verdict")).toHaveTextContent("Acertou")
        expect(screen.getByText("Rolar dano")).toBeInTheDocument()
        expect(screen.queryByTestId("combat-action-cancel")).not.toBeInTheDocument()
        // Quem assiste não rola: vê o dado repetido pelo stream.
        rerender(<CombatActionCard message={hit} mine={false} replay={{ total: 6 } as never} onRoll={onRoll} onCancel={onCancel} />)
        expect(screen.queryByText("Rolar dano")).not.toBeInTheDocument()
        expect(screen.getByTestId("dice-replay")).toHaveTextContent("6")
    })

    it("reação: contagem e opções só para quem reage; o dono só pode recusar no lugar", () => {
        vi.useFakeTimers()
        try {
            vi.setSystemTime(new Date("2026-11-01T10:00:00.000Z"))
            const reaction = baseMessage({ kind: "combat-reaction", phase: "master", memberId: "m2", characterName: "Lyra", combatReaction: { status: "pending", trigger: "hit", description: "Goblin acertou Lyra", options: [{ id: "spell:shield", label: "Escudo", detail: "" }], choice: null, deadline: "2026-11-01T10:00:45.000Z", outcome: null } })
            const onDecide = vi.fn()
            const { rerender } = render(<CombatReactionCard message={reaction} mine isOwner={false} busy={false} onDecide={onDecide} />)
            expect(screen.getByTestId("reaction-countdown")).toHaveTextContent("45s")
            act(() => vi.advanceTimersByTime(40_000))
            expect(screen.getByTestId("reaction-countdown")).toHaveTextContent("5s")
            expect(screen.getByTestId("reaction-countdown").style.color).toBe(rarityColors.artifact)
            fireEvent.click(screen.getByText("Escudo"))
            expect(onDecide).toHaveBeenCalledWith("msg1", "spell:shield")
            rerender(<CombatReactionCard message={{ ...reaction, combatReaction: { ...reaction.combatReaction!, options: [] } }} mine={false} isOwner busy={false} onDecide={onDecide} />)
            expect(screen.queryByTestId("reaction-options")).not.toBeInTheDocument()
            expect(screen.getByText(/Aguardando a reação de Lyra/)).toBeInTheDocument()
            fireEvent.click(screen.getByTestId("reaction-decline-for"))
            expect(onDecide).toHaveBeenLastCalledWith("msg1", "none")
        } finally {
            vi.useRealTimers()
        }
    })
})

describe("controles do combate usam os componentes do projeto", () => {
    it("components/game/combat não importa @/core/ui/tabs nem usa select/checkbox nativos", async () => {
        const { readdirSync, readFileSync } = await import("node:fs")
        const { join } = await import("node:path")
        const dir = join(process.cwd(), "src/features/maddox/components/game/combat")
        const files = readdirSync(dir).filter((name) => name.endsWith(".tsx"))
        expect(files.length).toBeGreaterThan(0)
        for (const file of files) {
            const source = readFileSync(join(dir, file), "utf8")
            expect(source, file).not.toContain("@/core/ui/tabs")
            expect(source, file).not.toMatch(/<select[\s>]/)
            expect(source, file).not.toMatch(/type=["']checkbox["']/)
        }
    })
})
