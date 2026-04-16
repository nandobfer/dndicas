import Pusher from "pusher-js"
import { vi } from "vitest"
import type { PusherBrowserConfig } from "@/core/realtime/pusher-config"
import { PusherBrowserService } from "@/core/realtime/pusher-browser-service"

const pusherMocks = vi.hoisted(() => {
    const mockBind = vi.fn()
    const mockSubscribe = vi.fn()
    const mockUnsubscribe = vi.fn()
    const mockDisconnect = vi.fn()
    const constructor = vi.fn(function () {
        return {
            connection: {
                bind: mockBind,
            },
            subscribe: mockSubscribe,
            unsubscribe: mockUnsubscribe,
            disconnect: mockDisconnect,
        }
    })

    return {
        mockBind,
        mockSubscribe,
        mockUnsubscribe,
        mockDisconnect,
        constructor,
    }
})

vi.mock("pusher-js", () => ({
    __esModule: true,
    default: pusherMocks.constructor,
}))

describe("PusherBrowserService", () => {
    const MockPusher = vi.mocked(Pusher)
    const config: PusherBrowserConfig = {
        key: "app-key",
        wsHost: "ws.example.com",
        wsPort: 6001,
        wssPort: 6001,
        forceTLS: true,
        enabledTransports: ["ws"],
        cluster: "mt1",
    }

    beforeEach(() => {
        PusherBrowserService.getInstance().disconnect()
        vi.clearAllMocks()
    })

    it("creates a shared client using the runtime config", () => {
        const service = PusherBrowserService.getInstance()

        const firstClient = service.getClient(config)
        const secondClient = service.getClient(config)

        expect(firstClient).toBe(secondClient)
        expect(MockPusher).toHaveBeenCalledTimes(1)
        expect(MockPusher).toHaveBeenCalledWith("app-key", {
            cluster: "mt1",
            wsHost: "ws.example.com",
            wsPort: 6001,
            wssPort: 6001,
            forceTLS: true,
            enabledTransports: ["ws"],
            disableStats: true,
        })
    })

    it("recreates the client when the runtime config changes", () => {
        const service = PusherBrowserService.getInstance()

        service.getClient(config)
        service.getClient({ ...config, wsHost: "other.example.com" })

        expect(MockPusher).toHaveBeenCalledTimes(2)
        expect(pusherMocks.mockDisconnect).toHaveBeenCalledTimes(1)
    })

    it("registers connection diagnostics for the created client", () => {
        const service = PusherBrowserService.getInstance()

        service.getClient(config)

        expect(pusherMocks.mockBind).toHaveBeenCalledWith("connecting", expect.any(Function))
        expect(pusherMocks.mockBind).toHaveBeenCalledWith("state_change", expect.any(Function))
        expect(pusherMocks.mockBind).toHaveBeenCalledWith("connected", expect.any(Function))
        expect(pusherMocks.mockBind).toHaveBeenCalledWith("disconnected", expect.any(Function))
        expect(pusherMocks.mockBind).toHaveBeenCalledWith("error", expect.any(Function))
        expect(pusherMocks.mockBind).toHaveBeenCalledWith("unavailable", expect.any(Function))
        expect(pusherMocks.mockBind).toHaveBeenCalledWith("failed", expect.any(Function))
    })

    it("subscribes through the shared client", () => {
        const service = PusherBrowserService.getInstance()
        const mockChannel = { name: "sheet.123" }
        pusherMocks.mockSubscribe.mockReturnValue(mockChannel)

        const channel = service.subscribe(config, "sheet.123")

        expect(channel).toBe(mockChannel)
        expect(pusherMocks.mockSubscribe).toHaveBeenCalledWith("sheet.123")
    })
})
