import { describe, expect, it } from "vitest"
import { isChannelAuthorized, parseChannel } from "@/lib/pusher/channel-auth"
import { opexChannel, opexOwnerKey } from "@/lib/pusher/channel-names"

const admin = { user: { id: "admin-1", role: "admin" as const }, anonymousId: null }
const user = { user: { id: "user-1", role: "user" as const }, anonymousId: null }
const visitor = { user: null, anonymousId: "11111111-1111-4111-8111-111111111111" }

describe("autorização dos canais privados do Pusher", () => {
    it("canal administrativo e das integrações: só administradores", () => {
        expect(isChannelAuthorized("private-app", admin)).toBe(true)
        expect(isChannelAuthorized("private-app", user)).toBe(false)
        expect(isChannelAuthorized("private-integration-pusher", admin)).toBe(true)
        expect(isChannelAuthorized("private-integration-pusher", user)).toBe(false)
        expect(isChannelAuthorized("private-integration-inexistente", admin)).toBe(false)
    })

    it("canal do Agente Opex: só o próprio usuário", () => {
        const channel = opexChannel(opexOwnerKey({ userId: "user-1" }))
        expect(parseChannel(channel)).toEqual({ kind: "opex-user", userId: "user-1" })
        expect(isChannelAuthorized(channel, user)).toBe(true)
        expect(isChannelAuthorized(channel, admin)).toBe(false)
        expect(isChannelAuthorized(channel, visitor)).toBe(false)
    })

    it("canal do visitante: só quem tem o cookie anônimo daquele id", () => {
        const channel = opexChannel(opexOwnerKey({ anonymousId: visitor.anonymousId }))
        expect(isChannelAuthorized(channel, visitor)).toBe(true)
        expect(isChannelAuthorized(channel, { user: null, anonymousId: "22222222-2222-4222-8222-222222222222" })).toBe(false)
        expect(isChannelAuthorized(channel, user)).toBe(false)
    })

    it("canais desconhecidos são negados", () => {
        expect(isChannelAuthorized("private-qualquer", admin)).toBe(false)
        expect(isChannelAuthorized("private-opex-x-1", admin)).toBe(false)
    })
})
