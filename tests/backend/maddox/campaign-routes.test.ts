import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeJsonRequest, makeRequest } from "../helpers/http"
import { importFresh } from "../helpers/module"

const permissions: string[] = []
let who: "player" | "noPermission" | "anonymous" = "player"

vi.doMock("@/features/auth/server/actor", () => ({
    requirePermissionActor: vi.fn(async (permission: string) => {
        permissions.push(permission)
        const { DomainError } = await import("@/lib/api/route")
        if (who === "anonymous") throw new DomainError(401, "Faça login para continuar.", "UNAUTHORIZED")
        if (who === "noPermission") throw new DomainError(403, "Você não tem permissão para esta ação.", "FORBIDDEN")
        return { id: "user-1", name: "Ana", role: "user", permissions: ["maddox.play"] }
    }),
}))

const service = {
    listMyCampaigns: vi.fn(async () => []),
    createCampaign: vi.fn(async () => ({ id: "c1" })),
    getCampaignDetail: vi.fn(async () => ({ id: "c1" })),
    updateCampaign: vi.fn(async () => ({ id: "c1" })),
    getInviteLink: vi.fn(async () => ({ token: "t".repeat(43), rotatedAt: null })),
    rotateInvite: vi.fn(async () => ({ token: "n".repeat(43), rotatedAt: null })),
    previewInvite: vi.fn(async () => ({ campaignId: "c1" })),
    joinByInvite: vi.fn(async () => ({ campaignId: "c1" })),
    removeMember: vi.fn(async () => ({ left: true })),
    upsertCharacterDraft: vi.fn(async () => ({ id: "c1" })),
}
vi.doMock("@/features/maddox/server/campaigns", () => service)

const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) })
const load = <T>(path: string) => importFresh<T>(path)

