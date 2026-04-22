import * as React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OwlbearShell } from "@/features/owlbear/owlbear-shell"

const useSheetListMock = vi.hoisted(() => vi.fn())
const useCreateSheetMock = vi.hoisted(() => vi.fn())
const useSheetMock = vi.hoisted(() => vi.fn())
const clerkState = vi.hoisted(() => ({
    isLoaded: true,
    isSignedIn: false,
    userId: null as string | null,
}))

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
        scene: {
            isReady: vi.fn().mockResolvedValue(true),
            onReadyChange: vi.fn(() => () => undefined),
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

vi.mock("@/features/character-sheets/components/sheet-form", () => ({
    SheetForm: ({ layoutMode, navigateOnSlugChange }: { layoutMode?: string; navigateOnSlugChange?: boolean }) => (
        <div data-testid="sheet-form" data-layout-mode={layoutMode} data-navigate-on-slug-change={String(navigateOnSlugChange)}>
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
            expect(sdkMock.action.setWidth).toHaveBeenCalledWith(920)
            expect(sdkMock.action.setHeight).toHaveBeenCalledWith(760)
        })

        expect(screen.getByText("Fichas do mestre")).toBeInTheDocument()
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
            sheets: [{ _id: "sheet-1", name: "Kael", level: 2, computedArmorClass: 14, class: "Guerreiro", subclass: "", race: "Humano", origin: "", slug: "kael", userId: "user-1" }],
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

    it("shows a temporary success notice after linking and keeps the editor visible during background fetching", async () => {
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
        useSheetListMock.mockReturnValue({
            sheets: [{ _id: "sheet-1", name: "Kael", level: 2, computedArmorClass: 14, class: "Guerreiro", subclass: "", race: "Humano", origin: "", slug: "kael", userId: "user-1" }],
            search: "",
            handleSearch: vi.fn(),
            isLoading: false,
            isFetchingNextPage: false,
            hasNextPage: false,
            fetchNextPage: vi.fn(),
        })

        const useSheetState = {
            data: { _id: "sheet-1", slug: "kael", userId: "user-1", name: "Kael" },
            isLoading: false,
            isFetching: true,
            isError: false,
            error: null,
        }
        useSheetMock.mockImplementation(() => useSheetState)

        render(<OwlbearShell />)

        await screen.findByRole("button", { name: "Ficha" })
        fireEvent.click(screen.getByRole("button", { name: "Ficha" }))

        await screen.findByRole("heading", { name: "Minhas Fichas" })
        fireEvent.click(screen.getByText("Kael"))
        fireEvent.click(await screen.findByRole("button", { name: "Vincular ficha" }))

        expect(await screen.findByTestId("sheet-form")).toBeInTheDocument()
        expect(screen.queryByText("Esta ficha está vinculada a esta sala do Owlbear.")).not.toBeInTheDocument()
        expect(await screen.findByText("Ficha vinculada a esta sala do Owlbear.")).toBeInTheDocument()

        await waitFor(() => {
            expect(screen.queryByText("Ficha vinculada a esta sala do Owlbear.")).not.toBeInTheDocument()
        }, { timeout: 3500 })
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
        useSheetListMock.mockReturnValue({
            sheets: [{ _id: "sheet-1", name: "Kael", level: 2, computedArmorClass: 14, class: "Guerreiro", subclass: "", race: "Humano", origin: "", slug: "kael", userId: "user-1" }],
            search: "",
            handleSearch: vi.fn(),
            isLoading: false,
            isFetchingNextPage: false,
            hasNextPage: false,
            fetchNextPage: vi.fn(),
        })
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

        await screen.findByRole("heading", { name: "Minhas Fichas" })
        fireEvent.click(screen.getByText("Kael"))
        fireEvent.click(await screen.findByRole("button", { name: "Vincular ficha" }))

        expect(await screen.findByTestId("sheet-form")).toBeInTheDocument()

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledTimes(1)
        })

        fireEvent.click(screen.getByRole("button", { name: "Catálogo" }))
        fireEvent.click(screen.getByRole("button", { name: "Ficha" }))

        expect(await screen.findByTestId("sheet-form")).toBeInTheDocument()
        expect(screen.queryByText("A sessão Owlbear-aware não pôde ser inicializada. Reabra a action para tentar novamente.")).not.toBeInTheDocument()
        expect(fetch).toHaveBeenCalledTimes(1)
    })

})
