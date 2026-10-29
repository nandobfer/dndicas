import { buildPusherBrowserConfig } from "../../../../src/core/realtime/pusher-service"
import { buildPusherClientOptions } from "../../../../src/lib/pusher/client"

const page = { hostname: "dndicas.com.br", protocol: "https:" }

describe("buildPusherBrowserConfig", () => {
    it("monta a conexão de um servidor próprio (Soketi) a partir da URL pública", () => {
        const options = buildPusherClientOptions({ key: "app-key", mode: "host", url: "wss://pusher.nandoburgos.dev" }, page)
        expect(options).not.toBeNull()
        expect(buildPusherBrowserConfig("app-key", options!)).toEqual({
            key: "app-key",
            wsHost: "pusher.nandoburgos.dev",
            wsPort: 443,
            wssPort: 443,
            forceTLS: true,
            enabledTransports: ["ws"],
            cluster: "mt1",
            authEndpoint: expect.stringContaining("/api/pusher/auth"),
        })
    })

    it("usa ws sem TLS e a porta da URL quando o servidor é http", () => {
        const options = buildPusherClientOptions({ key: "app-key", mode: "host", url: "ws://192.168.0.64:6001" }, { hostname: "192.168.0.64", protocol: "http:" })
        expect(buildPusherBrowserConfig("app-key", options!)).toMatchObject({ wsHost: "192.168.0.64", wsPort: 6001, wssPort: 6001, forceTLS: false })
    })

    it("mantém o caminho do proxy (wsPath) da URL pública", () => {
        const options = buildPusherClientOptions({ key: "app-key", mode: "host", url: "wss://dndicas.com.br/prefixo/soketi" }, page)
        expect(buildPusherBrowserConfig("app-key", options!)).toMatchObject({ wsHost: "dndicas.com.br", wsPath: "/prefixo/soketi", forceTLS: true })
    })

    it("usa o host do Pusher na nuvem pelo cluster", () => {
        const options = buildPusherClientOptions({ key: "app-key", mode: "cluster", cluster: "sa1" }, page)
        expect(buildPusherBrowserConfig("app-key", options!)).toMatchObject({ wsHost: "ws-sa1.pusher.com", forceTLS: true, cluster: "sa1" })
    })
})