describe("rotas das Campanhas Maddox", () => {
    beforeEach(() => {
        who = "player"
        permissions.length = 0
        Object.values(service).forEach((fn) => fn.mockClear())
    })

    it("todas exigem maddox.play: sem login 401, sem permissão 403", async () => {
        const list = await load<typeof import("@/app/api/maddox/campaigns/route")>("@/app/api/maddox/campaigns/route")
        for (const [state, status] of [["anonymous", 401], ["noPermission", 403]] as const) {
            who = state
            const response = await list.GET(makeRequest("http://localhost/api/maddox/campaigns"), ctx({}) as never)
            expect(response.status).toBe(status)
        }
        const invite = await load<typeof import("@/app/api/maddox/campaigns/invites/[token]/route")>("@/app/api/maddox/campaigns/invites/[token]/route")
        expect((await invite.POST(makeRequest("http://localhost/api/maddox/campaigns/invites/x", { method: "POST" }), ctx({ token: "x" }))).status).toBe(403)
        expect(service.listMyCampaigns).not.toHaveBeenCalled()
        expect(service.joinByInvite).not.toHaveBeenCalled()
        expect(new Set(permissions)).toEqual(new Set(["maddox.play"]))
    })

    it("lista e cria com o usuário efetivo; corpo inválido responde 400 em pt-BR", async () => {
        const route = await load<typeof import("@/app/api/maddox/campaigns/route")>("@/app/api/maddox/campaigns/route")
        expect((await route.GET(makeRequest("http://localhost/api/maddox/campaigns"), ctx({}) as never)).status).toBe(200)
        expect(service.listMyCampaigns).toHaveBeenCalledWith("user-1")

        const bad = await route.POST(makeJsonRequest("http://localhost/api/maddox/campaigns", { method: "POST", body: JSON.stringify({ name: "x", rigor: "caótico" }) }), ctx({}) as never)
        expect(bad.status).toBe(400)
        expect(JSON.stringify(await bad.json())).toMatch(/nome da campanha|rigor/)

        const good = await route.POST(makeJsonRequest("http://localhost/api/maddox/campaigns", { method: "POST", body: JSON.stringify({ name: "Brumas", rigor: "fiel-dnd" }) }), ctx({}) as never)
        expect(good.status).toBe(201)
        expect(service.createCampaign).toHaveBeenCalledWith({ name: "Brumas", rigor: "fiel-dnd" }, "user-1")
    })

    it("detalhe, edição, convite, membros e personagem repassam os parâmetros", async () => {
        const detail = await load<typeof import("@/app/api/maddox/campaigns/[id]/route")>("@/app/api/maddox/campaigns/[id]/route")
        await detail.GET(makeRequest("http://localhost/api/maddox/campaigns/c1"), ctx({ id: "c1" }))
        expect(service.getCampaignDetail).toHaveBeenCalledWith("c1", "user-1")
        expect((await detail.PATCH(makeJsonRequest("http://localhost/api/maddox/campaigns/c1", { method: "PATCH", body: JSON.stringify({}) }), ctx({ id: "c1" }))).status).toBe(400)
        await detail.PATCH(makeJsonRequest("http://localhost/api/maddox/campaigns/c1", { method: "PATCH", body: JSON.stringify({ rigor: "narrativo" }) }), ctx({ id: "c1" }))
        expect(service.updateCampaign).toHaveBeenCalledWith("c1", { rigor: "narrativo" }, "user-1")

        const invite = await load<typeof import("@/app/api/maddox/campaigns/[id]/invite/route")>("@/app/api/maddox/campaigns/[id]/invite/route")
        await invite.GET(makeRequest("http://localhost/api/maddox/campaigns/c1/invite"), ctx({ id: "c1" }))
        await invite.POST(makeRequest("http://localhost/api/maddox/campaigns/c1/invite", { method: "POST" }), ctx({ id: "c1" }))
        expect(service.getInviteLink).toHaveBeenCalledWith("c1", "user-1")
        expect(service.rotateInvite).toHaveBeenCalledWith("c1", "user-1")

        const members = await load<typeof import("@/app/api/maddox/campaigns/[id]/members/[memberId]/route")>("@/app/api/maddox/campaigns/[id]/members/[memberId]/route")
        await members.DELETE(makeRequest("http://localhost/api/maddox/campaigns/c1/members/m1", { method: "DELETE" }), ctx({ id: "c1", memberId: "m1" }))
        expect(service.removeMember).toHaveBeenCalledWith("c1", "m1", "user-1")

        const character = await load<typeof import("@/app/api/maddox/campaigns/[id]/character/route")>("@/app/api/maddox/campaigns/[id]/character/route")
        expect((await character.PUT(makeJsonRequest("http://localhost/api/maddox/campaigns/c1/character", { method: "PUT", body: JSON.stringify({ name: "L", portraitUrl: "javascript:alert(1)" }) }), ctx({ id: "c1" }))).status).toBe(400)
        await character.PUT(makeJsonRequest("http://localhost/api/maddox/campaigns/c1/character", { method: "PUT", body: JSON.stringify({ name: "Lyra", portraitUrl: "/api/upload?key=a.png" }) }), ctx({ id: "c1" }))
        expect(service.upsertCharacterDraft).toHaveBeenCalledWith("c1", { name: "Lyra", portraitUrl: "/api/upload?key=a.png" }, "user-1")

        const join = await load<typeof import("@/app/api/maddox/campaigns/invites/[token]/route")>("@/app/api/maddox/campaigns/invites/[token]/route")
        await join.GET(makeRequest("http://localhost/api/maddox/campaigns/invites/abc"), ctx({ token: "abc" }))
        const joined = await join.POST(makeRequest("http://localhost/api/maddox/campaigns/invites/abc", { method: "POST" }), ctx({ token: "abc" }))
        expect(await joined.json()).toMatchObject({ data: { campaignId: "c1" } })
        expect(service.previewInvite).toHaveBeenCalledWith("abc", "user-1")
        expect(service.joinByInvite).toHaveBeenCalledWith("abc", "user-1")
    })

    it("erro de regra vira a resposta padronizada (ex.: 409 do Maddox indisponível)", async () => {
        const route = await load<typeof import("@/app/api/maddox/campaigns/route")>("@/app/api/maddox/campaigns/route")
        // Depois do `importFresh`: o `withRoute` só reconhece a classe do módulo recriado.
        const { DomainError } = await import("@/lib/api/route")
        service.createCampaign.mockRejectedValueOnce(new DomainError(409, 'O "Agente Maddox" está desativado.', "MADDOX_UNAVAILABLE") as never)
        const response = await route.POST(makeJsonRequest("http://localhost/api/maddox/campaigns", { method: "POST", body: JSON.stringify({ name: "Brumas", rigor: "narrativo" }) }), ctx({}) as never)
        expect(response.status).toBe(409)
        expect(await response.json()).toMatchObject({ success: false, code: "MADDOX_UNAVAILABLE" })
    })
})
