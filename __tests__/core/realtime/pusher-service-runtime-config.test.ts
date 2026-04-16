const mockTrigger = jest.fn()

jest.mock("pusher", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        trigger: mockTrigger,
    })),
}))

describe("PusherService runtime client config", () => {
    const originalEnv = process.env
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})

    beforeEach(() => {
        jest.resetModules()
        mockTrigger.mockReset()
        process.env = { ...originalEnv }
        delete process.env.PUSHER_PUBLIC_HOST
        delete process.env.PUSHER_PUBLIC_SCHEME
        delete process.env.PUSHER_PUBLIC_PORT
        delete process.env.PUSHER_PUBLIC_APP_KEY
        delete process.env.PUSHER_PUBLIC_CLUSTER
        delete process.env.NEXT_PUBLIC_PUSHER_HOST
        delete process.env.NEXT_PUBLIC_PUSHER_SCHEME
        delete process.env.NEXT_PUBLIC_PUSHER_PORT
        delete process.env.NEXT_PUBLIC_PUSHER_APP_KEY
        delete process.env.NEXT_PUBLIC_PUSHER_CLUSTER
        warnSpy.mockClear()
    })

    afterAll(() => {
        warnSpy.mockRestore()
        process.env = originalEnv
    })

    it("returns the public browser endpoint instead of the internal soketi host", async () => {
        process.env.PUSHER_APP_ID = "app-id"
        process.env.PUSHER_APP_KEY = "internal-key"
        process.env.PUSHER_APP_SECRET = "secret"
        process.env.PUSHER_HOST = "soketi"
        process.env.PUSHER_PORT = "6001"
        process.env.PUSHER_SCHEME = "http"
        process.env.PUSHER_CLUSTER = "mt1"
        process.env.PUSHER_PUBLIC_HOST = "pusher.nandoburgos.dev"
        process.env.PUSHER_PUBLIC_SCHEME = "https"

        const { PusherService } = await import("@/core/realtime/pusher-service")

        expect(PusherService.getInstance().getClientConfig()).toEqual({
            key: "internal-key",
            wsHost: "pusher.nandoburgos.dev",
            wsPort: 443,
            wssPort: 443,
            forceTLS: true,
            enabledTransports: ["ws"],
            cluster: "mt1",
        })
    })

    it("allows overriding the public key, cluster and port when needed", async () => {
        process.env.PUSHER_APP_ID = "app-id"
        process.env.PUSHER_APP_KEY = "internal-key"
        process.env.PUSHER_APP_SECRET = "secret"
        process.env.PUSHER_HOST = "soketi"
        process.env.PUSHER_PORT = "6001"
        process.env.PUSHER_SCHEME = "http"
        process.env.PUSHER_CLUSTER = "mt1"
        process.env.PUSHER_PUBLIC_HOST = "pusher.nandoburgos.dev"
        process.env.PUSHER_PUBLIC_SCHEME = "https"
        process.env.PUSHER_PUBLIC_PORT = "8443"
        process.env.PUSHER_PUBLIC_APP_KEY = "public-key"
        process.env.PUSHER_PUBLIC_CLUSTER = "eu"

        const { PusherService } = await import("@/core/realtime/pusher-service")

        expect(PusherService.getInstance().getClientConfig()).toEqual({
            key: "public-key",
            wsHost: "pusher.nandoburgos.dev",
            wsPort: 8443,
            wssPort: 8443,
            forceTLS: true,
            enabledTransports: ["ws"],
            cluster: "eu",
        })
    })

    it("falls back to the hardcoded public endpoint when public host envs are missing", async () => {
        process.env.PUSHER_APP_ID = "app-id"
        process.env.PUSHER_APP_KEY = "internal-key"
        process.env.PUSHER_APP_SECRET = "secret"
        process.env.PUSHER_HOST = "soketi"
        process.env.PUSHER_PORT = "6001"
        process.env.PUSHER_SCHEME = "http"
        process.env.PUSHER_CLUSTER = "mt1"

        const { PusherService } = await import("@/core/realtime/pusher-service")

        expect(PusherService.getInstance().getClientConfig()).toEqual({
            key: "internal-key",
            wsHost: "pusher.nandoburgos.dev",
            wsPort: 443,
            wssPort: 443,
            forceTLS: true,
            enabledTransports: ["ws"],
            cluster: "mt1",
        })
        expect(warnSpy).toHaveBeenCalledWith("[realtime] Using default public Pusher host fallback.", {
            host: "pusher.nandoburgos.dev",
            scheme: "https",
            port: 443,
        })
    })

    it("uses NEXT_PUBLIC realtime vars as fallback before the hardcoded endpoint", async () => {
        process.env.PUSHER_APP_ID = "app-id"
        process.env.PUSHER_APP_KEY = "internal-key"
        process.env.PUSHER_APP_SECRET = "secret"
        process.env.PUSHER_HOST = "soketi"
        process.env.PUSHER_PORT = "6001"
        process.env.PUSHER_SCHEME = "http"
        process.env.PUSHER_CLUSTER = "mt1"
        process.env.NEXT_PUBLIC_PUSHER_HOST = "legacy-pusher.example.com"
        process.env.NEXT_PUBLIC_PUSHER_SCHEME = "https"
        process.env.NEXT_PUBLIC_PUSHER_PORT = "6002"
        process.env.NEXT_PUBLIC_PUSHER_APP_KEY = "legacy-public-key"
        process.env.NEXT_PUBLIC_PUSHER_CLUSTER = "legacy-cluster"

        const { PusherService } = await import("@/core/realtime/pusher-service")

        expect(PusherService.getInstance().getClientConfig()).toEqual({
            key: "legacy-public-key",
            wsHost: "legacy-pusher.example.com",
            wsPort: 6002,
            wssPort: 6002,
            forceTLS: true,
            enabledTransports: ["ws"],
            cluster: "legacy-cluster",
        })
        expect(warnSpy).not.toHaveBeenCalled()
    })
})
