import { beforeEach, describe, expect, it } from "vitest"
import { assertAnonymousTurnAllowed, clientIpOf, resetAnonymousRateLimit } from "@/features/opex-agent/server/rate-limit"

const limits = { turnsPerHourPerVisitor: 2, turnsPerHourPerIp: 3, turnsPerHourTotal: 100 }

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

    it("usa o IP confiável: x-real-ip do proxy ou o último salto do x-forwarded-for (o primeiro é forjável)", () => {
        expect(clientIpOf(new Headers({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" }))).toBe("9.9.9.9")
        expect(clientIpOf(new Headers({ "x-real-ip": "8.8.8.8", "x-forwarded-for": "1.2.3.4" }))).toBe("8.8.8.8")
        expect(clientIpOf(new Headers())).toBeNull()
    })

    it("contorno: cookie novo e x-forwarded-for forjado a cada pedido não escapam do limite por IP", () => {
        const now = Date.UTC(2026, 9, 29, 12)
        const turn = (index: number) =>
            assertAnonymousTurnAllowed(`visitante-${index}`, clientIpOf(new Headers({ "x-forwarded-for": `10.0.0.${index}, 7.7.7.7` })), limits, now)
        turn(1)
        turn(2)
        turn(3)
        expect(() => turn(4)).toThrow(/Limite de mensagens/)
    })

    it("contorno: sem IP, os pedidos dividem um balde único", () => {
        const now = Date.UTC(2026, 9, 29, 12)
        for (const id of ["a", "b", "c"]) assertAnonymousTurnAllowed(id, null, limits, now)
        expect(() => assertAnonymousTurnAllowed("d", null, limits, now)).toThrow()
    })

    it("teto global: trocar de cookie e de IP não passa do total por hora", () => {
        const now = Date.UTC(2026, 9, 29, 12)
        const total = { ...limits, turnsPerHourTotal: 5 }
        for (let index = 0; index < 5; index++) assertAnonymousTurnAllowed(`v${index}`, `20.0.0.${index}`, total, now)
        expect(() => assertAnonymousTurnAllowed("v-novo", "30.0.0.1", total, now)).toThrow(/Limite de mensagens/)
        expect(() => assertAnonymousTurnAllowed("v-novo", "30.0.0.1", total, now + 60 * 60 * 1000 + 1)).not.toThrow()
    })
})
