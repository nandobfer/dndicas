import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderWithQueryClient as render } from "../../frontend/test-utils"
import { canManageGmScene, OwlbearGmSceneController } from "@/features/owlbear/gm-scene-controller"
import { OwlbearCatalogAction } from "@/features/owlbear/owlbear-action-surface"
import { OwlbearShell } from "@/features/owlbear/owlbear-shell"

const useSheetListMock = vi.hoisted(() => vi.fn())
const useCreateSheetMock = vi.hoisted(() => vi.fn())
const useCreateAssistedSheetMock = vi.hoisted(() => vi.fn())
const useSheetMock = vi.hoisted(() => vi.fn())
const useRoomLinkedSheetsMock = vi.hoisted(() => vi.fn())
const clerkState = vi.hoisted(() => ({
    isLoaded: true,
    isSignedIn: false,
    userId: null as string | null,
}))

const kaelSheet = {
    _id: "sheet-1",
    name: "Kael",
    level: 2,
    computedArmorClass: 14,
    class: "Guerreiro",
    subclass: "",
    race: "Humano",
    origin: "",
    slug: "kael",
    userId: "user-1",
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 11,
    charisma: 8,
    hpCurrent: 18,
    hpMax: 20,
}

function clickSheetCard(sheetName: string) {
    const card = screen.getAllByTestId("glass-sheet-card").find((node) =>
        node.getAttribute("data-interactive") === "true" && node.textContent?.includes(sheetName)
    )
    expect(card).toBeDefined()
    fireEvent.click(card!)
}

const readyGmRuntime = {
    status: "ready" as const,
    role: "GM" as const,
    roomId: "room-1",
    playerId: "player-1",
    themeMode: "dark" as const,
    sceneReady: true,
}

const readyPlayerRuntime = {
    ...readyGmRuntime,
    role: "PLAYER" as const,
}

const readySession = {
    sessionStatus: "ready" as const,
    sessionToken: "token-1",
    sessionExpiresAt: "2099-04-20T10:15:00.000Z",
    isAuthenticated: true,
}

const sdkMock = vi.hoisted(() => {
    const callbacks: Array<() => void> = []
    return {
        callbacks,
        onReady: vi.fn((callback: () => void) => {
            callbacks.push(callback)
            return () => undefined
        }),
        action: {
            open: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
        },
        player: {
            getId: vi.fn().mockResolvedValue("player-1"),
            getName: vi.fn().mockResolvedValue("Nando"),
            getRole: vi.fn<() => Promise<"GM" | "PLAYER">>(),
            deselect: vi.fn().mockResolvedValue(undefined),
        },
        party: {
            getPlayers: vi.fn().mockResolvedValue([]),
            onChange: vi.fn(() => () => undefined),
        },
        room: {
            id: "room-1",
            getMetadata: vi.fn().mockResolvedValue({}),
            setMetadata: vi.fn().mockResolvedValue(undefined),
            onMetadataChange: vi.fn(() => () => undefined),
        },
        contextMenu: {
            create: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined),
        },
        scene: {
            isReady: vi.fn().mockResolvedValue(true),
            onReadyChange: vi.fn(() => () => undefined),
            items: {
                getItems: vi.fn().mockResolvedValue([]),
                updateItems: vi.fn().mockResolvedValue(undefined),
                addItems: vi.fn().mockResolvedValue(undefined),
                deleteItems: vi.fn().mockResolvedValue(undefined),
                onChange: vi.fn(() => () => undefined),
            },
        },
        theme: {
            getTheme: vi.fn().mockResolvedValue({ mode: "DARK" as const }),
            onChange: vi.fn(() => () => undefined),
        },
        isAvailable: true,
        isReady: true,
    }
})

vi.mock("@owlbear-rodeo/sdk", () => ({
    default: sdkMock,
}))

vi.mock("@/features/owlbear/owlbear-sdk-client", () => ({
    preloadedOwlbearSdk: sdkMock,
}))

vi.mock("@/core/hooks/useAuth", () => ({
    useAuth: () => ({
        signOut: vi.fn(),
        userId: clerkState.userId,
        isLoaded: clerkState.isLoaded,
        isSignedIn: clerkState.isSignedIn,
    }),
}))

vi.mock("@/features/character-sheets/hooks/use-sheet-list", () => ({
    useSheetList: () => useSheetListMock(),
}))

