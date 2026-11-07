/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxGameMessageDto, MaddoxGameParticipantDto, MaddoxGameStateDto, MaddoxLiveGenerationDto } from "@/features/maddox/game-types"
import { rarityColors } from "@/lib/config/colors"
import { rigorColor } from "@/features/maddox/components/campaigns/campaign-visuals"
import type { MaddoxGameStreamState } from "@/features/maddox/hooks/useMaddoxGameStream"

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
const addWindow = vi.fn()
/**
 * Painel de dados simplificado (o 3D real é testado em tests/frontend/dice-roller): expõe as props que a mesa passa e,
 * como o painel real, ZERA o resultado mostrado quando o `preset` muda (efeito em `[preset]`) e só avisa o fim da
 * animação (`onRollSettled`) num passo separado — o botão "fim da animação".
 */
vi.mock("@/features/dice-roller/components/dice-roller-panel", async () => {
    const { useEffect, useState } = await import("react")
    return {
        DiceRollerPanel: (props: {
            preset?: { modifier?: number; mode?: string } | null
            externalResult?: { total: number } | null
            hideRollButton?: boolean
            disableRolling?: boolean
            disabledRollingMessage?: string | null
            rollButtonLabel?: string
            rollRequest?: (input: unknown) => Promise<{ total: number }>
            onRollSettled?: (result: unknown) => void
            appearance?: string
            stageVariant?: string
            stageSize?: string
            stageVisibility?: string
            stageHideDelayMs?: number
            rollButtonClassName?: string
        }) => {
            const [shown, setShown] = useState<number | null>(null)
            const [rolled, setRolled] = useState<unknown>(null)
            useEffect(() => {
                setShown(null)
                setRolled(null)
            }, [props.preset])
            const animating = rolled ?? props.externalResult ?? null
            return (
                <div
                    data-testid="fake-dice-panel"
                    data-modifier={props.preset?.modifier}
                    data-mode={props.preset?.mode}
                    data-external={props.externalResult?.total ?? ""}
                    data-shown={shown ?? ""}
                    data-appearance={props.appearance ?? ""}
                    data-stage-variant={props.stageVariant ?? ""}
                    data-stage-size={props.stageSize ?? ""}
                    data-stage-visibility={props.stageVisibility ?? ""}
                    data-stage-hide-delay={props.stageHideDelayMs ?? ""}
                    data-roll-button-class={props.rollButtonClassName ?? ""}
                >
                    {!props.hideRollButton && (
                        <button
                            type="button"
                            disabled={props.disableRolling}
                            onClick={async () => {
                                const result = await props.rollRequest?.({ terms: [{ dice: "d20", quantity: 1 }] })
                                if (result) {
                                    setShown(result.total)
                                    setRolled(result)
                                }
                            }}
                        >
                            {props.rollButtonLabel ?? "JOGAR"}
                        </button>
                    )}
                    {animating !== null && (
                        <button type="button" onClick={() => props.onRollSettled?.(animating)}>
                            fim da animação
                        </button>
                    )}
                    {props.disabledRollingMessage}
                </div>
            )
        },
    }
})
const sheetPreview = { strength: 10, dexterity: 16, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10, level: 1, proficiencyBonusOverride: null, savingThrows: {}, skills: { Furtividade: { proficient: true, expertise: false } } }
/** Ficha da prévia controlada pelo teste (`loading` = ainda carregando; `data` troca a ficha). */
const sheetQuery: { loading: boolean; data: typeof sheetPreview } = { loading: false, data: sheetPreview }
vi.mock("@/features/character-sheets/api/character-sheets-queries", () => ({
    useSheet: (id: string | null) => ({ data: id && !sheetQuery.loading ? sheetQuery.data : undefined, isLoading: Boolean(id) && sheetQuery.loading, isError: false }),
}))
vi.mock("@/features/character-sheets/components/sheet-form", () => ({ SheetForm: () => <div data-testid="sheet-form" /> }))
vi.mock("@/core/context/window-context", () => ({ useWindows: () => ({ addWindow, removeWindow: vi.fn() }) }))
vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: () => pusherAvailable, acquireChannel, releaseChannel }))
/** Stream da mesa controlado pelo teste (sem rede): `setStream` re-renderiza quem usa o hook. */
let streamSnapshot: MaddoxGameStreamState = { live: [], settled: [], finished: 0, connected: true, rolled: [] }
const streamListeners = new Set<() => void>()
const setStream = (patch: Partial<MaddoxGameStreamState>) => {
    streamSnapshot = { ...streamSnapshot, ...patch }
    streamListeners.forEach((listener) => listener())
}
vi.mock("@/features/maddox/hooks/useMaddoxGameStream", async () => {
    const { useSyncExternalStore } = await import("react")
    const subscribe = (listener: () => void) => {
        streamListeners.add(listener)
        return () => void streamListeners.delete(listener)
    }
    return { useMaddoxGameStream: () => useSyncExternalStore(subscribe, () => streamSnapshot) }
})
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
    error: null,
    check: null,
    combat: null,
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
    turn: { number: 1, phase: "players", startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [] },
    participants: [participant("m1", "u-owner", "Kael"), participant("m2", "u-ana", "Lyra"), participant("m3", "u-bia", "Borin")],
    me: { memberId: "m1", isOwner: true, ready: true, eligible: true, declared: false, sheet: null },
    showCheckDc: false,
    combat: null,
    npcs: [],
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
const { seatStatus, turnProgress, composerBlockReason, gameRefetchInterval, masterBannerText, MADDOX_GAME_POLL_MS } = await import("@/features/maddox/game-view")
const { MADDOX_MASTER_RETRY_MS } = await import("@/features/maddox/constants")

beforeEach(() => {
    sheetQuery.loading = false
    sheetQuery.data = sheetPreview
    get.mockReset()
    post.mockReset()
    handlers.clear()
    presenceIds = ["u-owner", "u-ana", "u-bia"]
    pusherAvailable = true
    acquireChannel.mockClear()
    releaseChannel.mockClear()
    streamSnapshot = { live: [], settled: [], finished: 0, connected: true, rolled: [] }
})

async function renderGame(state: MaddoxGameStateDto) {
    get.mockResolvedValue(ok(state))
    const view = renderWithQueryClient(<GamePage campaignId="c1" />)
    await screen.findByTestId("game-page")
    return view
}

