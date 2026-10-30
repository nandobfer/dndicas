import { describe, expect, it } from "vitest"
import { isChannelAuthorized, parseChannel } from "@/lib/pusher/channel-auth"
import { opexChannel, opexOwnerKey } from "@/lib/pusher/channel-names"

const admin = { user: { id: "admin-1", permissions: ["admin.access"] }, anonymousId: null }
const user = { user: { id: "user-1", permissions: [] }, anonymousId: null }
const visitor = { user: null, anonymousId: "11111111-1111-4111-8111-111111111111" }

describe("autorização dos canais privados do Pusher", () => {
    it("canal administrativo: admin.access; integrações: só quem pode ver os logs", () => {
        expect(isChannelAuthorized("private-app", admin)).toBe(true)
        expect(isChannelAuthorized("private-app", user)).toBe(false)
        expect(isChannelAuthorized("private-integration-pusher", { user: { id: "root", permissions: ["*"] }, anonymousId: null })).toBe(true)
        expect(isChannelAuthorized("private-integration-pusher", user)).toBe(false)
        expect(isChannelAuthorized("private-integration-inexistente", { user: { id: "root", permissions: ["*"] }, anonymousId: null })).toBe(false)
    })

    it("stream de depuração da integração exige a permissão de logs dela, não admin.access", () => {
        expect(isChannelAuthorized("private-integration-pusher", admin)).toBe(false)
        const logs = { user: { id: "ops-1", permissions: ["integrations.pusher.logs"] }, anonymousId: null }
        expect(isChannelAuthorized("private-integration-pusher", logs)).toBe(true)
        expect(isChannelAuthorized("private-integration-google_auth", logs)).toBe(false)
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
