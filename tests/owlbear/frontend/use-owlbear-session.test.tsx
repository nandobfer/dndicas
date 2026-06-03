import * as React from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useOwlbearSession } from "@/features/owlbear/use-owlbear-session"
import type { OwlbearRuntimeState } from "@/features/owlbear/types"

const authState = vi.hoisted(() => ({
    isLoaded: true,
    isSignedIn: false,
}))

const openOwlbearBackendSessionMock = vi.hoisted(() => vi.fn())

vi.mock("@/core/hooks/useAuth", () => ({
    useAuth: () => ({
        isLoaded: authState.isLoaded,
        isSignedIn: authState.isSignedIn,
    }),
}))

vi.mock("@/features/owlbear/sdk", () => ({
    openOwlbearBackendSession: (...args: unknown[]) => openOwlbearBackendSessionMock(...args),
}))

const gmRuntime: OwlbearRuntimeState = {
    status: "ready",
    role: "GM",
    roomId: "room-1",
    playerId: "player-1",
    themeMode: "dark",
    sceneReady: true,
}

const playerRuntime: OwlbearRuntimeState = {
    ...gmRuntime,
    role: "PLAYER",
}

describe("useOwlbearSession", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        authState.isLoaded = true
        authState.isSignedIn = false
        openOwlbearBackendSessionMock
            .mockResolvedValueOnce({ token: "token-anon", expiresAt: "2099-01-01T00:00:00.000Z" })
            .mockResolvedValueOnce({ token: "token-auth", expiresAt: "2099-01-01T00:00:00.000Z" })
    })

    it("reopens a GM Owlbear session when Clerk changes from anonymous to authenticated", async () => {
        const { result, rerender } = renderHook(() => useOwlbearSession(gmRuntime))

        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-anon"))

        authState.isSignedIn = true
        rerender()

        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-auth"))
        expect(openOwlbearBackendSessionMock).toHaveBeenCalledTimes(2)
        expect(openOwlbearBackendSessionMock).toHaveBeenLastCalledWith({
            roomId: "room-1",
            owlbearPlayerId: "player-1",
            owlbearRole: "GM",
        })
    })

    it("keeps PLAYER sessions idle while anonymous and opens after login", async () => {
        const { result, rerender } = renderHook(() => useOwlbearSession(playerRuntime))

        expect(result.current.session.sessionStatus).toBe("idle")
        expect(openOwlbearBackendSessionMock).not.toHaveBeenCalled()

        authState.isSignedIn = true
        rerender()

        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-anon"))
        expect(openOwlbearBackendSessionMock).toHaveBeenCalledTimes(1)
    })
})
