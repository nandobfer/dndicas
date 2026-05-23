import * as React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OwlbearShell } from "@/features/owlbear/owlbear-shell"

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
    SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    UserButton: () => <div data-testid="user-button" />,
    useUser: () => ({
        user: null,
        isLoaded: true,
        isSignedIn: false,
    }),
    useAuth: () => ({
        signOut: vi.fn(),
        userId: null,
    }),
}))

describe("OwlbearShell", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        sdkMock.callbacks.length = 0
        sdkMock.isAvailable = true
        sdkMock.isReady = true
        sdkMock.room.id = "room-1"
        sdkMock.player.getId.mockResolvedValue("player-1")
        sdkMock.player.getRole.mockReset()
        sdkMock.scene.isReady.mockResolvedValue(true)
        sdkMock.theme.getTheme.mockResolvedValue({ mode: "DARK" as const })
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

        expect(await screen.findByRole("button", { name: "Ficha" })).toBeInTheDocument()
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
})
