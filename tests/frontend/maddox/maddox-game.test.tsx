/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxGameMessageDto, MaddoxGameParticipantDto, MaddoxGameStateDto } from "@/features/maddox/game-types"
import { rarityColors } from "@/lib/config/colors"

const get = vi.fn()
const post = vi.fn()

type Handler = (...args: unknown[]) => void
const handlers = new Map<string, Set<Handler>>()
let presenceIds: string[] = []
const channel = {
    bind: vi.fn((event: string, handler: Handler) => {
        if (!handlers.has(event)) handlers.set(event, new Set())
        handlers.get(event)!.add(handler)
    }),
    unbind: vi.fn((event: string, handler: Handler) => handlers.get(event)?.delete(handler)),
    members: { each: (fn: (member: { id: string }) => void) => presenceIds.forEach((id) => fn({ id })) },
}
let pusherAvailable = true
const acquireChannel = vi.fn(() => channel)
const releaseChannel = vi.fn()

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/campanhas/c1/mesa" }))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ userId: "u-owner", isSignedIn: true, isLoaded: true, can: () => true }) }))
vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: () => pusherAvailable, acquireChannel, releaseChannel }))
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>()
    return { ...actual, api: { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const ok = <T,>(data: T) => ({ data: { success: true, data } })
const emit = (event: string) => handlers.get(event)?.forEach((handler) => handler())

const participant = (memberId: string, userId: string, characterName: string, over: Partial<MaddoxGameParticipantDto> = {}): MaddoxGameParticipantDto => ({
    memberId,
    userId,
    name: `Jogador ${characterName}`,
    characterName,
    portraitUrl: null,
    role: memberId === "m1" ? "owner" : "player",
    ready: true,
    eligible: true,
    declared: false,
    ...over,
})

const message = (id: string, over: Partial<MaddoxGameMessageDto>): MaddoxGameMessageDto => ({
    id,
    turnNumber: 1,
    phase: "players",
    kind: "declaration",
    memberId: null,
    characterName: null,
    portraitUrl: null,
    content: "",
    replyToId: null,
    skippedByName: null,
    createdAt: "2026-10-31T10:00:00.000Z",
    ...over,
})

const gameState = (over: Partial<MaddoxGameStateDto> = {}): MaddoxGameStateDto => ({
    campaignId: "c1",
    name: "Brumas de Valdrenn",
    rigor: "narrativo",
    status: "active",
    ownerId: "u-owner",
    maddoxAvatarUrl: null,
    turn: { number: 1, phase: "players", startedAt: null, generating: false },
    participants: [participant("m1", "u-owner", "Kael"), participant("m2", "u-ana", "Lyra"), participant("m3", "u-bia", "Borin")],
    me: { memberId: "m1", isOwner: true, ready: true, eligible: true, declared: false },
    messages: [
        message("n1", { kind: "narration", phase: "master", content: "Uma taverna em **chamas**." }),
        message("d1", { kind: "declaration", memberId: "m2", characterName: "Lyra", content: "Corro até a porta." }),
        message("q1", { kind: "question", memberId: "m3", characterName: "Borin", content: "Há guardas?" }),
        message("a1", { kind: "answer", content: "Nenhum guarda à vista.", replyToId: "q1" }),
        message("p1", { kind: "pass", memberId: "m3", characterName: "Borin", skippedByName: "Marina" }),
    ],
    hasMore: false,
    ...over,
})

const { GamePage } = await import("@/features/maddox/components/game/GamePage")
const { seatStatus, turnProgress, composerBlockReason, gameRefetchInterval, MADDOX_GAME_POLL_MS } = await import("@/features/maddox/game-view")
const { MADDOX_MASTER_RETRY_MS } = await import("@/features/maddox/constants")

beforeEach(() => {
    get.mockReset()
    post.mockReset()
    handlers.clear()
    presenceIds = ["u-owner", "u-ana", "u-bia"]
    pusherAvailable = true
    acquireChannel.mockClear()
    releaseChannel.mockClear()
})

async function renderGame(state: MaddoxGameStateDto) {
    get.mockResolvedValue(ok(state))
    const view = renderWithQueryClient(<GamePage campaignId="c1" />)
    await screen.findByTestId("game-page")
    return view
}

const ME = (over: Partial<MaddoxGameStateDto["me"]>) => ({ memberId: "m1", isOwner: true, ready: true, eligible: true, declared: false, ...over })

describe("mesa Maddox — conversa e turno", () => {
    it("mostra narração, declaração, pergunta com a resposta ligada, 'não fez nada' e a faixa do turno", async () => {
        await renderGame(gameState({ participants: [participant("m1", "u-owner", "Kael"), participant("m2", "u-ana", "Lyra", { declared: true }), participant("m3", "u-bia", "Borin", { declared: true })] }))
        expect(screen.getByTestId("turn-divider")).toHaveTextContent("Turno 1")
        expect(screen.getByTestId("maddox-narration")).toHaveTextContent("Uma taverna em chamas.")
        expect(screen.getByTestId("game-declaration")).toHaveTextContent("Corro até a porta.")
        expect(screen.getByTestId("game-question")).toHaveTextContent("pergunta ao mestre")
        expect(screen.getByTestId("maddox-answer")).toHaveTextContent("Respondendo a Borin")
        expect(screen.getByTestId("game-pass")).toHaveTextContent("Borin não fez nada (pulado por Marina).")
        expect(screen.getByTestId("turn-banner")).toHaveTextContent("Turno dos jogadores — 2 de 3 jogador(es) online já declararam")
        expect(acquireChannel).toHaveBeenCalledWith("presence-maddox-c-c1")
        expect(acquireChannel).toHaveBeenCalledWith("private-maddox-u-u-owner")
    })

    it("turno do mestre: o campo fica bloqueado e o Maddox aparece narrando", async () => {
        await renderGame(gameState({ turn: { number: 2, phase: "master", startedAt: null, generating: true } }))
        expect(screen.getByTestId("turn-banner")).toHaveTextContent("Turno do mestre — o Maddox está narrando…")
        expect(screen.getByTestId("game-composer-hint")).toHaveTextContent("O Maddox está narrando. Aguarde o turno dos jogadores.")
        expect(screen.getByLabelText("O que o seu personagem faz")).toBeDisabled()
        expect(screen.getByRole("button", { name: /Não fazer nada/ })).toBeDisabled()
        expect(within(screen.getByRole("log")).getByRole("status")).toHaveTextContent("O Maddox está narrando…")
    })

    it("realtime: a mudança da mesa recarrega o estado", async () => {
        await renderGame(gameState())
        expect(get).toHaveBeenCalledTimes(1)
        emit("maddox.game.changed")
        await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    })
})

describe("mesa Maddox — ações do jogador", () => {
    it("Declarar, Perguntar ao mestre e Não fazer nada enviam a ação certa", async () => {
        await renderGame(gameState())
        post.mockResolvedValue(ok(gameState()))
        const input = screen.getByLabelText("O que o seu personagem faz")
        expect(screen.getByRole("button", { name: /Declarar/ })).toBeDisabled()

        fireEvent.change(input, { target: { value: "  Saco a espada.  " } })
        fireEvent.click(screen.getByRole("button", { name: /Declarar/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/actions", { kind: "declaration", content: "Saco a espada." }))

        fireEvent.change(input, { target: { value: "Há saída nos fundos?" } })
        fireEvent.click(screen.getByRole("button", { name: /Perguntar ao mestre/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/actions", { kind: "question", content: "Há saída nos fundos?" }))

        fireEvent.click(screen.getByRole("button", { name: /Não fazer nada/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/actions", { kind: "pass" }))
    })

    it("Ctrl+Enter declara; Enter sozinho não envia", async () => {
        await renderGame(gameState())
        post.mockResolvedValue(ok(gameState()))
        const input = screen.getByLabelText("O que o seu personagem faz")
        fireEvent.change(input, { target: { value: "Grito por ajuda." } })
        fireEvent.keyDown(input, { key: "Enter" })
        expect(post).not.toHaveBeenCalled()
        fireEvent.keyDown(input, { key: "Enter", ctrlKey: true })
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/actions", { kind: "declaration", content: "Grito por ajuda." }))
    })

    it("falha ao enviar devolve o texto ao campo", async () => {
        await renderGame(gameState())
        post.mockRejectedValue({ response: { status: 409, data: { success: false, error: "O turno dos jogadores já foi encerrado." } } })
        const input = screen.getByLabelText("O que o seu personagem faz") as HTMLTextAreaElement
        fireEvent.change(input, { target: { value: "Ataco." } })
        fireEvent.click(screen.getByRole("button", { name: /Declarar/ }))
        await waitFor(() => expect(post).toHaveBeenCalled())
        await waitFor(() => expect(input.value).toBe("Ataco."))
    })

    it("depois de declarar só dá para perguntar ao mestre", async () => {
        await renderGame(gameState({ me: ME({ declared: true }), participants: [participant("m1", "u-owner", "Kael", { declared: true }), participant("m2", "u-ana", "Lyra")] }))
        fireEvent.change(screen.getByLabelText("O que o seu personagem faz"), { target: { value: "Mais alguém na sala?" } })
        expect(screen.getByRole("button", { name: /Declarar/ })).toBeDisabled()
        expect(screen.getByRole("button", { name: /Não fazer nada/ })).toBeDisabled()
        expect(screen.getByRole("button", { name: /Perguntar ao mestre/ })).toBeEnabled()
        expect(screen.getByTestId("game-composer-hint")).toHaveTextContent("Você já declarou. Aguardando os outros jogadores")
    })

    it("quem entrou no meio do turno espera o próximo; quem não concluiu a entrevista vê o link para ela", async () => {
        const view = await renderGame(gameState({ me: ME({ eligible: false }) }))
        expect(screen.getByTestId("game-composer-hint")).toHaveTextContent("Você entra no jogo a partir do próximo turno.")
        expect(screen.getByLabelText("O que o seu personagem faz")).toBeDisabled()
        view.unmount()

        await renderGame(gameState({ me: ME({ ready: false, eligible: false }) }))
        expect(screen.getByTestId("game-composer-hint")).toHaveTextContent("Conclua a entrevista de personagem")
        expect(screen.getByRole("link", { name: /Entrevista do personagem/ })).toHaveAttribute("href", "/campanhas/c1/entrevista/personagem")
    })
})

describe("mesa Maddox — participantes e presença", () => {
    it("situação de cada um em cores de raridade e 'Pular' do dono com confirmação", async () => {
        presenceIds = ["u-owner", "u-ana"]
        await renderGame(
            gameState({
                participants: [
                    participant("m1", "u-owner", "Kael", { declared: true }),
                    participant("m2", "u-ana", "Lyra"),
                    participant("m3", "u-bia", "Borin"),
                    participant("m4", "u-caio", "Novato", { eligible: false }),
                    participant("m5", "u-dani", "Esboço", { ready: false, eligible: false }),
                ],
            }),
        )
        const seat = (id: string) => screen.getByTestId(`seat-${id}`)
        expect(within(seat("m1")).getByText("Declarou")).toBeInTheDocument()
        expect(within(seat("m2")).getByText("Aguardando")).toBeInTheDocument()
        expect(within(seat("m3")).getByText("Offline (não conta)")).toBeInTheDocument()
        expect(within(seat("m4")).getByText("Entra no próximo turno")).toBeInTheDocument()
        expect(within(seat("m5")).getByText("Preparando personagem")).toBeInTheDocument()
        // O happy-dom devolve a cor como foi escrita (hex); um navegador devolveria `rgb(...)`.
        const waiting = within(seat("m2")).getByText("Aguardando")
        expect([rarityColors.legendary.toLowerCase(), "rgb(245, 158, 11)"]).toContain(waiting.style.color.toLowerCase())
        expect(within(seat("m2")).getByRole("img", { name: "Online" })).toBeInTheDocument()
        expect(within(seat("m3")).getByRole("img", { name: "Offline" })).toBeInTheDocument()
        expect(screen.getByTestId("turn-banner")).toHaveTextContent("1 de 2 jogador(es) online")

        expect(within(seat("m1")).queryByRole("button", { name: /Pular/ })).not.toBeInTheDocument()
        expect(within(seat("m4")).queryByRole("button", { name: /Pular/ })).not.toBeInTheDocument()
        post.mockResolvedValue(ok(gameState()))
        fireEvent.click(within(seat("m3")).getByRole("button", { name: "Pular Borin" }))
        const dialog = await screen.findByRole("alertdialog")
        expect(dialog).toHaveTextContent("Pular a vez de Borin?")
        fireEvent.click(within(dialog).getByRole("button", { name: "Pular" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/skip", { memberId: "m3" }))
    })

    it("jogador comum não vê 'Pular'", async () => {
        await renderGame(gameState({ me: ME({ memberId: "m2", isOwner: false }) }))
        expect(screen.queryByRole("button", { name: /^Pular/ })).not.toBeInTheDocument()
    })

    it("quando alguém sai da mesa, pede ao servidor que reavalie o turno", async () => {
        await renderGame(gameState())
        post.mockResolvedValue(ok(gameState({ turn: { number: 2, phase: "players", startedAt: null, generating: false } })))
        presenceIds = ["u-owner"]
        emit("pusher:member_removed")
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/check"), { timeout: 3000 })
        await waitFor(() => expect(screen.getByText("Turno 2")).toBeInTheDocument())
    })

    it("sem Pusher: aviso de que todos os jogadores do turno contam", async () => {
        pusherAvailable = false
        await renderGame(gameState())
        expect(screen.getByRole("note")).toHaveTextContent("Sem tempo real: a mesa considera todos os jogadores do turno")
        expect(screen.getByTestId("turn-banner")).toHaveTextContent("0 de 3 jogador(es) já declararam")
        expect(acquireChannel).not.toHaveBeenCalled()
    })

    it("campanha que ainda não começou mostra o estado vazio", async () => {
        get.mockResolvedValue(ok(gameState({ status: "lobby" })))
        renderWithQueryClient(<GamePage campaignId="c1" />)
        expect(await screen.findByText("A campanha ainda não começou")).toBeInTheDocument()
    })

    it("não participante: 404 vira 'Campanha não encontrada'", async () => {
        get.mockRejectedValue({ response: { status: 404 } })
        renderWithQueryClient(<GamePage campaignId="c1" />)
        expect(await screen.findByText("Campanha não encontrada")).toBeInTheDocument()
    })
})

describe("regras de exibição da mesa", () => {
    const presence = { available: true, online: new Set(["u-owner"]) }
    it("seatStatus, turnProgress e composerBlockReason", () => {
        const state = gameState()
        expect(seatStatus(participant("m1", "u-owner", "Kael"), state, presence)).toBe("waiting")
        expect(seatStatus(participant("m2", "u-ana", "Lyra"), state, presence)).toBe("offline")
        expect(seatStatus(participant("m2", "u-ana", "Lyra", { declared: true }), state, presence)).toBe("declared")
        expect(seatStatus(participant("m2", "u-ana", "Lyra"), state, { available: false, online: new Set() })).toBe("waiting")
        expect(seatStatus(participant("m2", "u-ana", "Lyra"), { ...state, turn: { ...state.turn, phase: "master" } }, presence)).toBe("watching")
        expect(turnProgress({ participants: [participant("m1", "u-owner", "Kael"), participant("m2", "u-ana", "Lyra", { declared: true })] }, presence)).toEqual({ declared: 1, total: 2 })
        expect(composerBlockReason(state)).toBeNull()
        expect(composerBlockReason({ ...state, status: "paused" })).toBe("A campanha não está em andamento.")
    })

    it("a mesa não usa abas do core, select nem checkbox nativos", async () => {
        const { readdirSync, readFileSync } = await import("node:fs")
        const { join } = await import("node:path")
        const dir = join(process.cwd(), "src/features/maddox/components/game")
        for (const file of readdirSync(dir)) {
            const source = readFileSync(join(dir, file), "utf8")
            expect(source, file).not.toMatch(/@\/core\/ui\/tabs/)
            expect(source, file).not.toMatch(/<select[\s>]/)
            expect(source, file).not.toMatch(/type=["']checkbox["']/)
        }
    })
})

describe("mesa Maddox — recarga depois de falha do mestre", () => {
    const master = (generating: boolean) => ({ number: 2, phase: "master" as const, startedAt: null, generating })
    const players = { number: 2, phase: "players" as const, startedAt: null, generating: false }

    it("gameRefetchInterval: com tempo real só recarrega no turno do mestre sem geração; sem Pusher recarrega sempre", () => {
        expect(gameRefetchInterval({ status: "active", turn: master(false) }, true)).toBe(MADDOX_MASTER_RETRY_MS)
        expect(gameRefetchInterval({ status: "active", turn: master(true) }, true)).toBe(false)
        expect(gameRefetchInterval({ status: "active", turn: players }, true)).toBe(false)
        expect(gameRefetchInterval({ status: "lobby", turn: master(false) }, true)).toBe(false)
        expect(gameRefetchInterval(undefined, true)).toBe(false)
        expect(gameRefetchInterval({ status: "active", turn: players }, false)).toBe(MADDOX_GAME_POLL_MS)
        expect(gameRefetchInterval(undefined, false)).toBe(MADDOX_GAME_POLL_MS)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    async function countGetsAfter(state: MaddoxGameStateDto, ms: number) {
        vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
        await renderGame(state)
        const before = get.mock.calls.length
        await vi.advanceTimersByTimeAsync(ms)
        return get.mock.calls.length - before
    }

    it("com Pusher, turno do mestre sem geração (falhou): a mesa recarrega após MADDOX_MASTER_RETRY_MS", async () => {
        expect(await countGetsAfter(gameState({ turn: master(false) }), MADDOX_MASTER_RETRY_MS + 100)).toBeGreaterThanOrEqual(1)
    })

    it("com Pusher, geração em andamento ou turno dos jogadores: não recarrega sozinha", async () => {
        expect(await countGetsAfter(gameState({ turn: master(true) }), MADDOX_MASTER_RETRY_MS * 2)).toBe(0)
    })

    it("com Pusher, turno dos jogadores: não recarrega sozinha", async () => {
        expect(await countGetsAfter(gameState({ turn: players }), MADDOX_MASTER_RETRY_MS * 2)).toBe(0)
    })

    it("sem Pusher: recarrega a cada MADDOX_GAME_POLL_MS", async () => {
        pusherAvailable = false
        expect(await countGetsAfter(gameState({ turn: players }), MADDOX_GAME_POLL_MS * 2 + 100)).toBeGreaterThanOrEqual(2)
    })
})
