/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import type { CombatOption } from "@/features/maddox/combat-options"
import type { CombatPrepSource } from "@/features/maddox/combat-types"
import type { MaddoxGameMessageDto, MaddoxMyCombatDto, MaddoxTacticalCombatDto } from "@/features/maddox/game-types"
import { freshEconomy } from "@/features/maddox/combat-rules"
import { adjustedOriginLabel, prepSourceSealLabel, prepSourceSummary } from "@/features/maddox/combat-prep-source"

/** DND-78: a tela diz se a mesa veio do cache, foi preparada só no que mudou ou inteira; e o dono pede "Repreparar ficha". */

vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({ DiceRollerPanel: () => <div data-testid="dice-panel" /> }))

const { CombatActionBar } = await import("@/features/maddox/components/game/combat/CombatActionBar")
const { CombatPrepCard } = await import("@/features/maddox/components/game/combat/CombatCards")
const { TurnPanel } = await import("@/features/maddox/components/game/TurnPanel")
const { renderCombatTable, tableSeat, tableState } = await import("../../helpers/maddox-table")

const CACHED_AT = "2026-11-18T21:30:00.000Z"
const message = (source: CombatPrepSource | null, changes: NonNullable<MaddoxGameMessageDto["combatPrep"]>["changes"] = []): MaddoxGameMessageDto => ({
    id: "m1", turnNumber: 3, phase: "master", kind: "combat-prep", memberId: "m", characterName: "Nala", portraitUrl: null, content: "", replyToId: null, skippedByName: null, error: null, check: null, combat: null, createdAt: new Date().toISOString(),
    combatPrep: { characterName: "Nala", changes, source },
})

