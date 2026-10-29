import { describe, expect, it, vi } from "vitest"
import { decryptSecret, encryptSecret, isEncryptedSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox"

describe("caixa de segredos (AES-256-GCM)", () => {
    it("sem INTEGRATIONS_ENCRYPTION_KEY não está configurada", () => {
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", "")
        expect(isSecretBoxConfigured()).toBe(false)
    })

    it("criptografa e descriptografa com a chave, sem guardar o texto puro", () => {
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"))
        const box = encryptSecret("segredo-do-pusher")
        expect(isEncryptedSecret(box)).toBe(true)
        expect(JSON.stringify(box)).not.toContain("segredo-do-pusher")
        expect(decryptSecret(box)).toBe("segredo-do-pusher")
    })

    it("não abre com outra chave", () => {
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"))
        const box = encryptSecret("segredo")
        vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"))
        expect(() => decryptSecret(box)).toThrow()
    })
})