vi.mock("@/features/character-sheets/api/character-sheets-queries", () => ({
    useCreateAssistedSheet: () => useCreateAssistedSheetMock(),
    useCreateSheet: () => useCreateSheetMock(),
    useSheet: (id: string | null) => useSheetMock(id),
}))

vi.mock("@/features/owlbear/use-room-linked-sheets", () => ({
    useRoomLinkedSheets: (...args: unknown[]) => useRoomLinkedSheetsMock(...args),
}))

vi.mock("@/features/character-sheets/hooks/use-character-sheet-realtime", () => ({
    useCharacterSheetRealtime: () => undefined,
}))

vi.mock("@/features/rules/components/mention-badge", () => ({
    MentionContent: ({ html }: { html: string }) => (
        <span data-testid="mention-content">
            {html.replace(/<[^>]*>/g, "")}
        </span>
    ),
}))

vi.mock("@/components/ui/glass-sheet-card", () => ({
    GlassSheetCard: ({
        sheet,
        onOpen,
        interactive = true,
        actionLabel,
        onAction,
    }: {
        sheet: { name: string }
        onOpen?: (sheet: { name: string }) => void
        interactive?: boolean
        actionLabel?: string
        onAction?: (sheet: { name: string }) => void
    }) => interactive ? (
        <div>
            <button type="button" data-testid="glass-sheet-card" data-interactive="true" onClick={() => onOpen?.(sheet)}>
                {sheet.name}
            </button>
            {actionLabel && (
                <button type="button" onClick={() => onAction?.(sheet)}>
                    {actionLabel}
                </button>
            )}
        </div>
    ) : (
        <div data-testid="glass-sheet-card" data-interactive="false">
            {sheet.name}
        </div>
    ),
}))

vi.mock("@/features/character-sheets/components/sheet-form", () => ({
    SheetForm: ({ sheet, layoutMode, navigateOnSlugChange }: { sheet: { _id?: string; name?: string }; layoutMode?: string; navigateOnSlugChange?: boolean }) => (
        <div data-testid="sheet-form" data-sheet-id={sheet._id ?? ""} data-sheet-name={sheet.name ?? ""} data-layout-mode={layoutMode} data-navigate-on-slug-change={String(navigateOnSlugChange)}>
            Sheet Form Mock
        </div>
    ),
}))

vi.mock("@/app/(dashboard)/my-sheets/_components/assisted-sheet-creation-modal", () => ({
    AssistedSheetCreationModal: () => null,
}))

