import { describe, expect, it, vi } from "vitest"

vi.mock("next/headers", () => ({ cookies: vi.fn() }))

import { createAnonymousToken, verifyAnonymousToken } from "@/features/opex-agent/server/anonymous"

describe("identidade anônima do Agente Opex (cookie assinado)", () => {
    it("aceita o token assinado com o AUTH_SECRET e devolve o id", () => {
        vi.stubEnv("AUTH_SECRET", "segredo-de-teste")
        const { id, token } = createAnonymousToken()
        expect(verifyAnonymousToken(token)).toBe(id)
    })

    it("recusa token adulterado, sem assinatura ou com id fora do formato", () => {
        vi.stubEnv("AUTH_SECRET", "segredo-de-teste")
        const { token } = createAnonymousToken("11111111-1111-4111-8111-111111111111")
        expect(verifyAnonymousToken(token.replace("11111111", "22222222"))).toBeNull()
        expect(verifyAnonymousToken("11111111-1111-4111-8111-111111111111")).toBeNull()
        expect(verifyAnonymousToken("../../etc.passwd")).toBeNull()
        expect(verifyAnonymousToken(undefined)).toBeNull()
    })

    it("um token assinado com outro segredo não vale", () => {
        vi.stubEnv("AUTH_SECRET", "segredo-a")
        const { token } = createAnonymousToken()
        vi.stubEnv("AUTH_SECRET", "segredo-b")
        expect(verifyAnonymousToken(token)).toBeNull()
    })
})
