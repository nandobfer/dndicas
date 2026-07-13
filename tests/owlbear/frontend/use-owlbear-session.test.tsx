import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useOwlbearSession } from "@/features/owlbear/use-owlbear-session"
import type { OwlbearRuntimeState } from "@/features/owlbear/types"

const authState = vi.hoisted(() => ({
    isLoaded: true,
    isSignedIn: false,
    userId: null as string | null,
}))

const openOwlbearBackendSessionMock = vi.hoisted(() => vi.fn())
const getPusherBrowserConfigMock = vi.hoisted(() => vi.fn())
const subscribeMock = vi.hoisted(() => vi.fn())
const unsubscribeMock = vi.hoisted(() => vi.fn())
const pusherChannelMock = vi.hoisted(() => ({
    bind: vi.fn(),
    unbind: vi.fn(),
}))

vi.mock("@/core/hooks/useAuth", () => ({
    useAuth: () => ({
        isLoaded: authState.isLoaded,
        isSignedIn: authState.isSignedIn,
        userId: authState.userId,
    }),
}))

vi.mock("@/features/owlbear/sdk", () => ({
    openOwlbearBackendSession: (...args: unknown[]) => openOwlbearBackendSessionMock(...args),
}))

vi.mock("@/core/realtime/pusher-browser-config", () => ({
    getPusherBrowserConfig: () => getPusherBrowserConfigMock(),
}))

