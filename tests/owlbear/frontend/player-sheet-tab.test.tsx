import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OwlbearPlayerSheetTab } from "@/features/owlbear/player-sheet-tab"
import type { OwlbearRuntimeState, OwlbearSessionState } from "@/features/owlbear/types"

const getRoomMetadataStateMock = vi.hoisted(() => vi.fn())
const subscribeToRoomMetadataMock = vi.hoisted(() => vi.fn())
const mySheetsContentMock = vi.hoisted(() => vi.fn())
const sheetFormMock = vi.hoisted(() => vi.fn())
const useSheetMock = vi.hoisted(() => vi.fn())

vi.mock("@/features/owlbear/sdk", () => ({
    clearPlayerSheetLink: vi.fn(),
    getRoomMetadataState: (...args: unknown[]) => getRoomMetadataStateMock(...args),
    setPlayerSheetLink: vi.fn(),
    subscribeToRoomMetadata: (...args: unknown[]) => subscribeToRoomMetadataMock(...args),
}))

vi.mock("@/features/character-sheets/api/character-sheets-queries", () => ({
    useSheet: (...args: unknown[]) => useSheetMock(...args),
}))

vi.mock("@/features/character-sheets/api/character-sheet-client-config", () => ({
    CharacterSheetClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/features/character-sheets/components/sheet-form", () => ({
    SheetForm: (props: Record<string, unknown>) => {
        sheetFormMock(props)
        return <div data-testid="sheet-form" />
    },
}))

vi.mock("@/app/(dashboard)/my-sheets/_components/my-sheets-content", () => ({
    MySheetsContent: (props: { authState?: { isLoaded: boolean; isSignedIn: boolean } }) => {
        mySheetsContentMock(props)
        return <div data-testid="my-sheets-content" />
    },
}))

vi.mock("@/features/owlbear/owlbear-sign-in-prompt", () => ({
    OwlbearSignInPrompt: ({ description }: { description: string }) => <div data-testid="owlbear-sign-in-prompt">{description}</div>,
}))

const runtime: OwlbearRuntimeState = {
    status: "ready",
    role: "PLAYER",
    roomId: "room-1",
    playerId: "player-1",
    themeMode: "dark",
    sceneReady: true,
}

const session: OwlbearSessionState = {
    sessionStatus: "ready",
    sessionToken: "token-1",
    sessionExpiresAt: "2099-01-01T00:00:00.000Z",
    isAuthenticated: true,
}

describe("OwlbearPlayerSheetTab", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getRoomMetadataStateMock.mockResolvedValue({ playerLinks: {} })
        subscribeToRoomMetadataMock.mockResolvedValue(vi.fn())
        useSheetMock.mockReturnValue({ isLoading: false, isError: false, data: null })
    })

    it("passes Owlbear auth state to the shared sheet picker inside the iframe", async () => {
        render(
            <OwlbearPlayerSheetTab
                runtime={runtime}
                session={session}
                isAuthenticated
                isAuthLoaded
            />
        )

        expect(await screen.findByTestId("my-sheets-content")).toBeInTheDocument()
        await waitFor(() => expect(mySheetsContentMock).toHaveBeenCalled())
        expect(mySheetsContentMock).toHaveBeenLastCalledWith(expect.objectContaining({
            authState: {
                isLoaded: true,
                isSignedIn: true,
            },
        }))
    })

    it("still shows the Owlbear login prompt before the handoff authenticates", () => {
        render(
            <OwlbearPlayerSheetTab
                runtime={runtime}
                session={{ ...session, isAuthenticated: false }}
                isAuthenticated={false}
                isAuthLoaded
            />
        )

        expect(screen.getByTestId("owlbear-sign-in-prompt")).toBeInTheDocument()
        expect(mySheetsContentMock).not.toHaveBeenCalled()
    })

    it("opens the linked player sheet as editable inside the Owlbear iframe", async () => {
        getRoomMetadataStateMock.mockResolvedValue({ playerLinks: { "player-1": "sheet-1" } })
        useSheetMock.mockReturnValue({
            isLoading: false,
            isError: false,
            data: { _id: "sheet-1", userId: "user-1", slug: "hero" },
        })

        render(
            <OwlbearPlayerSheetTab
                runtime={runtime}
                session={session}
                isAuthenticated
                isAuthLoaded
            />
        )

        expect(await screen.findByTestId("sheet-form")).toBeInTheDocument()
        expect(sheetFormMock).toHaveBeenLastCalledWith(expect.objectContaining({
            editMode: "editable",
            runtimeContext: "owlbear",
        }))
    })
})
