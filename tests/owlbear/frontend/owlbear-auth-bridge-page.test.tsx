import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OwlbearAuthBridgePage } from "@/features/owlbear/owlbear-auth-bridge-page"

const authState = vi.hoisted(() => ({
    isLoaded: true,
    isSignedIn: true,
}))
const searchParamsMock = vi.hoisted(() => new URLSearchParams("channelId=channel-1&nonce=nonce-123"))
const getPusherBrowserConfigMock = vi.hoisted(() => vi.fn())
const subscribeMock = vi.hoisted(() => vi.fn())
const unsubscribeMock = vi.hoisted(() => vi.fn())
const pusherChannelMock = vi.hoisted(() => ({
    bind: vi.fn(),
    unbind: vi.fn(),
}))

vi.mock("next/navigation", () => ({
    useSearchParams: () => searchParamsMock,
}))

vi.mock("@/core/hooks/useAuth", () => ({
    useAuth: () => ({
        isLoaded: authState.isLoaded,
        isSignedIn: authState.isSignedIn,
    }),
}))

vi.mock("@/features/auth/auth-components", () => ({
    SignIn: () => <div data-testid="sign-in" />,
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

describe("OwlbearAuthBridgePage", () => {
    beforeEach(() => {
        vi.useRealTimers()
        vi.clearAllMocks()
        authState.isLoaded = true
        authState.isSignedIn = true
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
        global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
    })

    it("shows the final close-tab message after publishing the login handoff", async () => {
        render(<OwlbearAuthBridgePage />)

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/owlbear/auth/pusher-handoff", expect.objectContaining({ method: "POST" })))

        expect(await screen.findByText("Pronto!")).toBeInTheDocument()
        expect(screen.getByText("Sua conta foi conectada ao Owlbear. Pode fechar esta aba.")).toBeInTheDocument()
    })

    it("keeps the success message if the action confirmation arrives later", async () => {
        render(<OwlbearAuthBridgePage />)

        expect(await screen.findByText("Pronto!")).toBeInTheDocument()
        await waitFor(() => expect(pusherChannelMock.bind).toHaveBeenCalledWith("owlbear-auth-completed", expect.any(Function)))

        const handler = pusherChannelMock.bind.mock.calls[0][1] as (payload: { nonce: string; ok: boolean }) => void
        act(() => {
            handler({ nonce: "nonce-123", ok: true })
        })

        expect(screen.getByText("Pronto!")).toBeInTheDocument()
        expect(screen.getByText("Sua conta foi conectada ao Owlbear. Pode fechar esta aba.")).toBeInTheDocument()
    })
})
