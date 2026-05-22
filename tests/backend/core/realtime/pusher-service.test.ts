import { buildPusherBrowserConfig } from "../../../../src/core/realtime/pusher-service"
import type { PusherPublicConfig } from "../../../../src/core/realtime/pusher-config"

describe("buildPusherBrowserConfig", () => {
    const baseConfig: PusherPublicConfig = {
        key: "app-key",
        host: "ws.example.com",
        port: 6001,
        scheme: "http",
        cluster: "mt1",
    }

    it("uses ws when the server scheme is http", () => {
        expect(buildPusherBrowserConfig(baseConfig)).toEqual({
            key: "app-key",
            wsHost: "ws.example.com",
            wsPort: 6001,
            wssPort: 6001,
            forceTLS: false,
            enabledTransports: ["ws"],
            cluster: "mt1",
        })
    })

    it("uses forceTLS over ws transport when the server scheme is https", () => {
        expect(buildPusherBrowserConfig({ ...baseConfig, scheme: "https" })).toEqual({
            key: "app-key",
            wsHost: "ws.example.com",
            wsPort: 6001,
            wssPort: 6001,
            forceTLS: true,
            enabledTransports: ["ws"],
            cluster: "mt1",
        })
    })

    it("keeps the browser host independent from any internal publish host naming", () => {
        expect(buildPusherBrowserConfig({
            ...baseConfig,
            host: "pusher.nandoburgos.dev",
            port: 443,
            scheme: "https",
        })).toEqual({
            key: "app-key",
            wsHost: "pusher.nandoburgos.dev",
            wsPort: 443,
            wssPort: 443,
            forceTLS: true,
            enabledTransports: ["ws"],
            cluster: "mt1",
        })
    })
})
