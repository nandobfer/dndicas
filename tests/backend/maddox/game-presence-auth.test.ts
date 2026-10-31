import { beforeEach, describe, expect, it, vi } from "vitest"
import { importFresh } from "../helpers/module"

const pusherGet = vi.fn()
const authorizeChannel = vi.fn((socketId: string, channel: string, data?: unknown) => ({ auth: `${socketId}:${channel}`, channel_data: data ? JSON.stringify(data) : undefined }))
let configured = true
let actor: { id: string; name: string; permissions: string[] } | null = { id: "user-1", name: "Ana", permissions: ["maddox.play"] }
const isActiveCampaignMember = vi.fn(async () => true)

vi.doMock("@/lib/pusher/server", () => ({
    isPusherServerConfigured: vi.fn(async () => configured),
    getRawPusherServer: vi.fn(async () => ({ get: pusherGet })),
    getPusherServer: vi.fn(async () => ({ authorizeChannel })),
}))
vi.doMock("@/features/auth/server/actor", () => ({ getActor: vi.fn(async () => actor) }))
vi.doMock("@/features/opex-agent/server/anonymous", () => ({ readAnonymousId: vi.fn(async () => null) }))
vi.doMock("@/features/maddox/server/campaigns", () => ({ isActiveCampaignMember }))

const CAMPAIGN = "6ae556e2cda8c14484b2432f"
const CHANNEL = `presence-maddox-c-${CAMPAIGN}`

describe("presença da mesa Maddox", () => {
    beforeEach(() => {
        configured = true
        actor = { id: "user-1", name: "Ana", permissions: ["maddox.play"] }
        pusherGet.mockReset()
        authorizeChannel.mockClear()
        isActiveCampaignMember.mockReset().mockResolvedValue(true)
    })

    it("consulta os usuários do canal de presença pela API HTTP do Pusher", async () => {
        pusherGet.mockResolvedValue({ ok: true, status: 200, json: async () => ({ users: [{ id: "u1" }, { id: "u2" }] }) })
        const { onlineUserIds } = await importFresh<typeof import("@/features/maddox/server/game-presence")>("@/features/maddox/server/game-presence")
        expect(await onlineUserIds(CAMPAIGN)).toEqual(new Set(["u1", "u2"]))
        expect(pusherGet).toHaveBeenCalledWith({ path: `/channels/${CHANNEL}/users` })
    })

    it("sem Pusher configurado ou com falha na consulta, a presença é desconhecida (null)", async () => {
        const { onlineUserIds } = await importFresh<typeof import("@/features/maddox/server/game-presence")>("@/features/maddox/server/game-presence")
        configured = false
        expect(await onlineUserIds(CAMPAIGN)).toBeNull()
        configured = true
        pusherGet.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
        expect(await onlineUserIds(CAMPAIGN)).toBeNull()
        pusherGet.mockRejectedValue(new Error("rede"))
        expect(await onlineUserIds(CAMPAIGN)).toBeNull()
    })

    const authRequest = () => new Request("http://localhost/api/pusher/auth", { method: "POST", body: new URLSearchParams({ socket_id: "1.2", channel_name: CHANNEL }).toString() })

    it("/api/pusher/auth autoriza só membro ativo, com o usuário efetivo como presença", async () => {
        const route = await importFresh<typeof import("@/app/api/pusher/auth/route")>("@/app/api/pusher/auth/route")
        const response = await route.POST(authRequest() as never)
        expect(response.status).toBe(200)
        expect(isActiveCampaignMember).toHaveBeenCalledWith(CAMPAIGN, "user-1")
        expect(authorizeChannel).toHaveBeenCalledWith("1.2", CHANNEL, { user_id: "user-1", user_info: { name: "Ana" } })

        isActiveCampaignMember.mockResolvedValue(false)
        expect((await route.POST(authRequest() as never)).status).toBe(403)
    })

    it("/api/pusher/auth recusa visitante e quem não tem maddox.play", async () => {
        const route = await importFresh<typeof import("@/app/api/pusher/auth/route")>("@/app/api/pusher/auth/route")
        actor = null
        expect((await route.POST(authRequest() as never)).status).toBe(403)
        actor = { id: "user-1", name: "Ana", permissions: [] }
        expect((await route.POST(authRequest() as never)).status).toBe(403)
        expect(isActiveCampaignMember).not.toHaveBeenCalled()
        expect(authorizeChannel).not.toHaveBeenCalled()
    })
})
