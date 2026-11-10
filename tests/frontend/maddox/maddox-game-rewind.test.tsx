/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxGameMessageDto, MaddoxGameParticipantDto, MaddoxGameStateDto } from "@/features/maddox/game-types"
import type { MaddoxRewindTurnsDto } from "@/features/maddox/hooks/useMaddoxGame"

/**
 * Mesa Maddox — voltar a um turno (DND-44): o botão "Turnos" só para o dono, a lista com o começo da narração, os modais
 * com os textos exatos, a faixa da volta pendente para toda a mesa e a linha de aviso na conversa.
 */

const get = vi.fn()
const post = vi.fn()

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/campanhas/c1/mesa" }))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ userId: "u-owner", isSignedIn: true, isLoaded: true, can: () => true }) }))
vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({ DiceRollerPanel: () => <div data-testid="fake-dice-panel" /> }))
vi.mock("@/features/character-sheets/api/character-sheets-queries", () => ({ useSheet: () => ({ data: undefined, isLoading: false, isError: false }) }))
vi.mock("@/features/character-sheets/components/sheet-form", () => ({ SheetForm: () => <div data-testid="sheet-form" /> }))
vi.mock("@/core/context/window-context", () => ({ useWindows: () => ({ addWindow: vi.fn(), removeWindow: vi.fn() }) }))
vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))
vi.mock("@/features/maddox/hooks/useMaddoxGameStream", () => ({ useMaddoxGameStream: () => ({ live: [], settled: [], finished: 0, connected: true, rolled: [] }) }))
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>()
    return { ...actual, api: { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const ok = <T,>(data: T) => ({ data: { success: true, data } })

const participant = (memberId: string, userId: string, characterName: string): MaddoxGameParticipantDto => ({ memberId, userId, name: characterName, characterName, portraitUrl: null, role: memberId === "m1" ? "owner" : "player", ready: true, eligible: true, declared: false })

const message = (id: string, over: Partial<MaddoxGameMessageDto>): MaddoxGameMessageDto => ({
    id,
    turnNumber: 4,
    phase: "players",
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
    createdAt: "2026-11-10T10:00:00.000Z",
    ...over,
})

const CONTROL = { blockReason: null, emptyReason: null, undoTarget: 3, hasTurns: true }

const gameState = (over: Partial<MaddoxGameStateDto> = {}, me: Partial<MaddoxGameStateDto["me"]> = {}): MaddoxGameStateDto => ({
    campaignId: "c1",
    name: "Brumas",
    rigor: "narrativo",
    status: "active",
    ownerId: "u-owner",
    maddoxAvatarUrl: null,
    turn: { number: 4, phase: "players", startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [], rewind: null },
    participants: [participant("m1", "u-owner", "Kael"), participant("m2", "u-ana", "Lyra")],
    me: { memberId: "m1", isOwner: true, ready: true, eligible: true, declared: false, sheet: null, rewind: CONTROL, ...me },
    showCheckDc: false,
    combat: null,
    npcs: [],
    messages: [message("n4", { content: "O dragão desperta sob a montanha." })],
    hasMore: false,
    ...over,
})

const TURNS: MaddoxRewindTurnsDto = { turns: [{ turnNumber: 3, excerpt: "O dragão desperta sob a montanha e os…" }, { turnNumber: 2, excerpt: "A ponte cai." }, { turnNumber: 1, excerpt: "Uma taverna." }], undoTarget: 3, originTurn: 4, atTurn: 4 }

const { GamePage } = await import("@/features/maddox/components/game/GamePage")

async function renderGame(state: MaddoxGameStateDto, turns = TURNS) {
    get.mockImplementation(async (url: string) => (url.endsWith("/game/rewind") ? ok(turns) : ok(state)))
    post.mockResolvedValue(ok(state))
    renderWithQueryClient(<GamePage campaignId="c1" />)
    await screen.findByTestId("game-page")
}

const openMenu = async () => {
    fireEvent.click(screen.getByTestId("turns-button"))
    return screen.findByTestId("turns-menu")
}

beforeEach(() => {
    get.mockReset()
    post.mockReset()
})

describe("mesa Maddox — Turnos (DND-44)", () => {
    it('só o dono vê o botão "Turnos"', async () => {
        await renderGame(gameState({}, { isOwner: false, memberId: "m2", rewind: null }))
        expect(screen.queryByTestId("turns-button")).toBeNull()
    })

    it("lista do mais recente para o mais antigo com o começo da narração; o modal tem os textos exatos e confirma", async () => {
        await renderGame(gameState())
        const menu = await openMenu()
        const list = await within(menu).findByTestId("turns-list")
        const items = within(list).getAllByRole("button")
        expect(items.map((item) => item.textContent)).toEqual(["Turno 3O dragão desperta sob a montanha e os…", "Turno 2A ponte cai.", "Turno 1Uma taverna."])
        expect(get).toHaveBeenCalledWith("/maddox/campaigns/c1/game/rewind")
        fireEvent.click(screen.getByTestId("turns-item-2"))
        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText("Voltar ao turno 2?")).toBeTruthy()
        expect(within(dialog).getByText("A mesa volta ao estado do turno 2: o que aconteceu nos turnos 3 a 4 sai da mesa e do Diário. Você ainda pode voltar ao turno atual até o Maddox narrar de novo.")).toBeTruthy()
        expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeTruthy()
        fireEvent.click(within(dialog).getByRole("button", { name: "Voltar ao turno 2" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/rewind", { turnNumber: 2 }))
    })

    it('"Desfazer turno" usa o mesmo modal, com o turno anterior', async () => {
        await renderGame(gameState())
        const menu = await openMenu()
        fireEvent.click(within(menu).getByTestId("turns-undo"))
        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText("Voltar ao turno 3?")).toBeTruthy()
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }))
        expect(post).not.toHaveBeenCalled()
    })

    it("volta pendente: faixa para a mesa, aviso das declarações novas e 'Voltar ao turno atual (N)'", async () => {
        const state = gameState({
            turn: { number: 2, phase: "players", startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [], rewind: { atTurn: 2, originTurn: 4, hasNewActions: true } },
            messages: [message("n2", { turnNumber: 2, content: "A ponte cai." }), message("r1", { turnNumber: 2, kind: "rewind", rewindNotice: { event: "goto", turnNumber: 2, originTurn: 4 } })],
        })
        await renderGame(state, { ...TURNS, turns: TURNS.turns.filter((item) => item.turnNumber !== 2), atTurn: 2, undoTarget: 1 })
        expect(screen.getByTestId("rewind-banner")).toHaveTextContent("A mesa voltou ao turno 2. Os turnos 3 a 4 serão perdidos quando o Maddox narrar de novo.")
        expect(screen.getByTestId("rewind-notice")).toHaveTextContent("O dono voltou a mesa para o turno 2")
        const menu = await openMenu()
        fireEvent.click(await within(menu).findByTestId("turns-item-3"))
        let dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText(/As declarações feitas depois da volta serão perdidas\.$/)).toBeTruthy()
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }))
        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
        const again = await openMenu()
        fireEvent.click(within(again).getByTestId("turns-resume"))
        dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText("Voltar ao turno atual (4)?")).toBeTruthy()
        expect(within(dialog).getByText("Tudo o que aconteceu até o turno 4 volta para a mesa e o Diário. As declarações feitas depois da volta serão perdidas.")).toBeTruthy()
        fireEvent.click(within(dialog).getByRole("button", { name: "Voltar ao turno 4" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/rewind/resume", {}))
    })

    it("o jogador comum vê a faixa e a linha de aviso, sem o botão", async () => {
        await renderGame(
            gameState(
                { turn: { number: 2, phase: "players", startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [], rewind: { atTurn: 2, originTurn: 4, hasNewActions: false } }, messages: [message("r1", { turnNumber: 4, kind: "rewind", rewindNotice: { event: "resume", turnNumber: 4, originTurn: 4 } })] },
                { isOwner: false, memberId: "m2", rewind: null },
            ),
        )
        expect(screen.getByTestId("rewind-banner")).toBeTruthy()
        expect(screen.getByTestId("rewind-notice")).toHaveTextContent("O dono retomou o turno 4")
        expect(screen.queryByTestId("turns-button")).toBeNull()
    })

    it("sem a entrevista concluída: as ações ficam desabilitadas com o motivo", async () => {
        await renderGame(gameState({}, { rewind: { blockReason: "Conclua a entrevista de personagem para voltar a mesa a outro turno.", emptyReason: null, undoTarget: 3, hasTurns: true } }))
        const menu = await openMenu()
        expect(within(menu).getByTestId("turns-block-reason")).toHaveTextContent("Conclua a entrevista de personagem")
        expect(within(menu).getByTestId("turns-undo")).toBeDisabled()
        expect(await within(menu).findByTestId("turns-item-3")).toBeDisabled()
    })

    it("sem turnos para onde voltar: o motivo da lista vazia e o desfazer desabilitado", async () => {
        await renderGame(gameState({}, { rewind: { blockReason: null, emptyReason: "A mesa está no turno 1: não há para onde voltar.", undoTarget: null, hasTurns: false } }), { turns: [], undoTarget: null, originTurn: 1, atTurn: 1 })
        const menu = await openMenu()
        expect(await within(menu).findByTestId("turns-empty")).toHaveTextContent("A mesa está no turno 1: não há para onde voltar.")
        expect(within(menu).getByTestId("turns-undo")).toBeDisabled()
    })

    it("páginas antigas carregadas: o aviso que sai da janela não as apaga; um aviso novo recomeça", async () => {
        const hex = (n: number) => n.toString(16).padStart(24, "0")
        const notice = (n: number) => message(hex(n), { kind: "rewind", rewindNotice: { event: "goto", turnNumber: 3, originTurn: 4 } })
        const first = gameState({ hasMore: true, messages: [notice(20), message(hex(21), { content: "Narração recente." })] })
        // Janela das recentes já sem o aviso (o jogo avançou), e depois com um aviso mais novo.
        const moved = gameState({ hasMore: true, messages: [message(hex(30), { content: "Narração bem depois." })] })
        const again = gameState({ hasMore: true, messages: [notice(40), message(hex(41), { content: "Depois da nova volta." })] })
        get.mockImplementation(async (url: string) => {
            if (url.endsWith("/game/rewind")) return ok(TURNS)
            if (url.endsWith("/game/messages")) return ok({ messages: [message(hex(5), { content: "Página antiga." })], hasMore: false })
            return ok(first)
        })
        renderWithQueryClient(<GamePage campaignId="c1" />)
        await screen.findByTestId("game-page")
        fireEvent.click(screen.getByRole("button", { name: "Carregar anteriores" }))
        expect(await screen.findByText("Página antiga.")).toBeTruthy()

        const confirmVia = async (next: MaddoxGameStateDto) => {
            post.mockResolvedValueOnce(ok(next))
            const menu = await openMenu()
            fireEvent.click(await within(menu).findByTestId("turns-item-3"))
            fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Voltar ao turno 3" }))
            await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
        }
        await confirmVia(moved)
        expect(await screen.findByText("Narração bem depois.")).toBeTruthy()
        expect(screen.getByText("Página antiga.")).toBeTruthy()
        await confirmVia(again)
        expect(await screen.findByText("Depois da nova volta.")).toBeTruthy()
        await waitFor(() => expect(screen.queryByText("Página antiga.")).toBeNull())
    })
})