const ME = (over: Partial<MaddoxGameStateDto["me"]>): MaddoxGameStateDto["me"] => ({ memberId: "m1", isOwner: true, ready: true, eligible: true, declared: false, sheet: null, ...over })

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

    it("imagens nas cenas (Maddox 10): a imagem fica na bolha da narração; o dono pede a imagem da cena e o retrato do NPC", async () => {
        post.mockResolvedValue(ok({ id: "i2", status: "pending", url: null, caption: "", situationLabel: null, source: "manual", error: null }))
        await renderGame(
            gameState({
                messages: [message("n1", { kind: "narration", phase: "master", content: "O farol apagado.", sceneImages: [{ id: "i1", status: "done", url: "/api/upload?key=farol.png", caption: "O farol", situationLabel: "Novo local ou cenário", source: "tool", error: null }, { id: "i3", status: "generating", url: null, caption: "", situationLabel: null, source: "manual", error: null }] })],
                npcs: [{ id: "npc1", name: "Varn", portraitUrl: null, status: "active" }],
                sceneImages: { owner: true, canRequest: true, reason: null, generating: false, remainingToday: 9, campaignEnabled: true, canRequestPortrait: true },
            }),
        )
        expect(within(screen.getByTestId("maddox-narration")).getByRole("img", { name: "O farol" })).toHaveAttribute("src", "/api/upload?key=farol.png")
        // A imagem do Maddox e a pedida pelo dono dividem a narração: a pronta continua visível enquanto a outra é pintada.
        expect(within(screen.getByTestId("maddox-narration")).getAllByTestId("scene-image").map((node) => node.dataset.status)).toEqual(["done", "generating"])
        fireEvent.click(screen.getByTestId("scene-image-button"))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/scene-images"))
        fireEvent.click(screen.getByRole("button", { name: "Gerar retrato de Varn" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/npcs/npc1/portrait"))
    })

    it("imagens nas cenas: jogador não vê o botão da imagem nem o do retrato", async () => {
        await renderGame(
            gameState({
                me: ME({ memberId: "m2", isOwner: false }),
                npcs: [{ id: "npc1", name: "Varn", portraitUrl: null, status: "active" }],
                sceneImages: { owner: false, canRequest: false, reason: null, generating: false, remainingToday: 0, campaignEnabled: true, canRequestPortrait: false },
            }),
        )
        expect(screen.queryByTestId("scene-image-button")).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Gerar retrato/ })).not.toBeInTheDocument()
    })

    it("Injetar Lembrança (DND-25): o botão fica ao lado de 'Gerar imagem da cena', envia o texto e a linha aparece na conversa", async () => {
        post.mockResolvedValue(ok(gameState()))
        await renderGame(
            gameState({
                messages: [message("r1", { kind: "reminder", memberId: "m2", characterName: "Lyra", content: "Tenho o talento Alerta.", reminder: { status: "saved" } })],
                sceneImages: { owner: true, canRequest: true, reason: null, generating: false, remainingToday: 9, campaignEnabled: true, canRequestPortrait: true },
            }),
        )
        const reminder = screen.getByTestId("inject-reminder-button")
        expect(reminder).toBeEnabled()
        expect(screen.getByTestId("scene-image-button").nextElementSibling).toBe(reminder)
        expect(screen.getByTestId("reminder-line")).toHaveTextContent("Lyra lembrou o Maddox: “Tenho o talento Alerta.”")
        expect(screen.getByTestId("reminder-status")).toHaveTextContent("Guardada como memória")
        fireEvent.click(reminder)
        fireEvent.change(await screen.findByTestId("inject-reminder-text"), { target: { value: "Estou envenenado." } })
        fireEvent.click(screen.getByTestId("inject-reminder-send"))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/reminders", { texto: "Estou envenenado." }))
    })

    it("Injetar Lembrança aparece para o jogador e fica desabilitado com o motivo enquanto ele não concluiu a entrevista", async () => {
        await renderGame(gameState({ me: ME({ memberId: "m2", isOwner: false, ready: false }) }))
        const reminder = screen.getByTestId("inject-reminder-button")
        expect(reminder).toBeDisabled()
        expect(reminder).toHaveAttribute("title", "Conclua a entrevista de personagem com o Maddox antes de entrar no jogo.")
    })

    it("turno do mestre: o campo fica bloqueado e o Maddox aparece narrando", async () => {
        await renderGame(gameState({ turn: { number: 2, phase: "master", startedAt: null, generating: true, failed: false, awaitingChecks: false, pendingChecks: [] } }))
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

    it("Enter declara; Shift+Enter não envia; texto vazio não envia; Ctrl+Enter também declara", async () => {
        await renderGame(gameState())
        post.mockResolvedValue(ok(gameState()))
        const input = screen.getByLabelText("O que o seu personagem faz")
        fireEvent.keyDown(input, { key: "Enter" })
        fireEvent.change(input, { target: { value: "Grito por ajuda." } })
        fireEvent.keyDown(input, { key: "Enter", shiftKey: true })
        expect(post).not.toHaveBeenCalled()
        fireEvent.keyDown(input, { key: "Enter" })
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/actions", { kind: "declaration", content: "Grito por ajuda." }))
        post.mockClear()
        fireEvent.change(input, { target: { value: "Corro." } })
        fireEvent.keyDown(input, { key: "Enter", ctrlKey: true })
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/actions", { kind: "declaration", content: "Corro." }))
    })

    it("campo no desenho da entrevista: caixa única com três botões de ícone, na ordem Perguntar, Não fazer nada, Declarar", async () => {
        await renderGame(gameState())
        const box = screen.getByTestId("game-composer-box")
        for (const cls of ["flex", "items-end", "gap-2", "rounded-xl", "border", "bg-card", "focus-within:border-primary/60"]) expect(box.className.split(" ")).toContain(cls)
        const input = within(box).getByLabelText("O que o seu personagem faz")
        expect(input.className.split(" ")).toEqual(expect.arrayContaining(["flex-1", "mb-1", "max-h-[180px]"]))
        const buttons = within(box).getAllByRole("button")
        expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Perguntar ao mestre", "Não fazer nada", "Declarar"])
        for (const button of buttons) {
            expect(button.className.split(" ")).toEqual(expect.arrayContaining(["h-8", "w-8", "rounded-full"]))
            expect(button).toHaveAttribute("title")
            expect(button.textContent).toBe("")
        }
        expect(buttons[2]).toHaveAttribute("type", "submit")
        expect(buttons[0]).toHaveAttribute("type", "button")
        // Estado e contador abaixo da caixa, fora dela.
        expect(within(box).queryByTestId("game-composer-hint")).not.toBeInTheDocument()
        expect(screen.getByTestId("game-composer-counter")).toHaveTextContent("0/")
        expect(screen.getByTestId("game-composer-counter")).toHaveTextContent("Enter declara · Shift+Enter quebra linha")
    })

    it("campo bloqueado (turno do mestre): os três botões desabilitados e a caixa esmaecida", async () => {
        await renderGame(gameState({ turn: { ...gameState().turn, phase: "master", generating: true } }))
        const box = screen.getByTestId("game-composer-box")
        expect(box.className.split(" ")).toContain("opacity-70")
        for (const button of within(box).getAllByRole("button")) expect(button).toBeDisabled()
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
        post.mockResolvedValue(ok(gameState({ turn: { number: 2, phase: "players", startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [] } })))
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

const liveItem = (over: Partial<MaddoxLiveGenerationDto> = {}): MaddoxLiveGenerationDto => ({ liveId: "l1", kind: "narration", turnNumber: 2, replyToId: null, text: "", tool: false, startedAt: "2026-10-31T10:00:00.000Z", ...over })

describe("Maddox 4 — narração ao vivo, falhas e foco", () => {
    const masterTurn = { number: 2, phase: "master" as const, startedAt: null, generating: true, failed: false, awaitingChecks: false, pendingChecks: [] }

    it("narração chegando em streaming: texto parcial com citação em negrito, cursor, aviso de ferramenta e divisor do turno", async () => {
        await renderGame(gameState({ turn: masterTurn }))
        act(() => setStream({ live: [liveItem({ text: "A névoa cobre o {{Raça:Elf", tool: true })] }))
        const bubble = await screen.findByTestId("maddox-live-narration")
        expect(bubble).toHaveTextContent("A névoa cobre o")
        expect(bubble).not.toHaveTextContent("{{")
        expect(within(bubble).getByTestId("live-cursor")).toBeInTheDocument()
        expect(within(bubble).getByTestId("live-tool")).toHaveTextContent("Consultando as anotações da campanha…")
        expect(screen.queryByTestId("maddox-writing")).not.toBeInTheDocument()
        expect(screen.getAllByTestId("turn-divider").map((item) => item.textContent)).toEqual(["Turno 1", "Turno 2"])
        act(() => setStream({ live: [liveItem({ text: "A névoa cobre o {{Raça:Elfo}} e o cais." })] }))
        expect(screen.getByTestId("maddox-live-narration")).toHaveTextContent("A névoa cobre o Elfo e o cais.")
    })

    it("geração que terminou fica na tela até a mensagem gravada chegar (sem piscar nem duplicar)", async () => {
        const settled = { ...liveItem({ text: "Fim da cena." }), messageId: "n2" }
        await renderGame(gameState({ turn: masterTurn }))
        act(() => setStream({ settled: [settled], finished: 1 }))
        expect(screen.getByTestId("maddox-live-narration")).toHaveTextContent("Fim da cena.")
        get.mockResolvedValue(ok(gameState({ turn: { ...masterTurn, phase: "players", generating: false }, messages: [...gameState().messages, message("n2", { kind: "narration", phase: "master", turnNumber: 2, content: "Fim da cena." })] })))
        emit("maddox.game.changed")
        await waitFor(() => expect(screen.queryByTestId("maddox-live-narration")).not.toBeInTheDocument())
        expect(screen.getAllByText("Fim da cena.")).toHaveLength(1)
    })

    it("resposta ao vivo aparece ligada à pergunta; resposta que falhou mostra o aviso", async () => {
        await renderGame(gameState({ messages: [...gameState().messages, message("q2", { kind: "question", memberId: "m2", characterName: "Lyra", content: "E a ponte?" }), message("a2", { kind: "answer", replyToId: "q1", error: "O Maddox não conseguiu responder agora. Pergunte de novo." })] }))
        expect(screen.getByTestId("maddox-answer-error")).toHaveTextContent("O Maddox não conseguiu responder agora. Pergunte de novo.")
        act(() => setStream({ live: [liveItem({ kind: "answer", turnNumber: 1, replyToId: "q2", text: "A ponte caiu." })] }))
        const answer = screen.getByTestId("maddox-live-answer")
        expect(answer).toHaveTextContent("Respondendo a Lyra")
        expect(answer).toHaveTextContent("A ponte caiu.")
    })

    it("falha do mestre: a faixa avisa a nova tentativa e não mostra o Maddox narrando", async () => {
        await renderGame(gameState({ turn: { ...masterTurn, generating: false, failed: true } }))
        expect(screen.getByTestId("turn-banner")).toHaveTextContent("o Maddox teve um problema; tentando de novo em instantes")
        expect(screen.queryByTestId("maddox-writing")).not.toBeInTheDocument()
    })

    it("declaração recusada (ACTION_INVALID): mostra o motivo e devolve o rascunho", async () => {
        await renderGame(gameState({ rigor: "fiel-dnd" }))
        post.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { success: false, error: "Kael não conhece magia.", code: "ACTION_INVALID" } } })
        const field = screen.getByLabelText("O que o seu personagem faz")
        fireEvent.change(field, { target: { value: "Lanço uma bola de fogo." } })
        fireEvent.click(screen.getByRole("button", { name: /Declarar/ }))
        expect(await screen.findByTestId("game-composer-invalid")).toHaveTextContent("Kael não conhece magia.")
        expect(field).toHaveValue("Lanço uma bola de fogo.")
    })

    it("quando o Maddox termina de narrar, o foco volta ao campo de texto", async () => {
        await renderGame(gameState({ turn: masterTurn }))
        const field = screen.getByLabelText("O que o seu personagem faz")
        expect(field).toBeDisabled()
        expect(document.activeElement).not.toBe(field)
        get.mockResolvedValue(ok(gameState({ turn: { ...masterTurn, phase: "players", generating: false } })))
        act(() => setStream({ finished: 1 }))
        emit("maddox.game.changed")
        await waitFor(() => expect(field).not.toBeDisabled())
        await waitFor(() => expect(document.activeElement).toBe(field))
    })

    it("resposta a uma pergunta termina: foca o campo, mas não rouba o foco de outro campo editável", async () => {
        await renderGame(gameState())
        const field = screen.getByLabelText("O que o seu personagem faz")
        field.blur()
        act(() => setStream({ finished: 1 }))
        await waitFor(() => expect(document.activeElement).toBe(field))

        const other = document.createElement("input")
        document.body.appendChild(other)
        other.focus()
        act(() => setStream({ finished: 2 }))
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(document.activeElement).toBe(other)
        other.remove()
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
        // Inclui as subpastas (o combate tático fica em `combat/`).
        for (const file of readdirSync(dir, { recursive: true }).map(String).filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))) {
            const source = readFileSync(join(dir, file), "utf8")
            expect(source, file).not.toMatch(/@\/core\/ui\/tabs/)
            expect(source, file).not.toMatch(/<select[\s>]/)
            expect(source, file).not.toMatch(/type=["']checkbox["']/)
        }
    })
})

describe("mesa Maddox — recarga depois de falha do mestre", () => {
    const master = (generating: boolean) => ({ number: 2, phase: "master" as const, startedAt: null, generating, failed: false, awaitingChecks: false, pendingChecks: [] })
    const players = { number: 2, phase: "players" as const, startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [] }

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

// ── Maddox 5: testes pedidos pelo Maddox, ficha e NPCs ─────────────────────────

/** Compara cores declaradas sem depender da caixa do hex. */
const sameHex = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase()

const roll17 = { rollId: "r1", label: "Furtividade (Destreza)", terms: [{ dice: "d20" as const, quantity: 1, results: [12] }], mode: "advantage" as const, selectedD20: { kept: 12, discarded: 7, reason: "advantage" as const }, diceTotal: 12, modifier: 5, total: 17, createdAt: "2026-10-31T10:00:00.000Z" }

const checkDto = (over: Partial<NonNullable<MaddoxGameMessageDto["check"]>> = {}): NonNullable<MaddoxGameMessageDto["check"]> => ({
    status: "pending",
    round: 0,
    kind: "skill",
    ability: "dexterity",
    skill: "Furtividade",
    mode: "advantage",
    reason: "Esgueirar-se entre os guardas",
    dc: null,
    sheetId: "s-lyra",
    roll: null,
    modifierParts: [],
    rolledByName: null,
    success: null,
    cancelReason: null,
    ...over,
})

const awaitingTurn = { number: 2, phase: "master" as const, startedAt: null, generating: false, failed: false, awaitingChecks: true, pendingChecks: [{ checkId: "k1", memberId: "m2", characterName: "Lyra" }] }
const checkMessage = (over: Partial<NonNullable<MaddoxGameMessageDto["check"]>> = {}) => message("k1", { kind: "check", phase: "master", turnNumber: 2, memberId: "m2", characterName: "Lyra", check: checkDto(over) })

describe("mesa Maddox — layout em tela inteira", () => {
    it("coluna com a altura da área útil; cabeçalho compacto fixo com turno, 'Minha ficha' à direita e a faixa; chat e ferramentas ocupam o resto", async () => {
        await renderGame(gameState({ rigor: "fiel-dnd", me: ME({ sheet: { id: "s1", slug: "lyra" } }) }))
        const page = screen.getByTestId("game-page")
        expect(page).toHaveAttribute("data-layout", "fill")
        for (const cls of ["flex", "flex-col", "lg:h-[calc(100dvh_-_7rem_-_var(--view-as-banner-height,0px))]", "lg:min-h-[640px]"]) expect(page.className.split(" ")).toContain(cls)
        const header = screen.getByTestId("campaign-chat-header")
        for (const cls of ["sticky", "top-16", "z-20", "shrink-0"]) expect(header.className.split(" ")).toContain(cls)
        expect(within(header).getByRole("heading", { level: 1 })).toHaveTextContent("Brumas")
        expect(header).toHaveTextContent("Turno 1")
        expect(within(header).getByRole("link", { name: "Voltar à campanha" })).toHaveAttribute("href", "/campanhas/c1")
        expect(header).toContainElement(screen.getByTestId("turn-banner"))
        const sheetButton = within(header).getByRole("button", { name: /Minha ficha/ })
        expect(sheetButton.closest("div")!.className.split(" ")).toContain("ml-auto")
        const grid = screen.getByTestId("game-grid")
        expect(grid.className.split(" ")).toEqual(expect.arrayContaining(["lg:min-h-0", "lg:flex-1"]))
        const panel = screen.getByTestId("game-panel")
        expect(panel.className.split(" ")).toEqual(expect.arrayContaining(["h-[80dvh]", "min-h-[480px]", "lg:h-full", "lg:min-h-0"]))
        expect(panel.className).not.toContain("18rem")
        const tools = screen.getByTestId("game-tools")
        expect(tools.className.split(" ")).toEqual(expect.arrayContaining(["lg:min-h-0", "lg:overflow-y-auto"]))
        expect(grid).toContainElement(panel)
        expect(grid).toContainElement(tools)
    })
})

describe("mesa Maddox — testes pedidos pelo Maddox (Maddox 5)", () => {
    it("o jogador indicado vê o pedido com o d20, as partes do modificador e 'Rolar'; a rolagem vai ao servidor sem dado nem modificador", async () => {
        post.mockResolvedValue(ok({ roll: roll17, state: gameState({ me: ME({ memberId: "m2", isOwner: false }), turn: { ...awaitingTurn, awaitingChecks: false, pendingChecks: [], generating: true }, messages: [checkMessage({ status: "rolled", roll: roll17 })] }) }))
        await renderGame(gameState({ rigor: "fiel-dnd", me: ME({ memberId: "m2", isOwner: false }), turn: awaitingTurn, messages: [message("n2", { kind: "narration", phase: "master", turnNumber: 2, content: "Lyra avança…" }), checkMessage()] }))
        const card = screen.getByTestId("game-check-request")
        expect(card).toHaveTextContent("O Maddox pede um teste para você")
        expect(within(card).getByTestId("check-title")).toHaveTextContent("Teste de perícia: Furtividade (Destreza)")
        expect(card).toHaveTextContent("Esgueirar-se entre os guardas")
        // Prévia pela ficha: DES 16 (+3) + proficiência +2.
        const modifiers = within(card).getByTestId("check-modifiers")
        expect(modifiers).toHaveTextContent("d20")
        expect(modifiers).toHaveTextContent("Destreza +3")
        expect(modifiers).toHaveTextContent("Prof. +2")
        expect(within(card).getByTestId("check-modifier-total")).toHaveTextContent("= d20 +5")
        expect(modifiers).toHaveTextContent("Vantagem")
        expect(modifiers).not.toHaveTextContent("CD")
        const panel = within(card).getByTestId("fake-dice-panel")
        expect(panel).toHaveAttribute("data-modifier", "5")
        expect(panel).toHaveAttribute("data-mode", "advantage")
        // Sem palco antes de rolar: dado solto no card, só durante a rolagem, e some depois; botão pequeno.
        expect(panel).toHaveAttribute("data-appearance", "inline")
        expect(panel).toHaveAttribute("data-stage-variant", "bare")
        expect(panel).toHaveAttribute("data-stage-size", "compact")
        expect(panel).toHaveAttribute("data-stage-visibility", "roll")
        expect(panel).toHaveAttribute("data-stage-hide-delay", "1400")
        expect(panel.getAttribute("data-roll-button-class")).toContain("w-auto")
        expect(panel.getAttribute("data-roll-button-class")!.split(" ")).toEqual(expect.arrayContaining(["h-11", "px-6", "text-sm"]))
        // "Rolar" numa coluna à direita do texto, centralizada nos dois eixos (no celular, abaixo).
        const column = within(card).getByTestId("check-roll-column")
        expect(column).toContainElement(panel)
        expect(column.className.split(" ")).toEqual(expect.arrayContaining(["flex", "flex-col", "items-center", "justify-center", "shrink-0"]))
        expect(column.parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["flex", "flex-col", "sm:flex-row"]))
        expect(column.parentElement).toContainElement(within(card).getByTestId("check-title"))
        // Pendente: cor do rigor, sem desfecho nem crítico.
        const cardBox = within(card).getByTestId("check-card")
        expect(sameHex(cardBox.getAttribute("data-accent"), rigorColor("fiel-dnd"))).toBe(true)
        expect(cardBox).toHaveAttribute("data-outcome", "none")
        expect(within(card).queryByTestId("check-roll-result")).not.toBeInTheDocument()
        expect(screen.getByTestId("turn-banner")).toHaveTextContent("Turno do mestre — o Maddox pediu um teste para você")
        expect(screen.getByText("O Maddox pediu um teste para você: role os dados na conversa.")).toBeInTheDocument()
        // Esperando a rolagem, o Maddox não aparece "narrando".
        expect(screen.queryByTestId("maddox-writing")).not.toBeInTheDocument()

        fireEvent.click(within(panel).getByRole("button", { name: "Rolar" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/checks/k1/roll", {}))
        expect(await screen.findByText("Resultado enviado ao Maddox.")).toBeInTheDocument()
        // O resultado só aparece quando o dado para (o card já foi gravado como rolado).
        expect(screen.queryByTestId("check-roll-result")).not.toBeInTheDocument()
        // Enquanto rola, a cor do card não adianta o desfecho.
        expect(screen.getByTestId("check-card")).toHaveAttribute("data-outcome", "none")
        fireEvent.click(screen.getByRole("button", { name: "fim da animação" }))
        expect(await screen.findByTestId("check-roll-result")).toHaveTextContent("17")
        // Parado: o botão e o aviso saem; o resultado fica.
        expect(screen.queryByRole("button", { name: "Rolar" })).not.toBeInTheDocument()
        expect(screen.queryByText("Resultado enviado ao Maddox.")).not.toBeInTheDocument()
    })

    it("'Rolar' espera a ficha carregar; o modificador do servidor diferente da prévia não zera o dado de quem rolou", async () => {
        sheetQuery.loading = true
        // Servidor calcula +7 (ficha editada em outra janela); a prévia mostrava +5.
        const roll19 = { ...roll17, modifier: 7, total: 19 }
        post.mockResolvedValue(ok({ roll: roll19, state: gameState({ me: ME({ memberId: "m2", isOwner: false }), turn: { ...awaitingTurn, awaitingChecks: false, pendingChecks: [], generating: true }, messages: [checkMessage({ status: "rolled", roll: roll19 })] }) }))
        const view = await renderGame(gameState({ rigor: "fiel-dnd", me: ME({ memberId: "m2", isOwner: false }), turn: awaitingTurn, messages: [checkMessage()] }))
        let panel = within(screen.getByTestId("game-check-request")).getByTestId("fake-dice-panel")
        expect(within(panel).getByRole("button", { name: "Rolar" })).toBeDisabled()
        expect(panel).toHaveTextContent("Carregando a ficha…")
        sheetQuery.loading = false
        view.rerender(<GamePage campaignId="c1" />)
        panel = await waitFor(() => {
            const current = within(screen.getByTestId("game-check-request")).getByTestId("fake-dice-panel")
            expect(within(current).getByRole("button", { name: "Rolar" })).toBeEnabled()
            return current
        })
        expect(panel).toHaveAttribute("data-modifier", "5")
        fireEvent.click(within(panel).getByRole("button", { name: "Rolar" }))
        expect(await screen.findByText("Resultado enviado ao Maddox.")).toBeInTheDocument()
        const after = screen.getByTestId("fake-dice-panel")
        // O preset fica com o modificador do clique e o painel mantém o total mostrado.
        expect(after).toHaveAttribute("data-modifier", "5")
        await waitFor(() => expect(after).toHaveAttribute("data-shown", "19"))
        expect(screen.getByTestId("check-modifier-total")).toHaveTextContent("= d20 +7")
    })

    it("os outros não recebem o pedido: veem a espera com o nome; o dono pode 'Rolar no lugar' com confirmação", async () => {
        post.mockResolvedValue(ok({ roll: roll17, state: gameState({ turn: { ...awaitingTurn, awaitingChecks: false, pendingChecks: [], generating: true } }) }))
        await renderGame(gameState({ rigor: "fiel-dnd", turn: awaitingTurn, messages: [message("n2", { kind: "narration", phase: "master", turnNumber: 2, content: "Lyra avança…" })] }))
        expect(screen.queryByTestId("game-check-request")).not.toBeInTheDocument()
        expect(screen.getByTestId("turn-banner")).toHaveTextContent("Turno do mestre — aguardando o teste de Lyra")
        expect(screen.getByText("O Maddox aguarda os testes pedidos. Aguarde o turno dos jogadores.")).toBeInTheDocument()
        const seat = screen.getByTestId("seat-m2")
        expect(seat).toHaveTextContent("Rolando teste")
        expect(within(screen.getByTestId("seat-m1")).queryByRole("button", { name: /Rolar no lugar/ })).not.toBeInTheDocument()
        fireEvent.click(within(seat).getByRole("button", { name: "Rolar no lugar de Lyra" }))
        const dialog = await screen.findByRole("alertdialog")
        expect(dialog).toHaveTextContent("Rolar o teste no lugar de Lyra?")
        expect(post).not.toHaveBeenCalled()
        fireEvent.click(within(dialog).getByRole("button", { name: "Rolar no lugar" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/game/checks/k1/roll", {}))
    })

    it("um jogador que não é o dono não tem 'Rolar no lugar'", async () => {
        await renderGame(gameState({ rigor: "fiel-dnd", me: ME({ memberId: "m3", isOwner: false }), turn: awaitingTurn }))
        expect(screen.getByTestId("turn-banner")).toHaveTextContent("aguardando o teste de Lyra")
        expect(screen.queryByRole("button", { name: /Rolar no lugar/ })).not.toBeInTheDocument()
    })

    it("rolagem recebida pelo stream: todos repetem o dado com o resultado oficial, sem botão", async () => {
        await renderGame(gameState({ rigor: "fiel-dnd", turn: { ...awaitingTurn, awaitingChecks: false, pendingChecks: [], generating: true }, messages: [checkMessage({ status: "rolled", roll: roll17, modifierParts: [{ label: "Destreza", value: "+3", color: "dexterity" }, { label: "Prof.", value: "+2", color: "prof" }] })] }))
        expect(screen.getByTestId("check-roll-total")).toHaveTextContent("17")
        act(() => setStream({ rolled: [{ messageId: "k1", roll: roll17 }] }))
        const card = await screen.findByTestId("game-check-result")
        const panel = within(card).getByTestId("fake-dice-panel")
        expect(panel).toHaveAttribute("data-external", "17")
        expect(within(panel).queryByRole("button", { name: "Rolar" })).not.toBeInTheDocument()
        expect(card).toHaveTextContent("Lyra rolou")
        expect(within(card).getByTestId("check-modifiers")).toHaveTextContent("Destreza +3")
        // Quem assiste vê o dado girar; a linha do resultado espera o fim da animação.
        expect(within(card).queryByTestId("check-roll-result")).not.toBeInTheDocument()
        fireEvent.click(within(panel).getByRole("button", { name: "fim da animação" }))
        expect(await within(card).findByTestId("check-roll-total")).toHaveTextContent("17")
    })

    it("resultado gravado: total, d20 com o descartado, quem rolou no lugar e, com a CD visível, a CD e o sucesso", async () => {
        await renderGame(
            gameState({
                rigor: "fiel-dnd",
                showCheckDc: true,
                messages: [checkMessage({ status: "rolled", roll: roll17, dc: 15, success: true, rolledByName: "Marina", modifierParts: [{ label: "Destreza", value: "+3", color: "dexterity" }] })],
            }),
        )
        const card = screen.getByTestId("game-check-result")
        // Mesa recarregada depois da rolagem: só a linha, sem painel de dados.
        expect(within(card).queryByTestId("fake-dice-panel")).not.toBeInTheDocument()
        expect(within(card).getByTestId("check-roll-result")).toHaveTextContent("17d20 12 (descartado 7) +5")
        expect(card).toHaveTextContent("(rolado por Marina no lugar do jogador)")
        expect(card).toHaveTextContent("CD 15")
        expect(within(card).getByTestId("check-outcome")).toHaveTextContent("Sucesso")
        // O desfecho fica na mesma linha do total, e o card fica verde.
        expect(within(card).getByTestId("check-roll-result")).toContainElement(within(card).getByTestId("check-outcome"))
        const box = within(card).getByTestId("check-card")
        expect(box).toHaveAttribute("data-outcome", "success")
        expect(sameHex(box.getAttribute("data-accent"), rarityColors.uncommon)).toBe(true)
        expect(box).toHaveAttribute("data-critical", "none")
        expect(within(card).queryByTestId("critical-highlight")).not.toBeInTheDocument()
    })

    it("falha com a CD visível: bolha 'Falha' na linha do total e card vermelho", async () => {
        const roll9 = { ...roll17, rollId: "r9", mode: "normal" as const, terms: [{ dice: "d20" as const, quantity: 1, results: [4] }], selectedD20: { kept: 4, reason: "normal" as const }, diceTotal: 4, total: 9 }
        await renderGame(gameState({ rigor: "fiel-dnd", showCheckDc: true, messages: [checkMessage({ status: "rolled", mode: "normal", roll: roll9, dc: 15, success: false })] }))
        const box = screen.getByTestId("check-card")
        expect(box).toHaveAttribute("data-outcome", "failure")
        expect(sameHex(box.getAttribute("data-accent"), rarityColors.artifact)).toBe(true)
        expect(within(screen.getByTestId("check-roll-result")).getByTestId("check-outcome")).toHaveTextContent("Falha")
    })

    it("CD secreta sem crítico: cor do rigor e nenhuma bolha de desfecho", async () => {
        await renderGame(gameState({ rigor: "fiel-dnd", messages: [checkMessage({ status: "rolled", roll: roll17 })] }))
        const box = screen.getByTestId("check-card")
        expect(box).toHaveAttribute("data-outcome", "none")
        expect(sameHex(box.getAttribute("data-accent"), rigorColor("fiel-dnd"))).toBe(true)
        expect(screen.queryByTestId("check-outcome")).not.toBeInTheDocument()
        expect(screen.queryByTestId("check-critical")).not.toBeInTheDocument()
    })

    it("20 natural recém-rolado com a CD secreta: destaque animado verde, bolha '20 natural' e card verde", async () => {
        const roll20 = { ...roll17, rollId: "r20", selectedD20: { kept: 20, discarded: 3, reason: "advantage" as const }, terms: [{ dice: "d20" as const, quantity: 1, results: [20] }], diceTotal: 20, total: 25 }
        await renderGame(gameState({ rigor: "fiel-dnd", turn: { ...awaitingTurn, awaitingChecks: false, pendingChecks: [], generating: true }, messages: [checkMessage({ status: "rolled", roll: roll20 })] }))
        act(() => setStream({ rolled: [{ messageId: "k1", roll: roll20 }] }))
        const card = await screen.findByTestId("game-check-result")
        expect(within(card).getByTestId("check-card")).toHaveAttribute("data-critical", "none")
        fireEvent.click(within(card).getByRole("button", { name: "fim da animação" }))
        const box = await within(card).findByTestId("check-card")
        await waitFor(() => expect(box).toHaveAttribute("data-critical", "critical-success"))
        expect(sameHex(box.getAttribute("data-accent"), rarityColors.uncommon)).toBe(true)
        expect(within(card).getByTestId("critical-highlight")).toHaveAttribute("data-critical-state", "critical-success")
        expect(within(card).getByTestId("check-critical")).toHaveTextContent("20 natural")
        expect(within(card).queryByTestId("check-outcome")).not.toBeInTheDocument()
    })

    it("1 natural na desvantagem com a CD visível: falha mesmo acima da CD, destaque vermelho também no histórico", async () => {
        const roll1 = { ...roll17, rollId: "r1n", mode: "disadvantage" as const, terms: [{ dice: "d20" as const, quantity: 1, results: [1] }], selectedD20: { kept: 1, discarded: 15, reason: "disadvantage" as const }, diceTotal: 1, modifier: 15, total: 16 }
        await renderGame(gameState({ rigor: "fiel-dnd", showCheckDc: true, messages: [checkMessage({ status: "rolled", mode: "disadvantage", roll: roll1, dc: 15, success: false })] }))
        const box = screen.getByTestId("check-card")
        expect(box).toHaveAttribute("data-critical", "critical-failure")
        expect(box).toHaveAttribute("data-outcome", "failure")
        expect(sameHex(box.getAttribute("data-accent"), rarityColors.artifact)).toBe(true)
        expect(within(box).getByTestId("critical-highlight")).toHaveAttribute("data-critical-state", "critical-failure")
        expect(within(box).getByTestId("check-critical")).toHaveTextContent("1 natural")
        expect(within(box).getByTestId("check-outcome")).toHaveTextContent("Falha")
    })

    it("teste cancelado vira uma nota discreta", async () => {
        await renderGame(gameState({ rigor: "fiel-dnd", messages: [checkMessage({ status: "cancelled", cancelReason: "O jogador saiu da campanha" })] }))
        expect(screen.getByTestId("game-check-cancelled")).toHaveTextContent("Teste de Lyra cancelado (o jogador saiu da campanha).")
    })

    it("'Minha ficha' só aparece com ficha e abre a janela da ficha; NPCs conhecidos com nome e foto", async () => {
        const view = await renderGame(gameState({ npcs: [] }))
        expect(screen.queryByRole("button", { name: /Minha ficha/ })).not.toBeInTheDocument()
        expect(screen.getByText("Ninguém ainda: os NPCs aparecem aqui quando o grupo os conhece.")).toBeInTheDocument()
        view.unmount()

        await renderGame(gameState({ rigor: "fiel-dnd", me: ME({ sheet: { id: "s1", slug: "lyra" } }), npcs: [{ id: "n1", name: "Bartolomeu", portraitUrl: "/api/upload?key=npc.png", status: "active" }, { id: "n2", name: "Irmã Vela", portraitUrl: null, status: "active" }, { id: "n3", name: "Capitã Seraphine Vael do Porto Cinzento", portraitUrl: null, status: "active" }] }))
        fireEvent.click(screen.getByRole("button", { name: /Minha ficha/ }))
        expect(addWindow).toHaveBeenCalledWith(expect.objectContaining({ id: "maddox-sheet", title: "Minha ficha" }))
        expect(screen.getByTestId("npc-n1")).toHaveTextContent("Bartolomeu")
        expect(screen.getByTestId("npc-n2")).toHaveTextContent("Irmã Vela")
        expect(screen.getByText("NPCs conhecidos (3)")).toBeInTheDocument()
        // Nome gerado pelo modelo: inteiro, quebrando linha em vez de reticências.
        const longName = within(screen.getByTestId("npc-n3")).getByText("Capitã Seraphine Vael do Porto Cinzento")
        expect(longName.className.split(" ")).toEqual(expect.arrayContaining(["whitespace-normal", "break-words", "min-w-0"]))
        expect(longName.className.split(" ")).not.toContain("truncate")
    })

    it("Diário (Maddox 9): botões no cabeçalho, NPC do painel abre o diário e a busca rápida leva ao item", async () => {
        const search = {
            query: "bart",
            npcs: { items: [{ id: "n1", name: "Bartolomeu", portraitUrl: null, status: "active", excerpt: "Taverneiro gordo." }], hasMore: false },
            memories: { items: [], hasMore: false },
            messages: { items: [{ id: "msg-9", kind: "narration", turnNumber: 4, characterName: null, excerpt: "Bartolomeu grita por água.", createdAt: "2026-10-31T10:00:00.000Z" }], hasMore: false },
            party: { items: [], hasMore: false },
            state: null,
        }
        const state = gameState({ npcs: [{ id: "n1", name: "Bartolomeu", portraitUrl: null, status: "active" }] })
        get.mockImplementation(async (url: string) => (url.endsWith("/journal/search") ? ok(search) : ok(state)))
        renderWithQueryClient(<GamePage campaignId="c1" />)
        await screen.findByTestId("game-page")

        expect(screen.getByTestId("journal-link")).toHaveAttribute("href", "/campanhas/c1/diario")
        expect(within(screen.getByTestId("npc-n1")).getByRole("link")).toHaveAttribute("href", "/campanhas/c1/diario?aba=npcs#npc-n1")

        fireEvent.click(screen.getByTestId("journal-search-open"))
        const dialog = await screen.findByRole("dialog")
        fireEvent.change(within(dialog).getByRole("searchbox", { name: "Buscar no diário" }), { target: { value: "bart" } })
        const hits = await within(dialog).findAllByTestId("journal-search-hit", {}, { timeout: 2000 })
        expect(hits.map((hit) => hit.getAttribute("href"))).toEqual(["/campanhas/c1/diario?aba=npcs#npc-n1", "/campanhas/c1/diario?aba=historico&msg=msg-9"])
        expect(get).toHaveBeenCalledWith("/maddox/campaigns/c1/journal/search", { params: { q: "bart" } })
        expect(within(dialog).getByTestId("search-group-messages")).toHaveTextContent("Turno 4")
        fireEvent.click(hits[0]!)
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("regras puras: situação 'Rolando teste', faixa com vários nomes e sem recarga periódica esperando rolagens", () => {
        const state = gameState({ turn: { ...awaitingTurn, pendingChecks: [{ checkId: "k1", memberId: "m2", characterName: "Lyra" }, { checkId: "k2", memberId: "m3", characterName: "Borin" }] } })
        const presence = { available: true, online: new Set(["u-owner", "u-ana", "u-bia"]) }
        expect(seatStatus(participant("m2", "u-ana", "Lyra"), state, presence)).toBe("rolling")
        expect(seatStatus(participant("m1", "u-owner", "Kael"), state, presence)).toBe("watching")
        expect(masterBannerText(state)).toBe("Turno do mestre — aguardando o teste de Lyra e Borin")
        expect(masterBannerText({ ...state, me: ME({ memberId: "m2" }) })).toBe("Turno do mestre — o Maddox pediu um teste para você (e aguarda Borin)")
        expect(composerBlockReason({ ...state, me: ME({ memberId: "m3" }) })).toBe("O Maddox pediu um teste para você: role os dados na conversa.")
        expect(gameRefetchInterval(state, true)).toBe(false)
    })
})

describe("mesa Maddox — combate narrativo (Maddox 6)", () => {
    const combat = { id: "cb1", title: "Emboscada no cais", location: "Cais de Brumas", startedTurn: 2, masterTurns: 1, combatants: [{ name: "Varn", side: "inimigo" as const, quantity: 1, condition: "ileso", outcome: null }, { name: "Contrabandista", side: "inimigo" as const, quantity: 3, condition: "", outcome: null }] }
    const startCard = message("cs", { turnNumber: 2, phase: "master", kind: "combat", combat: { ...combat, event: "start", outcome: null, summary: "", rewards: [], endedTurn: null } })
    const narration2 = message("n2", { turnNumber: 2, phase: "master", kind: "narration", content: "Facas brilham na névoa." })
    const narration4 = message("n4", { turnNumber: 4, phase: "master", kind: "narration", content: "O silêncio volta ao cais." })
    const endCard = message("ce", {
        turnNumber: 4,
        phase: "master",
        kind: "combat",
        combat: {
            ...combat,
            masterTurns: 3,
            event: "end",
            outcome: "vitoria",
            summary: "Varn caiu e os contrabandistas fugiram.",
            endedTurn: 4,
            combatants: [{ ...combat.combatants[0]!, outcome: "morto" }, { ...combat.combatants[1]!, outcome: "fugiu" }],
            rewards: [
                { kind: "moedas", description: "30 po para Lyra", characterName: "Lyra", applied: true, warning: null },
                { kind: "item", description: "Amuleto de Osso para Borin", characterName: "Borin", applied: true, warning: '"Amuleto de Osso" não está no catálogo: entrou como item próprio.' },
                { kind: "outro", description: "Um mapa do farol", characterName: null, applied: false, warning: null },
            ],
        },
    })

    it("card de início antes da narração (com o divisor do turno) e card de fim com desfecho, NPCs e recompensas", async () => {
        await renderGame(gameState({ messages: [startCard, narration2, narration4, endCard] }))
        const log = screen.getByRole("log")
        const order = [...log.querySelectorAll("[data-testid='turn-divider'], [data-testid='combat-start-card'], [data-testid='maddox-narration'], [data-testid='combat-end-card']")].map((node) => node.getAttribute("data-testid"))
        expect(order).toEqual(["turn-divider", "combat-start-card", "maddox-narration", "turn-divider", "maddox-narration", "combat-end-card"])
        const start = screen.getByTestId("combat-start-card")
        expect(start).toHaveTextContent("Combate!")
        expect(start).toHaveTextContent("Emboscada no cais")
        expect(start).toHaveTextContent("Cais de Brumas")
        expect(start).toHaveTextContent("Contrabandista (3)")
        const end = screen.getByTestId("combat-end-card")
        expect(within(end).getByTestId("combat-outcome")).toHaveTextContent("Vitória")
        expect(end.querySelector("[data-accent]")).toHaveAttribute("data-accent", rarityColors.uncommon)
        expect(within(end).getByTestId("combat-summary")).toHaveTextContent("Varn caiu e os contrabandistas fugiram.")
        expect(end).toHaveTextContent("Varn · Morto")
        expect(end).toHaveTextContent("Contrabandista (3) · Fugiu")
        const rewards = within(end).getAllByTestId("combat-reward")
        expect(rewards).toHaveLength(3)
        expect(rewards[0]).toHaveTextContent("30 po para Lyra")
        expect(within(rewards[0]!).getByTestId("combat-reward-applied")).toHaveTextContent("Na ficha")
        expect(rewards[1]).toHaveTextContent("não está no catálogo: entrou como item próprio.")
        expect(within(rewards[2]!).queryByTestId("combat-reward-applied")).not.toBeInTheDocument()
        expect(end).toHaveTextContent("Durou 3 narrações (turnos 2–4).")
    })

    it("chip 'Em combate' aparece e some pelo tempo real, sem recarregar a página; NPC morto esmaecido", async () => {
        await renderGame(gameState())
        expect(screen.queryByTestId("combat-chip")).not.toBeInTheDocument()
        get.mockResolvedValue(ok(gameState({ combat, messages: [startCard, narration2] })))
        emit("maddox.game.changed")
        expect(await screen.findByTestId("combat-chip")).toHaveTextContent("Em combate · Emboscada no cais")
        get.mockResolvedValue(ok(gameState({ combat: null, npcs: [{ id: "n1", name: "Varn", portraitUrl: null, status: "dead" }, { id: "n2", name: "Irmã Vela", portraitUrl: null, status: "unknown" }], messages: [startCard, narration2, narration4, endCard] })))
        emit("maddox.game.changed")
        await waitFor(() => expect(screen.queryByTestId("combat-chip")).not.toBeInTheDocument())
        expect(screen.getByTestId("combat-end-card")).toBeInTheDocument()
        expect(screen.getByTestId("npc-n1")).toHaveAttribute("data-status", "dead")
        expect(screen.getByTestId("npc-n1").className).toContain("opacity-50")
        expect(screen.getByTestId("npc-n1")).toHaveTextContent("Morto")
        expect(screen.getByTestId("npc-n2")).toHaveTextContent("Paradeiro desconhecido")
    })
})

describe("controles da mesa usam os componentes do projeto", () => {
    it("components/game não importa @/core/ui/tabs nem usa select/checkbox nativos", async () => {
        const { readdirSync, readFileSync } = await import("node:fs")
        const { join } = await import("node:path")
        const dir = join(process.cwd(), "src/features/maddox/components/game")
        for (const file of readdirSync(dir).filter((name) => name.endsWith(".tsx"))) {
            const source = readFileSync(join(dir, file), "utf8")
            expect(source, file).not.toContain("@/core/ui/tabs")
            expect(source, file).not.toMatch(/<select[\s>]/)
            expect(source, file).not.toMatch(/type=["']checkbox["']/)
        }
    })
})
