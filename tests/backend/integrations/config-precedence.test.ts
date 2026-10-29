import { describe, expect, it, vi } from "vitest"
import { getIntegrationDef } from "@/lib/integrations/catalog"
import { buildResolvedIntegration } from "@/lib/integrations/config"
import { encryptSecret } from "@/lib/crypto/secretBox"
import type { StoredIntegration } from "@/lib/integrations/store"

const KEY = Buffer.alloc(32, 7).toString("base64")

const stored = (values: Partial<StoredIntegration>): StoredIntegration => ({
    integrationId: "storage_s3",
    environment: "interno",
    debugMode: false,
    publicValues: {},
    secretValues: {},
    ...values,
})

describe("resolução da configuração: banco → .env legado → padrão do código", () => {
    it("sem nada salvo, lê o .env legado e completa com o padrão do código", () => {
        vi.stubEnv("S3_ENDPOINT", "http://minio:9000")
        vi.stubEnv("S3_ACCESS_KEY", "env-access")
        vi.stubEnv("S3_REGION", "")
        const resolved = buildResolvedIntegration<"storage_s3">(getIntegrationDef("storage_s3"), null)
        expect(resolved.values.endpoint).toBe("http://minio:9000")
        expect(resolved.values.region).toBe("us-east-1")
        expect(resolved.values.accessKey).toBe("env-access")
        expect(resolved.secretSources.accessKey).toBe("env")
    })

    it("o valor salvo no banco vence o .env, inclusive o segredo criptografado", () => {
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", KEY)
        vi.stubEnv("S3_ENDPOINT", "http://minio:9000")
        vi.stubEnv("S3_ACCESS_KEY", "env-access")
        const resolved = buildResolvedIntegration<"storage_s3">(
            getIntegrationDef("storage_s3"),
            stored({ publicValues: { endpoint: "https://s3.dndicas.com.br" }, secretValues: { accessKey: encryptSecret("db-access") } }),
        )
        expect(resolved.values.endpoint).toBe("https://s3.dndicas.com.br")
        expect(resolved.values.accessKey).toBe("db-access")
        expect(resolved.secretSources.accessKey).toBe("db")
    })

    it("segredo limpo pelo administrador (null) não volta do .env", () => {
        vi.stubEnv("S3_SECRET_KEY", "env-secret")
        const resolved = buildResolvedIntegration<"storage_s3">(getIntegrationDef("storage_s3"), stored({ secretValues: { secretKey: null } }))
        expect(resolved.values.secretKey).toBeUndefined()
        expect(resolved.secretSources.secretKey).toBe("none")
    })

    it("muda a versão quando a configuração muda (os singletons se recriam por ela)", () => {
        const a = buildResolvedIntegration(getIntegrationDef("smtp"), stored({ integrationId: "smtp", publicValues: { host: "smtp.a" } }))
        const b = buildResolvedIntegration(getIntegrationDef("smtp"), stored({ integrationId: "smtp", publicValues: { host: "smtp.b" } }))
        expect(a.version).not.toBe(b.version)
    })
})
