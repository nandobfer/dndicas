import { beforeEach, describe, expect, it } from "vitest"
import { assertAnonymousTurnAllowed, clientIpOf, resetAnonymousRateLimit } from "@/features/opex-agent/server/rate-limit"

const limits = { turnsPerHourPerVisitor: 2, turnsPerHourPerIp: 3 }

describe("limite de mensagens dos visitantes do Agente Opex", () => {
    beforeEach(() => resetAnonymousRateLimit())

    it("bloqueia o visitante acima do limite por hora com 429 em pt-BR", () => {
        const now = Date.UTC(2026, 9, 29, 12)
        assertAnonymousTurnAllowed("v1", "1.1.1.1", limits, now)
        assertAnonymousTurnAllowed("v1", "1.1.1.1", limits, now + 1000)
        expect(() => assertAnonymousTurnAllowed("v1", "1.1.1.1", limits, now + 2000)).toThrow(/Limite de mensagens para visitantes/)
        try {
            assertAnonymousTurnAllowed("v1", "1.1.1.1", limits, now + 3000)
        } catch (error) {
            expect((error as { status: number }).status).toBe(429)
        }
    })

    it("libera de novo depois da janela de uma hora", () => {
        const now = Date.UTC(2026, 9, 29, 12)
        assertAnonymousTurnAllowed("v1", null, limits, now)
        assertAnonymousTurnAllowed("v1", null, limits, now)
        expect(() => assertAnonymousTurnAllowed("v1", null, limits, now + 60 * 60 * 1000 + 1)).not.toThrow()
    })

    it("limita também por IP (vários visitantes da mesma rede)", () => {
        const now = Date.UTC(2026, 9, 29, 12)
        assertAnonymousTurnAllowed("a", "2.2.2.2", limits, now)
        assertAnonymousTurnAllowed("b", "2.2.2.2", limits, now)
        assertAnonymousTurnAllowed("c", "2.2.2.2", limits, now)
        expect(() => assertAnonymousTurnAllowed("d", "2.2.2.2", limits, now)).toThrow()
        expect(() => assertAnonymousTurnAllowed("d", "3.3.3.3", limits, now)).not.toThrow()
    })

    it("lê o IP do primeiro x-forwarded-for ou do x-real-ip", () => {
        expect(clientIpOf(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9")
        expect(clientIpOf(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8")
        expect(clientIpOf(new Headers())).toBeNull()
    })
})
