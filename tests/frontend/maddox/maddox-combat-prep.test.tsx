/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import type { CombatOption } from "@/features/maddox/combat-options"
import type { MaddoxGameMessageDto, MaddoxMyCombatDto, MaddoxTacticalCombatDto } from "@/features/maddox/game-types"
import { freshEconomy } from "@/features/maddox/combat-rules"

/** DND-41: a mesa durante a preparação do combate, o card privado, a decisão do dono e o painel com ajuste e ataque furtivo. */

vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({ DiceRollerPanel: () => <div data-testid="dice-panel" /> }))

const { CombatActionBar, CombatWaitBar, combatMenuNotices } = await import("@/features/maddox/components/game/combat/CombatActionBar")
const { InitiativeTracker } = await import("@/features/maddox/components/game/combat/InitiativeTracker")
const { CombatPrepBlockedNotice, CombatPrepCard } = await import("@/features/maddox/components/game/combat/CombatCards")

const option = (over: Partial<CombatOption>): CombatOption => ({ id: "x", category: "weapons", economy: "action", label: "X", detail: "", target: "enemy", multiTarget: false, resolution: "attack", ...over })
const slot = (over: Partial<MaddoxTacticalCombatDto["order"][number]>): MaddoxTacticalCombatDto["order"][number] => ({ actorKey: "pc:x", kind: "character", side: "personagem", name: "X", portraitUrl: null, memberId: "m", initiative: null, active: false, hp: { current: 10, max: 10, temp: 0 }, band: null, conditions: [], concentration: null, defeated: false, dead: false, stable: false, dying: false, ...over })

const preparing: MaddoxTacticalCombatDto = {
    phase: "initiative",
    round: 0,
    activeKey: null,
    order: [slot({ actorKey: "pc:nala", name: "Nala", prep: { status: "ready" } }), slot({ actorKey: "pc:vaelyra", name: "Vaelyra", prep: { status: "preparing" } }), slot({ actorKey: "pc:kael", name: "Kael", prep: { status: "waiting" } }), slot({ actorKey: "npc:g", kind: "combatant", side: "inimigo", name: "Goblin", hp: null, band: "ileso" })],
    preparation: { active: true, blocked: false, failures: [] },
}

const running: MaddoxTacticalCombatDto = {
    phase: "running",
    round: 1,
    activeKey: "pc:nala",
    order: [slot({ actorKey: "pc:nala", name: "Nala", initiative: 18, active: true }), slot({ actorKey: "npc:g", kind: "combatant", side: "inimigo", name: "Goblin", hp: null, band: "ileso", initiative: 10 })],
}

const dagger = option({
    id: "weapon:adaga",
    label: "Adaga",
    detail: "+5 para acertar · 1d4+3 perfurante",
    attack: { bonus: 5, damage: "1d4+3", damageType: "perfurante", ranged: false, light: true, finesse: true, riders: [{ key: "sneak-attack", label: "Ataque furtivo (+1d6)", dice: "1d6" }] },
    adjusted: { reason: "A adaga tem Acuidade: vale a Destreza." },
})
const me = (over: Partial<MaddoxMyCombatDto> = {}): MaddoxMyCombatDto => ({
    myTurn: true,
    actorKey: "pc:nala",
    economy: freshEconomy(),
    attacksPerAction: 1,
    options: { action: [dagger, option({ id: "unarmed", label: "Ataque desarmado", attack: { bonus: 1, damage: "1", damageType: "contundente", ranged: false, light: false } }), option({ id: "free", category: "other", label: "Outra ação", target: "none", resolution: "free" })], bonus: [option({ id: "free", category: "other", economy: "bonus", label: "Outra ação", target: "none", resolution: "free" })] },
    dying: false,
    adjustments: [],
    ...over,
})

const bar = (props: Partial<Parameters<typeof CombatActionBar>[0]> = {}) => (
    <CombatActionBar me={me()} combat={running} color="#3B82F6" busy={false} invalidReason={null} onAct={vi.fn(async () => true)} onEndTurn={vi.fn()} onAsk={vi.fn()} onAdjust={vi.fn(async () => true)} {...props} />
)