describe("DND-78 — card \"Sua mesa está pronta\" com a origem da preparação", () => {
    it("do cache: diz que foi reaproveitada, de quando, e quantos ajustes continuam valendo (sem o 'Nenhuma mudança')", () => {
        render(<CombatPrepCard message={message({ kind: "cache", cachedAt: CACHED_AT, kept: 2 })} />)
        const box = screen.getByTestId("combat-prep-source")
        expect(box).toHaveAttribute("data-source", "cache")
        expect(box).toHaveTextContent("Mesa reaproveitada da preparação de")
        expect(box).toHaveTextContent("nada mudou na ficha")
        expect(box).toHaveTextContent("2 ajustes do Maddox continuam valendo")
        expect(screen.queryByTestId("combat-prep-no-changes")).not.toBeInTheDocument()
    })

    it("parcial: lista o que mudou na ficha e o que foi preparado agora", () => {
        render(<CombatPrepCard message={message({ kind: "partial", cachedAt: CACHED_AT, changedParts: ["Item: Espada longa (novo)", "Magia: Bola de Fogo (alterado)"], kept: 1 }, [{ area: "opcao", label: "Espada longa", before: "+3", after: "+5", reason: "Duelismo.", applied: true }])} />)
        const box = screen.getByTestId("combat-prep-source")
        expect(box).toHaveTextContent("Preparada agora só o que mudou na ficha")
        expect(within(screen.getByTestId("combat-prep-source-parts")).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Item: Espada longa (novo)", "Magia: Bola de Fogo (alterado)"])
        expect(box).toHaveTextContent("1 ajuste do Maddox continua valendo")
        expect(screen.getByTestId("combat-prep-change")).toHaveTextContent("Espada longa")
    })

    it("inteira com cache invalidado: diz o motivo; sem origem (preparação antiga), o card é o de sempre", () => {
        const { unmount } = render(<CombatPrepCard message={message({ kind: "full", reason: "o dono da campanha pediu a repreparação da ficha" })} />)
        expect(screen.getByTestId("combat-prep-source")).toHaveTextContent("Preparada agora (ficha inteira).")
        expect(screen.getByTestId("combat-prep-source")).toHaveTextContent("Motivo: o dono da campanha pediu a repreparação da ficha.")
        expect(screen.getByTestId("combat-prep-no-changes")).toHaveTextContent("Nenhuma mudança")
        unmount()
        render(<CombatPrepCard message={message(null)} />)
        expect(screen.queryByTestId("combat-prep-source")).not.toBeInTheDocument()
        expect(screen.getByTestId("combat-prep-no-changes")).toBeInTheDocument()
    })

    it("textos puros: resumo, selo e chip", () => {
        expect(prepSourceSummary(null)).toBeNull()
        expect(prepSourceSummary({ kind: "partial", kept: 0, changedParts: [] })!.detail).toContain("Nenhum ajuste do Maddox precisou ser mantido.")
        expect(prepSourceSealLabel("cache")).toBe("Reaproveitada do cache: nada mudou na ficha")
        expect(prepSourceSealLabel("partial")).toBe("Preparada agora: só o que mudou")
        expect(prepSourceSealLabel(null)).toBeNull()
        expect(adjustedOriginLabel({ reason: "x", origin: "cache", preparedAt: CACHED_AT })).toMatch(/^do cache \(\d{2}\/\d{2}\)$/)
        expect(adjustedOriginLabel({ reason: "x", origin: "now" })).toBe("preparado agora")
        expect(adjustedOriginLabel({ reason: "x" })).toBeNull()
    })
})

const option = (over: Partial<CombatOption>): CombatOption => ({ id: "x", category: "weapons", economy: "action", label: "X", detail: "", target: "enemy", multiTarget: false, resolution: "attack", ...over })
const running: MaddoxTacticalCombatDto = {
    phase: "running",
    round: 1,
    activeKey: "pc:nala",
    order: [
        { actorKey: "pc:nala", kind: "character", side: "personagem", name: "Nala", portraitUrl: null, memberId: "m", initiative: 18, active: true, hp: { current: 10, max: 10, temp: 0 }, band: null, conditions: [], concentration: null, defeated: false, dead: false, stable: false, dying: false },
        { actorKey: "npc:g", kind: "combatant", side: "inimigo", name: "Goblin", portraitUrl: null, memberId: null, initiative: 10, active: false, hp: null, band: "ileso", conditions: [], concentration: null, defeated: false, dead: false, stable: false, dying: false },
    ],
}
const me = (adjusted: CombatOption["adjusted"]): MaddoxMyCombatDto => ({
    myTurn: true,
    actorKey: "pc:nala",
    economy: freshEconomy(),
    attacksPerAction: 1,
    options: { action: [option({ id: "weapon:adaga", label: "Adaga", attack: { bonus: 5, damage: "1d4+3", damageType: "perfurante", ranged: false, light: true }, adjusted }), option({ id: "free", category: "other", label: "Outra ação", target: "none", resolution: "free" })], bonus: [] },
    dying: false,
    adjustments: [],
})

describe("DND-78 — popover da opção ajustada", () => {
    it.each([
        [{ reason: "A adaga tem Acuidade.", origin: "cache" as const, preparedAt: CACHED_AT }, "cache", /do cache \(\d{2}\/\d{2}\)/],
        [{ reason: "A adaga tem Acuidade.", origin: "now" as const }, "now", /preparado agora/],
    ])("mostra se o ajuste veio do cache ou foi preparado agora (%#)", async (adjusted, origin, label) => {
        render(<CombatActionBar me={me(adjusted)} combat={running} color="#3B82F6" busy={false} invalidReason={null} onAct={vi.fn(async () => true)} onEndTurn={vi.fn()} onAsk={vi.fn()} onAdjust={vi.fn(async () => true)} />)
        fireEvent.click(screen.getByTestId("combat-action-button"))
        const menu = await screen.findByTestId("combat-menu")
        fireEvent.click(within(menu).getByText("Adaga"))
        expect(within(menu).getByTestId("combat-option-adjusted")).toHaveTextContent("Ajustado pelo Maddox: A adaga tem Acuidade.")
        const chip = within(menu).getByTestId("combat-option-adjusted-origin")
        expect(chip).toHaveAttribute("data-origin", origin)
        expect(chip.textContent).toMatch(label)
    })
})

describe("DND-78 — selo e \"Repreparar ficha\" no card da mesa", () => {
    it('o selo "Pronto" leva a origem da preparação', () => {
        renderCombatTable({ ...running, phase: "initiative", order: [{ ...running.order[0]!, prep: { status: "ready", source: "cache" } }, { ...running.order[0]!, actorKey: "pc:kael", name: "Kael", prep: { status: "preparing" } }] })
        const [ready] = screen.getAllByTestId("initiative-prep")
        expect(ready).toHaveAttribute("data-source", "cache")
    })

    const participants = [tableSeat({ memberId: "m1", userId: "u1", characterName: "Kael", role: "owner", prepCache: { characterId: "c1", preparedAt: CACHED_AT, invalidated: false } }), tableSeat({ memberId: "m2", userId: "u2", name: "Lia", characterName: "Lyra", prepCache: { characterId: "c2", preparedAt: CACHED_AT, invalidated: true } }), tableSeat({ memberId: "m3", userId: "u3", name: "Bia", characterName: "Brom" })]

    it("o dono pede a repreparação com confirmação; já agendada fica bloqueada; sem cache, sem botão", async () => {
        const onReprepare = vi.fn()
        render(<TurnPanel state={tableState({ participants, me: { isOwner: true } })} presence={{ available: false, online: new Set() }} color="#3B82F6" skipping={false} onSkip={vi.fn()} onReprepare={onReprepare} />)
        expect(screen.queryByRole("button", { name: /Repreparar a ficha de Brom/ })).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Repreparar a ficha de Lyra/ })).toHaveAttribute("aria-disabled", "true")
        fireEvent.click(screen.getByRole("button", { name: /Repreparar a ficha de Lyra/ }))
        expect(screen.queryByText("Repreparar no próximo combate")).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: /Repreparar a ficha de Kael/ }))
        expect(onReprepare).not.toHaveBeenCalled()
        expect(await screen.findByText(/no próximo combate, o Maddox prepara a ficha inteira de novo/)).toBeInTheDocument()
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Repreparar no próximo combate" })))
        expect(onReprepare).toHaveBeenCalledWith("c1", "Kael")
    })

    it("quem não é dono não vê a ação", () => {
        render(<TurnPanel state={tableState({ participants })} presence={{ available: false, online: new Set() }} color="#3B82F6" skipping={false} onSkip={vi.fn()} onReprepare={vi.fn()} />)
        expect(screen.queryByRole("button", { name: /Repreparar/ })).not.toBeInTheDocument()
    })
})
