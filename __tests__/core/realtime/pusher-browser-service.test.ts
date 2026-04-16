import Pusher from "pusher-js"
import type { PusherBrowserConfig } from "@/core/realtime/pusher-config"
import { PusherBrowserService } from "@/core/realtime/pusher-browser-service"

const mockBind = jest.fn()
const mockSubscribe = jest.fn()
const mockUnsubscribe = jest.fn()
const mockDisconnect = jest.fn()

jest.mock("pusher-js", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        connection: {
            bind: mockBind,
        },
        subscribe: mockSubscribe,
        unsubscribe: mockUnsubscribe,
        disconnect: mockDisconnect,
    })),
}))

describe("PusherBrowserService", () => {
    const MockPusher = Pusher as unknown as jest.Mock
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
        jest.clearAllMocks()
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
        expect(mockDisconnect).toHaveBeenCalledTimes(1)
    })

    it("registers connection diagnostics for the created client", () => {
        const service = PusherBrowserService.getInstance()

        service.getClient(config)

        expect(mockBind).toHaveBeenCalledWith("connecting", expect.any(Function))
        expect(mockBind).toHaveBeenCalledWith("state_change", expect.any(Function))
        expect(mockBind).toHaveBeenCalledWith("connected", expect.any(Function))
        expect(mockBind).toHaveBeenCalledWith("disconnected", expect.any(Function))
        expect(mockBind).toHaveBeenCalledWith("error", expect.any(Function))
        expect(mockBind).toHaveBeenCalledWith("unavailable", expect.any(Function))
        expect(mockBind).toHaveBeenCalledWith("failed", expect.any(Function))
    })

    it("subscribes through the shared client", () => {
        const service = PusherBrowserService.getInstance()
        const mockChannel = { name: "sheet.123" }
        mockSubscribe.mockReturnValue(mockChannel)

        const channel = service.subscribe(config, "sheet.123")

        expect(channel).toBe(mockChannel)
        expect(mockSubscribe).toHaveBeenCalledWith("sheet.123")
    })
})
