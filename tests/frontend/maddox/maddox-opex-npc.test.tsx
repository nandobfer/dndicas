/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import type { MaddoxGameCombatEventDto, MaddoxGameMessageDto, MaddoxGameNpcDto } from "@/features/maddox/game-types"
import type { MaddoxJournalNpcDto } from "@/features/maddox/journal-types"

/**
 * NPCs Opex na tela (DND-27): chip "Opex" no painel, no Diário e nos cards do combate; "Promover a NPC Opex" e "Remover
 * Opex" só com `canManageOpexNpcs`, com as confirmações e os textos exatos; e a linha de falha do agente abaixo da
 * narração (o servidor só a manda ao dono).
 */

const promote = vi.fn()
const remove = vi.fn()
vi.mock("@/features/maddox/hooks/useMaddoxOpexNpcs", () => ({
    useMaddoxOpexNpcActions: () => ({ promote: { mutate: promote, isPending: false }, remove: { mutate: remove, isPending: false } }),
}))
let journalNpcs: MaddoxJournalNpcDto[] = []
vi.mock("@/features/maddox/hooks/useMaddoxJournal", () => ({
    useMaddoxJournalNpcs: () => ({ data: { pages: [{ items: journalNpcs, nextCursor: null }] }, isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() }),
}))

const { NpcPanel } = await import("@/features/maddox/components/game/NpcPanel")
const { JournalNpcList } = await import("@/features/maddox/components/journal/JournalNpcList")
const { GameMessageList } = await import("@/features/maddox/components/game/GameMessageList")
const { GameCombatCard } = await import("@/features/maddox/components/game/GameCombatCard")
const { CombatActionCard } = await import("@/features/maddox/components/game/combat/CombatCards")

const npcs: MaddoxGameNpcDto[] = [
    { id: "n1", name: "Gundren", portraitUrl: null, status: "active", opex: true },
    { id: "n2", name: "Sildar", portraitUrl: null, status: "active" },
    { id: "n3", name: "Klarg", portraitUrl: null, status: "dead" },
]

const message = (over: Partial<MaddoxGameMessageDto>): MaddoxGameMessageDto => ({
    id: "m1",
    turnNumber: 3,
    phase: "master",
    kind: "narration",
    memberId: null,
    characterName: null,
    portraitUrl: null,
    content: "Gundren aparece na estrada.",
    replyToId: null,
    skippedByName: null,
    error: null,
    check: null,
    combat: null,
    createdAt: "2026-11-09T00:00:00.000Z",
    ...over,
})

beforeEach(() => {
    promote.mockReset()
    remove.mockReset()
    journalNpcs = []
})

describe("NpcPanel — NPCs Opex", () => {
    it("chip para todos; sem a permissão nenhum botão de NPC Opex aparece", () => {
        render(<NpcPanel npcs={npcs} color="#3b82f6" campaignId="c1" />)
        expect(within(screen.getByTestId("npc-n1")).getByTestId("opex-chip")).toBeTruthy()
        expect(within(screen.getByTestId("npc-n2")).queryByTestId("opex-chip")).toBeNull()
        expect(screen.queryByRole("button", { name: /Promover a NPC Opex|Remover Opex/ })).toBeNull()
    })

    it("promover pede confirmação com os textos exatos; NPC morto não tem o botão", async () => {
        render(<NpcPanel npcs={npcs} color="#3b82f6" campaignId="c1" manageOpex />)
        expect(screen.queryByRole("button", { name: "Promover a NPC Opex: Klarg" })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Promover a NPC Opex: Sildar" }))
        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText("Promover Sildar a NPC Opex?")).toBeTruthy()
        expect(within(dialog).getByText("Ele ganha um agente próprio que decide o que fala e faz em cena.")).toBeTruthy()
        expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeTruthy()
        fireEvent.click(within(dialog).getByRole("button", { name: "Promover" }))
        expect(promote).toHaveBeenCalledWith("n2", expect.anything())
    })

    it("remover pede confirmação com os textos exatos", async () => {
        render(<NpcPanel npcs={npcs} color="#3b82f6" campaignId="c1" manageOpex />)
        fireEvent.click(screen.getByRole("button", { name: "Remover Opex: Gundren" }))
        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText("Remover Opex de Gundren?")).toBeTruthy()
        expect(within(dialog).getByText("O agente deste NPC será desligado e as memórias dele, arquivadas. O Maddox volta a narrá-lo sozinho.")).toBeTruthy()
        expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeTruthy()
        fireEvent.click(within(dialog).getByRole("button", { name: "Remover Opex" }))
        expect(remove).toHaveBeenCalledWith("n1", expect.anything())
        expect(promote).not.toHaveBeenCalled()
    })
})