describe("DND-41 — a mesa enquanto o mestre prepara o combate", () => {
    it('a barra de espera mostra "O mestre está preparando o combate" e o rastreador mostra o selo de cada personagem', () => {
        render(
            <>
                <CombatWaitBar combat={preparing} canAsk={false} onAsk={vi.fn()} />
                <InitiativeTracker combat={preparing} title="Emboscada" color="#3B82F6" />
            </>,
        )
        expect(screen.getByTestId("combat-wait-text")).toHaveTextContent("O mestre está preparando o combate")
        expect(screen.getAllByTestId("initiative-prep").map((seal) => [seal.getAttribute("data-status"), seal.textContent?.trim()])).toEqual([
            ["ready", "Pronto"],
            ["preparing", "Preparando…"],
            ["waiting", "Aguardando"],
        ])
        expect(screen.getByText("Preparando o combate")).toBeInTheDocument()
    })

    it("falha: só o dono vê o motivo e os botões (com confirmação para seguir sem preparação); os demais aguardam o dono", async () => {
        const blocked: MaddoxTacticalCombatDto = { ...preparing, order: preparing.order.map((item) => (item.name === "Vaelyra" ? { ...item, prep: { status: "failed" as const } } : item)), preparation: { active: true, blocked: true, failures: [{ prepId: "p2", characterName: "Vaelyra", error: "Endpoint indisponível" }] } }
        const onRetry = vi.fn()
        const onSkip = vi.fn()
        const { unmount } = render(<CombatPrepBlockedNotice preparation={blocked.preparation!} isOwner retrying={false} skipping={false} onRetry={onRetry} onSkip={onSkip} />)
        const failure = screen.getByTestId("combat-prep-failure")
        expect(failure).toHaveTextContent("A preparação da mesa de Vaelyra falhou: Endpoint indisponível")
        fireEvent.click(within(failure).getByText("Tentar de novo"))
        expect(onRetry).toHaveBeenCalledWith("p2")
        fireEvent.click(within(failure).getByText("Seguir sem preparação"))
        expect(onSkip).not.toHaveBeenCalled()
        await act(async () => fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Seguir sem preparação" })))
        expect(onSkip).toHaveBeenCalledWith("p2")
        unmount()
        render(
            <>
                <CombatPrepBlockedNotice preparation={{ ...blocked.preparation!, failures: [] }} isOwner={false} retrying={false} skipping={false} onRetry={vi.fn()} onSkip={vi.fn()} />
                <CombatWaitBar combat={{ ...blocked, preparation: { ...blocked.preparation!, failures: [] } }} canAsk={false} onAsk={vi.fn()} />
            </>,
        )
        expect(screen.getByTestId("combat-prep-waiting-owner")).toHaveTextContent("Aguardando o dono da campanha")
        expect(screen.getByTestId("combat-wait-text")).toHaveTextContent("Aguardando o dono da campanha")
        expect(screen.queryByText("Tentar de novo")).not.toBeInTheDocument()
    })

    it('card privado "Sua mesa está pronta": o que era, o que ficou e o motivo; sem mudanças, diz isso', () => {
        const message = (changes: NonNullable<MaddoxGameMessageDto["combatPrep"]>["changes"]): MaddoxGameMessageDto => ({ id: "m1", turnNumber: 3, phase: "master", kind: "combat-prep", memberId: "m", characterName: "Nala", portraitUrl: null, content: "", replyToId: null, skippedByName: null, error: null, check: null, combat: null, combatPrep: { characterName: "Nala", changes }, createdAt: new Date().toISOString() })
        const { unmount } = render(<CombatPrepCard message={message([{ area: "opcao", label: "Adaga", before: "+1 para acertar · 1d4-1 perfurante", after: "+5 para acertar · 1d4+3 perfurante", reason: "A adaga tem Acuidade.", applied: true }, { area: "ficha", label: "Destreza", before: "15", after: "17", reason: "x", applied: false }])} />)
        expect(screen.getByText(/Sua mesa está pronta/)).toBeInTheDocument()
        const [first, second] = screen.getAllByTestId("combat-prep-change")
        expect(first).toHaveTextContent("Adaga")
        expect(first).toHaveTextContent("+1 para acertar · 1d4-1 perfurante")
        expect(first).toHaveTextContent("+5 para acertar · 1d4+3 perfurante")
        expect(first).toHaveTextContent("A adaga tem Acuidade.")
        expect(second).toHaveAttribute("data-applied", "false")
        expect(second).toHaveTextContent("não aplicada")
        unmount()
        render(<CombatPrepCard message={message([])} />)
        expect(screen.getByTestId("combat-prep-no-changes")).toHaveTextContent("Nenhuma mudança")
    })

    it("DND-49: alteração sem fonte no catálogo aparece recusada com o motivo, e o aviso de catálogo não consultado vem primeiro", () => {
        const message: MaddoxGameMessageDto = {
            id: "m2", turnNumber: 3, phase: "master", kind: "combat-prep", memberId: "m", characterName: "Uther", portraitUrl: null, content: "", replyToId: null, skippedByName: null, error: null, check: null, combat: null, createdAt: new Date().toISOString(),
            combatPrep: {
                characterName: "Uther",
                changes: [
                    { area: "aviso", label: "Catálogo", before: "", after: "", reason: "O Maddox não consultou o catálogo do DnDicas: as correções de regra foram descartadas e vale a lista calculada pelo servidor.", applied: false },
                    { area: "opcao", label: "Impor as Mãos", before: "não existia", after: "Ação · Cura 5 PV", reason: "Paladino de 1º nível.", applied: false, refused: "Não confirmada no catálogo do DnDicas: sem a fonte do catálogo." },
                ],
            },
        }
        render(<CombatPrepCard message={message} />)
        expect(screen.getByTestId("combat-prep-notice")).toHaveTextContent("O Maddox não consultou o catálogo do DnDicas")
        const refused = screen.getByTestId("combat-prep-change")
        expect(refused).toHaveAttribute("data-refused", "true")
        expect(refused).toHaveTextContent("recusada")
        expect(screen.getByTestId("combat-prep-refused")).toHaveTextContent("Não confirmada no catálogo do DnDicas: sem a fonte do catálogo.")
        expect(refused).not.toHaveTextContent("a ficha mudou")
    })
})

describe("DND-41 — painel da vez: ajuste do Maddox, ataque furtivo e pedido de ajuste", () => {
    it('DND-49: mostra "Ajustado pelo Maddox" e avisa que o ataque furtivo é perguntado depois do acerto (nada vai na confirmação)', async () => {
        const onAct = vi.fn(async () => true)
        render(bar({ onAct }))
        fireEvent.click(screen.getByTestId("combat-action-button"))
        const menu = await screen.findByTestId("combat-menu")
        fireEvent.click(within(menu).getByText("Adaga"))
        expect(within(menu).getByTestId("combat-option-adjusted")).toHaveTextContent("Ajustado pelo Maddox: A adaga tem Acuidade: vale a Destreza.")
        expect(within(menu).getByTestId("combat-sneak-attack")).toHaveTextContent("Ataque furtivo (+1d6): se o ataque acertar e a regra permitir, você escolhe somar antes do dano")
        expect(within(menu).queryByRole("checkbox")).not.toBeInTheDocument()
        fireEvent.click(within(menu).getByText("Goblin"))
        await act(async () => fireEvent.click(within(menu).getByTestId("combat-confirm")))
        expect(onAct).toHaveBeenCalledWith({ economy: "action", optionId: "weapon:adaga", targets: ["npc:g"] })
    })

    it("ataque furtivo já usado no turno: o aviso diz isso", async () => {
        const onAct = vi.fn(async () => true)
        render(bar({ onAct, me: me({ economy: { ...freshEconomy(), sneakAttackUsed: true } }) }))
        fireEvent.click(screen.getByTestId("combat-action-button"))
        const menu = await screen.findByTestId("combat-menu")
        fireEvent.click(within(menu).getByText("Adaga"))
        expect(within(menu).getByTestId("combat-sneak-attack")).toHaveTextContent("já usado neste turno")
        fireEvent.click(within(menu).getByText("Goblin"))
        await act(async () => fireEvent.click(within(menu).getByTestId("combat-confirm")))
        expect(onAct).toHaveBeenCalledWith({ economy: "action", optionId: "weapon:adaga", targets: ["npc:g"] })
    })

    it("pedido de ajuste: envia o texto da opção escolhida e mostra o exame, o aceite e a recusa com o motivo", async () => {
        const onAdjust = vi.fn(async () => true)
        const { rerender } = render(bar({ onAdjust }))
        fireEvent.click(screen.getByTestId("combat-action-button"))
        const menu = await screen.findByTestId("combat-menu")
        fireEvent.click(within(menu).getByText("Adaga"))
        fireEvent.change(within(menu).getByTestId("combat-adjust-text"), { target: { value: "mas adaga tem acuidade, deveria ser destreza" } })
        await act(async () => fireEvent.click(within(menu).getByTestId("combat-adjust-send")))
        expect(onAdjust).toHaveBeenCalledWith({ economy: "action", optionId: "weapon:adaga", text: "mas adaga tem acuidade, deveria ser destreza" })
        const adjustment = { id: "a1", economy: "action" as const, optionId: "weapon:adaga", optionLabel: "Adaga", text: "x" }
        rerender(bar({ onAdjust, me: me({ adjustments: [{ ...adjustment, status: "pending", reason: null }] }) }))
        expect(screen.getByTestId("combat-adjust-result")).toHaveTextContent("O Maddox está examinando o pedido…")
        expect(screen.getByTestId("combat-adjust-send")).toBeDisabled()
        rerender(bar({ onAdjust, me: me({ adjustments: [{ ...adjustment, status: "accepted", reason: "Corrigido para Destreza." }] }) }))
        expect(screen.getByTestId("combat-adjust-result")).toHaveTextContent("Ajuste aceito: Corrigido para Destreza.")
        rerender(bar({ onAdjust, me: me({ adjustments: [{ ...adjustment, status: "refused", reason: "A ficha não permite." }] }) }))
        expect(screen.getByTestId("combat-adjust-result")).toHaveTextContent("Ajuste recusado: A ficha não permite.")
    })

    it('sem ação bônus válida além de "Outra ação", o painel avisa; sem armas, também', async () => {
        render(bar())
        fireEvent.click(screen.getByTestId("combat-bonus-button"))
        const menu = await screen.findByTestId("combat-menu")
        expect(within(menu).getByTestId("combat-menu-notices")).toHaveTextContent('Nenhuma ação bônus válida além de "Outra ação"')
        expect(combatMenuNotices("action", [option({ id: "unarmed" }), option({ id: "free", category: "other" })])).toEqual(["Sem armas equipadas: só o ataque desarmado.", "Nenhuma habilidade com custo de Ação na ficha."])
    })
})