vi.mock("@/core/realtime/pusher-browser-service", () => ({
    PusherBrowserService: {
        getInstance: () => ({
            subscribe: (...args: unknown[]) => subscribeMock(...args),
            unsubscribe: (...args: unknown[]) => unsubscribeMock(...args),
        }),
    },
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
        authState.userId = null
        getPusherBrowserConfigMock.mockResolvedValue({
            key: "key",
            cluster: "mt1",
            wsHost: "localhost",
            wsPort: 6001,
            wssPort: 6001,
            forceTLS: false,
            enabledTransports: ["ws"],
        })
        subscribeMock.mockReturnValue(pusherChannelMock)
        unsubscribeMock.mockReset()
        pusherChannelMock.bind.mockReset()
        pusherChannelMock.unbind.mockReset()
        openOwlbearBackendSessionMock
            .mockResolvedValueOnce({ token: "token-anon", expiresAt: "2099-01-01T00:00:00.000Z", isAuthenticated: false })
            .mockResolvedValueOnce({ token: "token-auth", expiresAt: "2099-01-01T00:00:00.000Z", isAuthenticated: true })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("reopens a GM Owlbear session when Clerk changes from anonymous to authenticated", async () => {
        const { result, rerender } = renderHook(() => useOwlbearSession(gmRuntime))

        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-anon"))

        authState.isSignedIn = true
        authState.userId = "user-1"
        rerender()

        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-auth"))
        expect(openOwlbearBackendSessionMock).toHaveBeenCalledTimes(2)
        expect(openOwlbearBackendSessionMock).toHaveBeenLastCalledWith({
            roomId: "room-1",
            owlbearPlayerId: "player-1",
            owlbearRole: "GM",
        })
    })

    it("opens a synthetic PLAYER session while anonymous and refreshes after login", async () => {
        openOwlbearBackendSessionMock
            .mockReset()
            .mockResolvedValueOnce({ token: "token-player-anon", expiresAt: "2099-01-01T00:00:00.000Z", isAuthenticated: false })
            .mockResolvedValueOnce({ token: "token-player-auth", expiresAt: "2099-01-01T00:00:00.000Z", isAuthenticated: true })

        const { result, rerender } = renderHook(() => useOwlbearSession(playerRuntime))

        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-player-anon"))

        authState.isSignedIn = true
        authState.userId = "user-1"
        rerender()

        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-player-auth"))
        expect(openOwlbearBackendSessionMock).toHaveBeenCalledTimes(2)
    })

    it("waits for authenticated userId before refreshing an authenticated PLAYER session", async () => {
        openOwlbearBackendSessionMock
            .mockReset()
            .mockResolvedValue({ token: "token-player", expiresAt: "2099-01-01T00:00:00.000Z", isAuthenticated: true })
        authState.isSignedIn = true
        authState.userId = null

        const { result, rerender } = renderHook(() => useOwlbearSession(playerRuntime))

        expect(result.current.session.sessionStatus).toBe("idle")
        expect(openOwlbearBackendSessionMock).not.toHaveBeenCalled()

        authState.userId = "user-1"
        rerender()

        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-player"))
        expect(openOwlbearBackendSessionMock).toHaveBeenCalledTimes(1)
    })

    it("retries a transient 401 after login until the backend Clerk session is ready", async () => {
        const unauthorized = new Error("Não autorizado") as Error & { status?: number }
        unauthorized.status = 401
        openOwlbearBackendSessionMock
            .mockReset()
            .mockRejectedValueOnce(unauthorized)
            .mockResolvedValueOnce({ token: "token-player", expiresAt: "2099-01-01T00:00:00.000Z", isAuthenticated: true })
        authState.isSignedIn = true
        authState.userId = "user-1"

        const { result } = renderHook(() => useOwlbearSession(playerRuntime))

        await waitFor(() => expect(result.current.session.sessionStatus).toBe("loading"))
        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-player"), { timeout: 1500 })
        expect(openOwlbearBackendSessionMock).toHaveBeenCalledTimes(2)
    })

    it("sets error when retryable session failures are exhausted", async () => {
        vi.useFakeTimers()
        openOwlbearBackendSessionMock
            .mockReset()
            .mockRejectedValue(new Error("Network error"))
        authState.isSignedIn = true
        authState.userId = "user-1"

        const { result } = renderHook(() => useOwlbearSession(playerRuntime))

        await act(async () => {
            await vi.runAllTimersAsync()
        })

        expect(result.current.session.sessionStatus).toBe("error")
        expect(openOwlbearBackendSessionMock).toHaveBeenCalledTimes(8)
    })

    it("refreshes the Owlbear backend session before it expires", async () => {
        const expiringSoon = new Date(Date.now() + 30_000).toISOString()
        openOwlbearBackendSessionMock
            .mockReset()
            .mockResolvedValueOnce({ token: "token-expiring", expiresAt: expiringSoon, isAuthenticated: true })
            .mockResolvedValueOnce({ token: "token-refreshed", expiresAt: "2099-01-01T00:00:00.000Z", isAuthenticated: true })
        authState.isSignedIn = true
        authState.userId = "user-1"

        const { result } = renderHook(() => useOwlbearSession(playerRuntime))

        await waitFor(() => expect(openOwlbearBackendSessionMock).toHaveBeenCalledTimes(2))
        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-refreshed"))
    })

    it("uses a Pusher handoff token as an authenticated session inside the iframe", async () => {
        openOwlbearBackendSessionMock.mockReset().mockImplementation((input: { handoffToken?: string }) => Promise.resolve({
            token: input.handoffToken ? "token-handoff" : "token-anon",
            expiresAt: "2099-01-01T00:00:00.000Z",
            isAuthenticated: Boolean(input.handoffToken),
        }))

        const { result } = renderHook(() => useOwlbearSession(playerRuntime))

        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-anon"))
        await waitFor(() => expect(pusherChannelMock.bind).toHaveBeenCalledWith("owlbear-auth-ready", expect.any(Function)))

        const handler = pusherChannelMock.bind.mock.calls[0][1] as (payload: { handoffToken: string; nonce: string }) => void
        const nonce = new URL(result.current.authBridgeUrl, "http://localhost").searchParams.get("nonce")
        act(() => {
            handler({ handoffToken: "handoff-token-1", nonce: nonce ?? "" })
        })

        await waitFor(() => expect(result.current.session.sessionToken).toBe("token-handoff"))
        expect(result.current.isAuthenticated).toBe(true)
        expect(openOwlbearBackendSessionMock).toHaveBeenLastCalledWith({
            roomId: "room-1",
            owlbearPlayerId: "player-1",
            owlbearRole: "PLAYER",
            handoffToken: "handoff-token-1",
        })
    })
})