describe("OwlbearShell", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useRealTimers()
        window.history.pushState({}, "", "/")
        globalThis.__DNDICAS_DICE_BOX_LOADER__ = async () => class MockDiceBox {
            diceList: Array<{
                body: {
                    angularVelocity: { set: () => void }
                    position: { copy: () => void }
                    velocity: { set: () => void }
                }
                getLastValue: () => { value: number }
                position: { set: () => void }
            }> = []
            display = { containerWidth: 160, containerHeight: 120, scale: 10 }
            renderer = { render: vi.fn() }
            scene = {}
            camera = {}

            initialize = vi.fn().mockResolvedValue(undefined)
            clearDice = vi.fn()
            roll = vi.fn().mockResolvedValue([])
            simulateThrow = vi.fn()
            swapDiceFace = vi.fn()
            startClickThrow = vi.fn((notation: string) => ({
                vectors: notation.split("@")[0].split("+").filter(Boolean),
                result: notation.split("@")[1]?.split(/[!,]/).map((value) => Number(value)).filter(Number.isFinite) ?? [],
            }))
            spawnDice = vi.fn(() => {
                this.diceList.push({
                    body: {
                        angularVelocity: { set: vi.fn() },
                        position: { copy: vi.fn() },
                        velocity: { set: vi.fn() },
                    },
                    getLastValue: () => ({ value: 0 }),
                    position: { set: vi.fn() },
                })
            })
        } as never
        sdkMock.callbacks.length = 0
        sdkMock.isAvailable = true
        sdkMock.isReady = true
        sdkMock.room.id = "room-1"
        sdkMock.action.open.mockResolvedValue(undefined)
        sdkMock.action.close.mockResolvedValue(undefined)
        sdkMock.room.getMetadata.mockResolvedValue({})
        sdkMock.room.setMetadata.mockResolvedValue(undefined)
        sdkMock.room.onMetadataChange.mockReturnValue(() => undefined)
        sdkMock.player.getId.mockResolvedValue("player-1")
        sdkMock.player.getName.mockResolvedValue("Nando")
        sdkMock.player.getRole.mockReset()
        sdkMock.player.deselect.mockResolvedValue(undefined)
        sdkMock.party.getPlayers.mockResolvedValue([])
        sdkMock.party.onChange.mockReturnValue(() => undefined)
        sdkMock.scene.isReady.mockResolvedValue(true)
        sdkMock.scene.items.getItems.mockResolvedValue([])
        sdkMock.scene.items.updateItems.mockResolvedValue(undefined)
        sdkMock.scene.items.addItems.mockResolvedValue(undefined)
        sdkMock.scene.items.deleteItems.mockResolvedValue(undefined)
        sdkMock.scene.items.onChange.mockReturnValue(() => undefined)
        sdkMock.contextMenu.create.mockResolvedValue(undefined)
        sdkMock.contextMenu.remove.mockResolvedValue(undefined)
        sdkMock.theme.getTheme.mockResolvedValue({ mode: "DARK" as const })
        clerkState.isLoaded = true
        clerkState.isSignedIn = false
        clerkState.userId = null
        useSheetListMock.mockReturnValue({
            sheets: [],
            search: "",
            handleSearch: vi.fn(),
            isLoading: false,
            isFetchingNextPage: false,
            hasNextPage: false,
            fetchNextPage: vi.fn(),
        })
        useCreateSheetMock.mockReturnValue({
            mutateAsync: vi.fn(),
            isPending: false,
        })
        useCreateAssistedSheetMock.mockReturnValue({
            mutateAsync: vi.fn(),
            isPending: false,
        })
        useSheetMock.mockReturnValue({
            data: null,
            isLoading: false,
            isFetching: false,
            isError: false,
            error: null,
        })
        useRoomLinkedSheetsMock.mockReturnValue({
            entries: [],
            sheets: [],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            unlinkSheet: vi.fn(),
        })
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
            token: "token-1",
            expiresAt: "2099-04-20T10:15:00.000Z",
        }), {
            status: 201,
            headers: { "content-type": "application/json" },
        }))))
    })

    afterEach(() => {
        globalThis.__DNDICAS_DICE_BOX_LOADER__ = undefined
    })

    it("renders GM tabs without resizing the action on load", async () => {
        sdkMock.player.getRole.mockResolvedValue("GM")

        render(<OwlbearShell />)

        expect(await screen.findByRole("button", { name: "Fichas" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "NPCs" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Catálogo" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Dados" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Ficha" })).not.toBeInTheDocument()
        expect(screen.getByTitle("Dndicas Dashboard")).toHaveAttribute("src", "/?owlbearCatalogEmbed=1")
        expect(screen.queryByText("Dashboard completo do Dndicas")).not.toBeInTheDocument()
        expect(screen.queryByText("Abrir fora")).not.toBeInTheDocument()

        expect(screen.getByTitle("Dndicas Dashboard")).not.toHaveAttribute("scrolling", "no")
    })

    it("renders PLAYER tabs and keeps catalog as the initial tab", async () => {
        sdkMock.player.getRole.mockResolvedValue("PLAYER")

        render(<OwlbearShell />)

        expect(await screen.findByRole("button", { name: "Catálogo" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Dados" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Ficha" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Catálogo" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Fichas" })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "NPCs" })).not.toBeInTheDocument()
        expect(screen.getByTitle("Dndicas Dashboard")).toBeInTheDocument()
    })

    it("renders the standalone catalog action without bootstrapping the Owlbear runtime", () => {
        render(<OwlbearCatalogAction />)

        expect(screen.getByTitle("Dndicas - catalogo")).toBeInTheDocument()
        expect(sdkMock.onReady).not.toHaveBeenCalled()
        expect(sdkMock.player.getRole).not.toHaveBeenCalled()
    })

    it("does not resize the action when switching tabs", async () => {
        sdkMock.player.getRole.mockResolvedValue("GM")

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Fichas" })
        fireEvent.click(screen.getByRole("button", { name: "Fichas" }))

        expect(await screen.findByRole("heading", { name: "Nenhuma ficha vinculada" })).toBeInTheDocument()
    })

    it("renders the shared dice tab without resizing the action when opening it", async () => {
        sdkMock.player.getRole.mockResolvedValue("PLAYER")
        sdkMock.room.getMetadata.mockResolvedValue({
            "com.dndicas.owlbear/room": {
                version: 1,
                playerLinks: {},
                diceHistory: [{
                    id: "roll-1",
                    playerName: "Nando",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    result: {
                        rollId: "roll-1",
                        terms: [{ dice: "d20", quantity: 1, results: [18] }],
                        mode: "advantage",
                        selectedD20: { kept: 18, discarded: 7, reason: "advantage" },
                        diceTotal: 18,
                        modifier: 2,
                        total: 20,
                        createdAt: "2026-01-01T00:00:00.000Z",
                    },
                }],
            },
        })

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Dados" })
        fireEvent.click(screen.getByRole("button", { name: "Dados" }))

        expect(await screen.findByText("HISTÓRICO")).toBeInTheDocument()
        expect(screen.queryByText("Dados da sala")).not.toBeInTheDocument()
        expect(screen.queryByText("Histórico compartilhado")).not.toBeInTheDocument()
    })

    it("shows the GM fichas tab without Clerk login", async () => {
        sdkMock.player.getRole.mockResolvedValue("GM")
        sdkMock.room.getMetadata.mockResolvedValue({
            "com.dndicas.owlbear/room": {
                version: 1,
                playerLinks: {},
            },
        })

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Fichas" })
        fireEvent.click(screen.getByRole("button", { name: "Fichas" }))

        await waitFor(() => {
            expect(fetch).toHaveBeenCalled()
        })

        expect(screen.queryByTestId("clerk-sign-in")).not.toBeInTheDocument()
        expect(screen.queryByText("A sessão Owlbear-aware não pôde ser inicializada. Reabra a action para tentar novamente.")).not.toBeInTheDocument()
    })

    it("allows switching GM sheets A to B and back to A", async () => {
        const miraSheet = {
            ...kaelSheet,
            _id: "sheet-2",
            name: "Mira",
            slug: "mira",
        }
        sdkMock.player.getRole.mockResolvedValue("GM")
        useRoomLinkedSheetsMock.mockReturnValue({
            entries: [
                { playerId: "player-1", sheetId: "sheet-1" },
                { playerId: "player-2", sheetId: "sheet-2" },
            ],
            sheets: [kaelSheet, miraSheet],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            unlinkSheet: vi.fn(),
        })
        useSheetMock.mockImplementation((id: string | null) => ({
            data: id === "sheet-2" ? miraSheet : id === "sheet-1" ? kaelSheet : null,
            isLoading: false,
            isFetching: false,
            isError: false,
            error: null,
        }))

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Fichas" })
        fireEvent.click(screen.getByRole("button", { name: "Fichas" }))

        expect(await screen.findByTestId("sheet-form")).toHaveAttribute("data-sheet-id", "sheet-1")

        clickSheetCard("Mira")
        expect(await screen.findByTestId("sheet-form")).toHaveAttribute("data-sheet-id", "sheet-2")

        clickSheetCard("Kael")
        expect(await screen.findByTestId("sheet-form")).toHaveAttribute("data-sheet-id", "sheet-1")
    })

    it("treats a ready GM Owlbear-aware session as sufficient for scene management", () => {
        expect(canManageGmScene(readyGmRuntime, readySession)).toBe(true)
        expect(canManageGmScene(readyPlayerRuntime, readySession)).toBe(false)
        expect(canManageGmScene(readyGmRuntime, {
            ...readySession,
            sessionToken: null,
        })).toBe(false)
    })

    it("enables room-linked sheets for a ready GM session without depending on Clerk auth", () => {
        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        expect(useRoomLinkedSheetsMock).toHaveBeenCalledWith("token-1", true)
    })

    it("keeps GM scene integrations disabled for players", async () => {
        render(<OwlbearGmSceneController runtime={readyPlayerRuntime} session={readySession} />)

        await waitFor(() => {
            expect(screen.queryByRole("heading", { name: "Vincular ficha ao token" })).not.toBeInTheDocument()
        })

        expect(useRoomLinkedSheetsMock).toHaveBeenCalledWith("token-1", false)
        expect(sdkMock.contextMenu.create).not.toHaveBeenCalled()
    })

    it("renders a technical banner only when the SDK is truly unavailable", async () => {
        sdkMock.isAvailable = false

        render(<OwlbearShell />)

        expect(await screen.findByText("SDK Owlbear indisponível nesta action.")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Catálogo" })).toBeInTheDocument()
        expect(screen.getByTitle("Dndicas Dashboard")).toBeInTheDocument()
    })

    it("keeps retrying inside the Owlbear action when the SDK is initially unavailable", async () => {
        window.history.pushState({}, "", "/owlbear/action")
        sdkMock.isAvailable = false
        sdkMock.player.getRole.mockResolvedValue("GM")

        render(<OwlbearShell />)

        expect(screen.queryByText("SDK Owlbear indisponível nesta action.")).not.toBeInTheDocument()

        await new Promise((resolve) => window.setTimeout(resolve, 50))
        sdkMock.isAvailable = true

        expect(await screen.findByRole("button", { name: "Fichas" }, { timeout: 2500 })).toBeInTheDocument()
        expect(screen.queryByText("SDK Owlbear indisponível nesta action.")).not.toBeInTheDocument()
    })

    it("keeps booting until OBR.onReady before reading the Owlbear runtime", async () => {
        window.history.pushState({}, "", "/owlbear/action")
        sdkMock.isReady = false
        sdkMock.player.getRole.mockResolvedValue("GM")
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

        try {
            render(<OwlbearShell />)

            expect(screen.queryByText("SDK Owlbear indisponível nesta action.")).not.toBeInTheDocument()
            expect(screen.queryByRole("button", { name: "Fichas" })).not.toBeInTheDocument()

            await waitFor(() => {
                expect(sdkMock.onReady).toHaveBeenCalled()
            })

            sdkMock.isReady = true
            await act(async () => {
                sdkMock.callbacks.forEach((callback) => callback())
            })

            expect(await screen.findByRole("button", { name: "Fichas" })).toBeInTheDocument()
            expect(screen.queryByText("SDK Owlbear indisponível nesta action.")).not.toBeInTheDocument()
            expect(consoleErrorSpy).not.toHaveBeenCalledWith("Failed to bootstrap Owlbear runtime", expect.any(Error))
        } finally {
            consoleErrorSpy.mockRestore()
        }
    })

    it("retries readiness without depending exclusively on OBR.onReady", async () => {
        window.history.pushState({}, "", "/owlbear/action")
        sdkMock.isReady = false
        sdkMock.player.getRole.mockResolvedValue("GM")

        render(<OwlbearShell />)

        expect(screen.queryByText("SDK Owlbear indisponível nesta action.")).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Fichas" })).not.toBeInTheDocument()

        await waitFor(() => {
            expect(sdkMock.onReady).toHaveBeenCalled()
        })

        await new Promise((resolve) => window.setTimeout(resolve, 50))
        sdkMock.isReady = true

        expect(await screen.findByRole("button", { name: "Fichas" }, { timeout: 2500 })).toBeInTheDocument()
        expect(screen.queryByText("SDK Owlbear indisponível nesta action.")).not.toBeInTheDocument()
    })

    it("shows the shared my-sheets picker without resizing the action when no room link exists", async () => {
        sdkMock.player.getRole.mockResolvedValue("PLAYER")
        clerkState.isSignedIn = true
        clerkState.userId = "user-1"
        sdkMock.room.getMetadata.mockResolvedValue({
            "com.dndicas.owlbear/room": {
                version: 1,
                playerLinks: {},
            },
        })
        useSheetListMock.mockReturnValue({
            sheets: [kaelSheet],
            search: "",
            handleSearch: vi.fn(),
            isLoading: false,
            isFetchingNextPage: false,
            hasNextPage: false,
            fetchNextPage: vi.fn(),
        })

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Ficha" })
        fireEvent.click(screen.getByRole("button", { name: "Ficha" }))

        expect(await screen.findByRole("heading", { name: "Minhas Fichas" }, { timeout: 3000 })).toBeInTheDocument()
    })

    it("shows the external login prompt instead of a technical session error when the player is anonymous", async () => {
        sdkMock.player.getRole.mockResolvedValue("PLAYER")

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Ficha" })
        fireEvent.click(screen.getByRole("button", { name: "Ficha" }))

        expect(await screen.findByText(/Para acessar suas fichas, faça login no Dungeons & Dicas em uma aba do navegador e reabra esta action/i)).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /Abrir login/i })).toHaveAttribute("target", "_blank")
        expect(screen.queryByText("A sessão Owlbear-aware não pôde ser inicializada. Reabra a action para tentar novamente.")).not.toBeInTheDocument()
    })

    it("keeps the ficha tab usable during background fetching", async () => {
        sdkMock.player.getRole.mockResolvedValue("PLAYER")
        clerkState.isSignedIn = true
        clerkState.userId = "user-1"
        sdkMock.room.getMetadata.mockResolvedValue({
            "com.dndicas.owlbear/room": {
                version: 1,
                playerLinks: {},
            },
        })
        sdkMock.room.setMetadata.mockResolvedValue(undefined)

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Ficha" })
        fireEvent.click(screen.getByRole("button", { name: "Ficha" }))

        expect(await screen.findByRole("heading", { name: "Minhas Fichas" })).toBeInTheDocument()
        expect(screen.queryByText("A sessão Owlbear-aware não pôde ser inicializada. Reabra a action para tentar novamente.")).not.toBeInTheDocument()
    })

    it("reuses the existing backend session when returning to the ficha tab", async () => {
        sdkMock.player.getRole.mockResolvedValue("PLAYER")
        clerkState.isSignedIn = true
        clerkState.userId = "user-1"
        sdkMock.room.getMetadata.mockResolvedValue({
            "com.dndicas.owlbear/room": {
                version: 1,
                playerLinks: {},
            },
        })
        sdkMock.room.setMetadata.mockResolvedValue(undefined)
        useSheetMock.mockReturnValue({
            data: { _id: "sheet-1", slug: "kael", userId: "user-1", name: "Kael" },
            isLoading: false,
            isFetching: false,
            isError: false,
            error: null,
        })

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Ficha" })
        fireEvent.click(screen.getByRole("button", { name: "Ficha" }))

        expect(await screen.findByRole("heading", { name: "Minhas Fichas" })).toBeInTheDocument()

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledTimes(1)
        })

        fireEvent.click(screen.getByRole("button", { name: "Catálogo" }))
        fireEvent.click(screen.getByRole("button", { name: "Ficha" }))

        expect(await screen.findByRole("heading", { name: "Minhas Fichas" })).toBeInTheDocument()
        expect(screen.queryByText("A sessão Owlbear-aware não pôde ser inicializada. Reabra a action para tentar novamente.")).not.toBeInTheDocument()
        expect(fetch).toHaveBeenCalledTimes(1)
    })

    it("opens a confirmation modal before linking a player sheet", async () => {
        sdkMock.player.getRole.mockResolvedValue("PLAYER")
        clerkState.isSignedIn = true
        clerkState.userId = "user-1"
        sdkMock.room.getMetadata.mockResolvedValue({
            "com.dndicas.owlbear/room": {
                version: 1,
                playerLinks: {},
            },
        })
        useSheetListMock.mockReturnValue({
            sheets: [kaelSheet],
            search: "",
            handleSearch: vi.fn(),
            isLoading: false,
            isFetchingNextPage: false,
            hasNextPage: false,
            fetchNextPage: vi.fn(),
        })
        useSheetMock.mockImplementation((id: string | null) => ({
            data: id === "sheet-1" ? kaelSheet : null,
            isLoading: false,
            isFetching: false,
            isError: false,
            error: null,
        }))

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Ficha" })
        fireEvent.click(screen.getByRole("button", { name: "Ficha" }))
        expect(await screen.findByRole("heading", { name: "Minhas Fichas" })).toBeInTheDocument()
        await screen.findByText("Kael")
        clickSheetCard("Kael")

        expect(await screen.findByRole("heading", { name: "Vincular Ficha" })).toBeInTheDocument()
        expect(screen.getAllByTestId("glass-sheet-card").some((node) => node.getAttribute("data-interactive") === "false" && node.textContent?.includes("Kael"))).toBe(true)
        expect(sdkMock.room.setMetadata).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole("button", { name: "Vincular ficha" }))

        await waitFor(() => {
            expect(sdkMock.room.setMetadata).toHaveBeenCalledWith(expect.objectContaining({
                "com.dndicas.owlbear/room": expect.objectContaining({
                    playerLinks: expect.objectContaining({
                        "player-1": "sheet-1",
                    }),
                }),
            }))
        })
        expect(await screen.findByTestId("sheet-form")).toBeInTheDocument()
    })

    it("cancels player sheet linking without changing room metadata", async () => {
        sdkMock.player.getRole.mockResolvedValue("PLAYER")
        clerkState.isSignedIn = true
        clerkState.userId = "user-1"
        sdkMock.room.getMetadata.mockResolvedValue({
            "com.dndicas.owlbear/room": {
                version: 1,
                playerLinks: {},
            },
        })
        useSheetListMock.mockReturnValue({
            sheets: [kaelSheet],
            search: "",
            handleSearch: vi.fn(),
            isLoading: false,
            isFetchingNextPage: false,
            hasNextPage: false,
            fetchNextPage: vi.fn(),
        })

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Ficha" })
        fireEvent.click(screen.getByRole("button", { name: "Ficha" }))
        expect(await screen.findByRole("heading", { name: "Minhas Fichas" })).toBeInTheDocument()
        await screen.findByText("Kael")
        clickSheetCard("Kael")

        expect(await screen.findByRole("heading", { name: "Vincular Ficha" })).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))

        await waitFor(() => {
            expect(screen.queryByRole("heading", { name: "Vincular Ficha" })).not.toBeInTheDocument()
        })
        expect(sdkMock.room.setMetadata).not.toHaveBeenCalled()
    })

    it("renders the GM sheet form in desktop mode and refreshes the selected sheet from the live query", async () => {
        sdkMock.player.getRole.mockResolvedValue("GM")

        let liveSheet = { ...kaelSheet }
        useRoomLinkedSheetsMock.mockReturnValue({
            entries: [{ playerId: "player-1", sheetId: "sheet-1" }],
            sheets: [kaelSheet],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            unlinkSheet: vi.fn(),
        })
        useSheetMock.mockImplementation((id: string | null) => ({
            data: id === "sheet-1" ? liveSheet : null,
            isLoading: false,
            isFetching: false,
            isError: false,
            error: null,
        }))

        const { rerender } = render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Fichas" })
        fireEvent.click(screen.getByRole("button", { name: "Fichas" }))

        expect(await screen.findByTestId("sheet-form")).toHaveAttribute("data-layout-mode", "desktop")
        expect(screen.getByTestId("sheet-form")).toHaveAttribute("data-sheet-name", "Kael")
        expect(screen.getByTestId("gm-linked-sheets-strip")).toBeInTheDocument()
        expect(screen.getByTestId("gm-selected-sheet-panel")).toContainElement(screen.getByTestId("sheet-form"))
        expect(screen.getAllByTestId("glass-sheet-card").some((node) => node.textContent?.includes("Kael"))).toBe(true)

        liveSheet = {
            ...liveSheet,
            name: "Kael Atualizado",
        }

        rerender(<OwlbearShell />)

        await waitFor(() => {
            expect(screen.getByTestId("sheet-form")).toHaveAttribute("data-sheet-name", "Kael Atualizado")
            expect(screen.getAllByTestId("glass-sheet-card").some((node) => node.textContent?.includes("Kael Atualizado"))).toBe(true)
        })
    })

    it("renders rich class content in the GM unlink confirmation modal", async () => {
        sdkMock.player.getRole.mockResolvedValue("GM")

        const richClassSheet = {
            ...kaelSheet,
            class: "<span data-type=\"mention\" data-id=\"class-1\" data-label=\"Guerreiro\" data-entity-type=\"Classe\">Guerreiro</span>",
        }

        useRoomLinkedSheetsMock.mockReturnValue({
            entries: [{ playerId: "player-1", sheetId: "sheet-1" }],
            sheets: [richClassSheet],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            unlinkSheet: vi.fn(),
        })
        useSheetMock.mockImplementation((id: string | null) => ({
            data: id === "sheet-1" ? richClassSheet : null,
            isLoading: false,
            isFetching: false,
            isError: false,
            error: null,
        }))

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Fichas" })
        fireEvent.click(screen.getByRole("button", { name: "Fichas" }))

        const unlinkAction = await screen.findByRole("button", { name: /Desvincular Kael/i })
        fireEvent.click(unlinkAction)

        expect(await screen.findByRole("heading", { name: "Desvincular Ficha" })).toBeInTheDocument()
        expect(screen.getByText("Ficha a desvincular")).toBeInTheDocument()
        expect(screen.getByTestId("mention-content")).toHaveTextContent("Guerreiro")
        expect(screen.queryByText(/data-type="mention"/)).not.toBeInTheDocument()
    })

})
