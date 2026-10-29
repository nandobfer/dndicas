import { describe, expect, it } from "vitest"
import { readLegacyEnv, readLegacyEnvVar } from "@/lib/integrations/legacy-env"

describe("variáveis legadas do .env (migração da integração Pusher)", () => {
    const soketiEnv = {
        PUSHER_APP_ID: "app-id",
        PUSHER_APP_KEY: "internal-key",
        PUSHER_APP_SECRET: "secret",
        PUSHER_HOST: "soketi",
        PUSHER_PORT: "6001",
        PUSHER_SCHEME: "http",
        PUSHER_PUBLIC_HOST: "pusher.nandoburgos.dev",
        PUSHER_PUBLIC_SCHEME: "https",
    }

    it("deriva o modo host e a URL interna do servidor do formato antigo (host, porta e esquema)", () => {
        expect(readLegacyEnvVar("PUSHER_MODE", soketiEnv)).toBe("host")
        expect(readLegacyEnvVar("PUSHER_URL", soketiEnv)).toBe("http://soketi:6001")
    })

    it("deriva a URL pública do navegador sem a porta padrão do TLS", () => {
        expect(readLegacyEnvVar("NEXT_PUBLIC_PUSHER_URL", soketiEnv)).toBe("wss://pusher.nandoburgos.dev")
    })

    it("mantém a porta pública quando diferente da padrão e aceita as variáveis NEXT_PUBLIC_*", () => {
        const env = { NEXT_PUBLIC_PUSHER_HOST: "legacy-pusher.example.com", NEXT_PUBLIC_PUSHER_PORT: "6002", NEXT_PUBLIC_PUSHER_SCHEME: "https" }
        expect(readLegacyEnvVar("NEXT_PUBLIC_PUSHER_URL", env)).toBe("wss://legacy-pusher.example.com:6002")
    })

    it("sem PUSHER_HOST não força o modo host (Pusher na nuvem)", () => {
        expect(readLegacyEnvVar("PUSHER_MODE", { PUSHER_APP_KEY: "key", PUSHER_CLUSTER: "sa1" })).toBeUndefined()
    })

    it("a variável explícita vence a derivada", () => {
        expect(readLegacyEnvVar("PUSHER_URL", { ...soketiEnv, PUSHER_URL: "http://outro:7000" })).toBe("http://outro:7000")
    })

    it("devolve a primeira variável preenchida, ignorando vazias", () => {
        expect(readLegacyEnv(["PUSHER_APP_KEY", "PUSHER_KEY"], { PUSHER_APP_KEY: "  ", PUSHER_KEY: "fallback" })).toBe("fallback")
        expect(readLegacyEnv(undefined, {})).toBeUndefined()
    })
})