describe("Diário — aba NPCs", () => {
    const journalNpc = (id: string, name: string, opex?: boolean): MaddoxJournalNpcDto => ({ id, name, portraitUrl: null, status: "active", publicDescription: `${name} é conhecido.`, updatedAt: "2026-11-09T00:00:00.000Z", ...(opex ? { opex } : {}) })

    it("chip para todos e os botões só para quem cuida dos NPCs Opex", async () => {
        journalNpcs = [journalNpc("n1", "Gundren", true), journalNpc("n2", "Sildar")]
        const { unmount } = render(<JournalNpcList campaignId="c1" color="#3b82f6" />)
        expect(within(screen.getByTestId("journal-npc-n1")).getByTestId("opex-chip")).toBeTruthy()
        expect(within(screen.getByTestId("journal-npc-n2")).queryByTestId("opex-chip")).toBeNull()
        expect(screen.queryByRole("button", { name: /Promover a NPC Opex|Remover Opex/ })).toBeNull()
        unmount()

        render(<JournalNpcList campaignId="c1" color="#3b82f6" manageOpex />)
        expect(within(screen.getByTestId("journal-npc-n1")).getByRole("button", { name: "Remover Opex: Gundren" }).textContent).toContain("Remover Opex")
        fireEvent.click(within(screen.getByTestId("journal-npc-n2")).getByRole("button", { name: "Promover a NPC Opex: Sildar" }))
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Promover" }))
        expect(promote).toHaveBeenCalledWith("n2", expect.anything())
    })
})

describe("chat — linha de falha e chips nos cards", () => {
    const list = (messages: MaddoxGameMessageDto[]) => <GameMessageList messages={messages} myMemberId="m1" maddoxAvatarUrl={null} color="#fff" narrating={false} hasMore={false} loadingMore={false} onLoadMore={() => undefined} />

    it("abaixo da narração, a linha exata com o motivo quando o servidor manda (só para o dono)", () => {
        const { rerender } = render(list([message({ opexNpcFailures: [{ npcName: "Gundren", reason: "o NPC Opex demorou demais para decidir" }] })]))
        const line = screen.getByTestId("opex-npc-failure")
        expect(line.textContent).toContain("O NPC Opex Gundren não respondeu; o Maddox decidiu por ele nesta narração.")
        expect(within(line).getByTestId("opex-npc-failure-reason").textContent).toBe("Motivo: o NPC Opex demorou demais para decidir")
        rerender(list([message({})]))
        expect(screen.queryByTestId("opex-npc-failures")).toBeNull()
        expect(screen.getByText("Gundren aparece na estrada.")).toBeTruthy()
    })

    it("chip nos combatentes do card de combate e no autor do card de ação", () => {
        const combat = {
            id: "cb1",
            title: "Esconderijo",
            location: "",
            startedTurn: 2,
            masterTurns: 0,
            combatants: [
                { name: "Klarg", side: "inimigo", quantity: 1, condition: "", outcome: null, opex: true },
                { name: "Goblin", side: "inimigo", quantity: 2, condition: "", outcome: null },
            ],
            mode: "tactical",
            tactical: null,
            event: "start",
            outcome: null,
            summary: "",
            rewards: [],
            endedTurn: null,
        } as MaddoxGameCombatEventDto
        render(<GameCombatCard combat={combat} />)
        const [klarg, goblin] = screen.getAllByTestId("combatant")
        expect(within(klarg!).getByTestId("opex-chip")).toBeTruthy()
        expect(within(goblin!).queryByTestId("opex-chip")).toBeNull()

        const action = (opex: boolean) =>
            message({
                id: "a1",
                kind: "combat-action",
                content: "",
                combatAction: { actorKey: "npc:klarg", actorName: "Klarg", actorKind: "combatant", economy: "action", category: "monster", label: "Cimitarra", targets: [{ actorKey: "pc:kael", name: "Kael" }], spellLevel: null, freeText: null, status: "resolved", steps: [], summary: "", cancellable: false, round: 1, ...(opex ? { opex } : {}) },
            } as never)
        const { unmount } = render(<CombatActionCard message={action(true)} mine={false} replay={null} onRoll={vi.fn()} onCancel={vi.fn()} />)
        expect(screen.getAllByTestId("opex-chip")).toHaveLength(2)
        unmount()
        render(<CombatActionCard message={action(false)} mine={false} replay={null} onRoll={vi.fn()} onCancel={vi.fn()} />)
        expect(screen.getAllByTestId("opex-chip")).toHaveLength(1)
    })
})
