import * as React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OwlbearShell } from "@/features/owlbear/owlbear-shell"

const useSheetListMock = vi.hoisted(() => vi.fn())
const useCreateSheetMock = vi.hoisted(() => vi.fn())
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

const sdkMock = vi.hoisted(() => {
    const callbacks: Array<() => void> = []
    return {
        callbacks,
        onReady: vi.fn((callback: () => void) => {
            callbacks.push(callback)
            return () => undefined
        }),
        action: {
            setWidth: vi.fn().mockResolvedValue(undefined),
            setHeight: vi.fn().mockResolvedValue(undefined),
        },
        player: {
            getId: vi.fn().mockResolvedValue("player-1"),
            getRole: vi.fn<() => Promise<"GM" | "PLAYER">>(),
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

vi.mock("@clerk/nextjs", () => ({
    SignIn: () => <div data-testid="clerk-sign-in">Clerk SignIn</div>,
    SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    UserButton: () => <div data-testid="user-button" />,
    useUser: () => ({
        user: null,
        isLoaded: clerkState.isLoaded,
        isSignedIn: clerkState.isSignedIn,
    }),
    useAuth: () => ({
        signOut: vi.fn(),
        userId: clerkState.userId,
    }),
}))

vi.mock("@/features/character-sheets/hooks/use-sheet-list", () => ({
    useSheetList: () => useSheetListMock(),
}))

vi.mock("@/features/character-sheets/api/character-sheets-queries", () => ({
    useCreateSheet: () => useCreateSheetMock(),
    useSheet: (id: string | null) => useSheetMock(id),
}))

vi.mock("@/features/owlbear/use-room-linked-sheets", () => ({
    useRoomLinkedSheets: () => useRoomLinkedSheetsMock(),
}))

vi.mock("@/features/character-sheets/hooks/use-character-sheet-realtime", () => ({
    useCharacterSheetRealtime: () => undefined,
}))

vi.mock("@/components/ui/glass-sheet-card", () => ({
    GlassSheetCard: ({
        sheet,
        onOpen,
        interactive = true,
        actionLabel,
    }: {
        sheet: { name: string }
        onOpen?: (sheet: { name: string }) => void
        interactive?: boolean
        actionLabel?: string
    }) => interactive ? (
        <button type="button" data-testid="glass-sheet-card" data-interactive="true" onClick={() => onOpen?.(sheet)}>
            {sheet.name}
            {actionLabel ? ` ${actionLabel}` : ""}
        </button>
    ) : (
        <div data-testid="glass-sheet-card" data-interactive="false">
            {sheet.name}
        </div>
    ),
}))

vi.mock("@/features/character-sheets/components/sheet-form", () => ({
    SheetForm: ({ sheet, layoutMode, navigateOnSlugChange }: { sheet: { name?: string }; layoutMode?: string; navigateOnSlugChange?: boolean }) => (
        <div data-testid="sheet-form" data-sheet-name={sheet.name ?? ""} data-layout-mode={layoutMode} data-navigate-on-slug-change={String(navigateOnSlugChange)}>
            Sheet Form Mock
        </div>
    ),
}))

describe("OwlbearShell", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useRealTimers()
        sdkMock.callbacks.length = 0
        sdkMock.isAvailable = true
        sdkMock.isReady = true
        sdkMock.room.id = "room-1"
        sdkMock.room.getMetadata.mockResolvedValue({})
        sdkMock.room.setMetadata.mockResolvedValue(undefined)
        sdkMock.room.onMetadataChange.mockReturnValue(() => undefined)
        sdkMock.player.getId.mockResolvedValue("player-1")
        sdkMock.player.getRole.mockReset()
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

    it("renders GM tabs and sizes the catalog popover on load", async () => {
        sdkMock.player.getRole.mockResolvedValue("GM")

        render(<OwlbearShell />)

        expect(await screen.findByRole("button", { name: "Fichas" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "NPCs" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Catálogo" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Ficha" })).not.toBeInTheDocument()
        expect(screen.getByTitle("Dndicas Dashboard")).toHaveAttribute("src", "/")
        expect(screen.queryByText("Dashboard completo do Dndicas")).not.toBeInTheDocument()
        expect(screen.queryByText("Abrir fora")).not.toBeInTheDocument()

        await waitFor(() => {
            expect(sdkMock.action.setWidth).toHaveBeenCalledWith(1320)
            expect(sdkMock.action.setHeight).toHaveBeenCalledWith(900)
        })

        expect(screen.getByTitle("Dndicas Dashboard")).not.toHaveAttribute("scrolling", "no")
    })

    it("renders PLAYER tabs and keeps catalog as the initial tab", async () => {
        sdkMock.player.getRole.mockResolvedValue("PLAYER")

        render(<OwlbearShell />)

        expect(await screen.findByRole("button", { name: "Catálogo" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Ficha" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Catálogo" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Fichas" })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "NPCs" })).not.toBeInTheDocument()
        expect(screen.getByTitle("Dndicas Dashboard")).toBeInTheDocument()
    })

    it("changes popover size when switching tabs", async () => {
        sdkMock.player.getRole.mockResolvedValue("GM")

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Fichas" })
        fireEvent.click(screen.getByRole("button", { name: "Fichas" }))

        await waitFor(() => {
            expect(sdkMock.action.setWidth).toHaveBeenCalledWith(1180)
            expect(sdkMock.action.setHeight).toHaveBeenCalledWith(900)
        })
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
            expect(fetch).toHaveBeenCalledTimes(1)
        })

        expect(screen.queryByTestId("clerk-sign-in")).not.toBeInTheDocument()
        expect(screen.queryByText("A sessão Owlbear-aware não pôde ser inicializada. Reabra a action para tentar novamente.")).not.toBeInTheDocument()
    })

    it("renders a technical banner only when the SDK is truly unavailable", async () => {
        sdkMock.isAvailable = false

        render(<OwlbearShell />)

        expect(await screen.findByText("SDK Owlbear indisponível nesta action.")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Catálogo" })).toBeInTheDocument()
        expect(screen.getByTitle("Dndicas Dashboard")).toBeInTheDocument()
        expect(sdkMock.action.setWidth).not.toHaveBeenCalled()
        expect(sdkMock.action.setHeight).not.toHaveBeenCalled()
    })

    it("waits for OBR.onReady before leaving booting state", async () => {
        sdkMock.isReady = false
        sdkMock.player.getRole.mockResolvedValue("GM")

        render(<OwlbearShell />)

        expect(screen.queryByText("SDK Owlbear indisponível nesta action.")).not.toBeInTheDocument()

        await waitFor(() => {
            expect(sdkMock.onReady).toHaveBeenCalled()
        })
    })

    it("shows the shared my-sheets picker and uses picker sizing when no room link exists", async () => {
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

        await waitFor(() => {
            expect(sdkMock.action.setWidth).toHaveBeenCalledWith(980)
            expect(sdkMock.action.setHeight).toHaveBeenCalledWith(820)
        })
    })

    it("shows the my-sheets login view instead of a technical session error when the player is anonymous", async () => {
        sdkMock.player.getRole.mockResolvedValue("PLAYER")

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Ficha" })
        fireEvent.click(screen.getByRole("button", { name: "Ficha" }))

        expect(await screen.findByTestId("clerk-sign-in")).toBeInTheDocument()
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

})
