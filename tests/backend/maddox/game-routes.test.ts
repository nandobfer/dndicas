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

const state = { campaignId: "c1" }
const service = {
    startCampaign: vi.fn(async () => state),
    getGameState: vi.fn(async () => state),
    listGameMessages: vi.fn(async () => ({ messages: [], hasMore: false })),
    submitGameAction: vi.fn(async () => state),
    skipPlayer: vi.fn(async () => state),
    checkTurn: vi.fn(async () => state),
    assertGameMember: vi.fn<(id: string, userId: string) => Promise<void>>(async () => undefined),
}
vi.doMock("@/features/maddox/server/game", () => service)

const ctx = (params: { id: string }) => ({ params: Promise.resolve(params) })
const base = "http://localhost/api/maddox/campaigns/c1"
const post = (url: string, body: unknown) => makeJsonRequest(url, { method: "POST", body: JSON.stringify(body) })

describe("rotas da mesa Maddox", () => {
    beforeEach(() => {
        who = "player"
        permissions.length = 0
        Object.values(service).forEach((fn) => fn.mockClear())
    })

    it("todas exigem maddox.play: sem login 401, sem permissão 403, sem chamar o serviço", async () => {
        // `importFresh` reinicia os módulos: cada rota é usada logo depois de carregada (mesma classe DomainError).
        for (const [state, status] of [["anonymous", 401], ["noPermission", 403]] as const) {
            who = state
            const game = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/game/route")>("@/app/api/maddox/campaigns/[id]/game/route")
            expect((await game.GET(makeRequest(`${base}/game`), ctx({ id: "c1" }))).status).toBe(status)
            const start = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/start/route")>("@/app/api/maddox/campaigns/[id]/start/route")
            expect((await start.POST(makeRequest(`${base}/start`, { method: "POST" }), ctx({ id: "c1" }))).status).toBe(status)
        }
        expect(service.getGameState).not.toHaveBeenCalled()
        expect(service.startCampaign).not.toHaveBeenCalled()
        expect(new Set(permissions)).toEqual(new Set(["maddox.play"]))
    })

    it("iniciar, estado, mensagens anteriores e reavaliação repassam o usuário efetivo", async () => {
        const start = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/start/route")>("@/app/api/maddox/campaigns/[id]/start/route")
        expect((await start.POST(makeRequest(`${base}/start`, { method: "POST" }), ctx({ id: "c1" }))).status).toBe(200)
        expect(service.startCampaign).toHaveBeenCalledWith("c1", "user-1")

        const game = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/game/route")>("@/app/api/maddox/campaigns/[id]/game/route")
        await game.GET(makeRequest(`${base}/game`), ctx({ id: "c1" }))
        expect(service.getGameState).toHaveBeenCalledWith("c1", "user-1")

        const messages = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/game/messages/route")>("@/app/api/maddox/campaigns/[id]/game/messages/route")
        await messages.GET(makeRequest(`${base}/game/messages?before=m9`), ctx({ id: "c1" }))
        expect(service.listGameMessages).toHaveBeenCalledWith("c1", "m9", "user-1")

        const check = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/game/check/route")>("@/app/api/maddox/campaigns/[id]/game/check/route")
        await check.POST(makeRequest(`${base}/game/check`, { method: "POST" }), ctx({ id: "c1" }))
        expect(service.checkTurn).toHaveBeenCalledWith("c1", "user-1")
    })

    it("ações: valida o corpo (400 em pt-BR) e repassa declaração, pergunta e \"Não fazer nada\"", async () => {
        const route = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/game/actions/route")>("@/app/api/maddox/campaigns/[id]/game/actions/route")
        const url = `${base}/game/actions`
        for (const body of [{ kind: "declaration", content: "   " }, { kind: "declaration", content: "x".repeat(4001) }, { kind: "atacar", content: "x" }, { kind: "pass", content: "extra" }]) {
            const response = await route.POST(post(url, body), ctx({ id: "c1" }))
            expect(response.status).toBe(400)
        }
        const empty = await route.POST(post(url, { kind: "question", content: "" }), ctx({ id: "c1" }))
        expect(JSON.stringify(await empty.json())).toContain("Escreva o que o seu personagem faz")
        expect(service.submitGameAction).not.toHaveBeenCalled()

        await route.POST(post(url, { kind: "declaration", content: "  Abro a porta.  " }), ctx({ id: "c1" }))
        expect(service.submitGameAction).toHaveBeenLastCalledWith("c1", { kind: "declaration", content: "Abro a porta." }, "user-1")
        await route.POST(post(url, { kind: "question", content: "Há guardas?" }), ctx({ id: "c1" }))
        expect(service.submitGameAction).toHaveBeenLastCalledWith("c1", { kind: "question", content: "Há guardas?" }, "user-1")
        await route.POST(post(url, { kind: "pass" }), ctx({ id: "c1" }))
        expect(service.submitGameAction).toHaveBeenLastCalledWith("c1", { kind: "pass" }, "user-1")
    })

    it("pular jogador exige o membro e repassa ao serviço", async () => {
        const route = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/game/skip/route")>("@/app/api/maddox/campaigns/[id]/game/skip/route")
        expect((await route.POST(post(`${base}/game/skip`, {}), ctx({ id: "c1" }))).status).toBe(400)
        await route.POST(post(`${base}/game/skip`, { memberId: "m2" }), ctx({ id: "c1" }))
        expect(service.skipPlayer).toHaveBeenCalledWith("c1", { memberId: "m2" }, "user-1")
    })

    it("erro de domínio do serviço vira a resposta padronizada", async () => {
        const route = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/game/actions/route")>("@/app/api/maddox/campaigns/[id]/game/actions/route")
        const { DomainError } = await import("@/lib/api/route")
        service.submitGameAction.mockRejectedValueOnce(new DomainError(409, "Você entra no jogo a partir do próximo turno.", "NEXT_TURN"))
        const response = await route.POST(post(`${base}/game/actions`, { kind: "pass" }), ctx({ id: "c1" }))
        expect(response.status).toBe(409)
        expect(await response.json()).toMatchObject({ success: false, code: "NEXT_TURN" })
    })

    it("stream da mesa: só membros; abre com o snapshot das gerações ao vivo", async () => {
        type StreamRoute = typeof import("@/app/api/maddox/campaigns/[id]/game/stream/route")
        who = "anonymous"
        let route = await importFresh<StreamRoute>("@/app/api/maddox/campaigns/[id]/game/stream/route")
        expect((await route.GET(makeRequest(`${base}/game/stream`), ctx({ id: "c1" }))).status).toBe(401)

        who = "player"
        route = await importFresh<StreamRoute>("@/app/api/maddox/campaigns/[id]/game/stream/route")
        const { DomainError } = await import("@/lib/api/route")
        service.assertGameMember.mockRejectedValueOnce(new DomainError(404, "Campanha não encontrada", "NOT_FOUND"))
        expect((await route.GET(makeRequest(`${base}/game/stream`), ctx({ id: "c1" }))).status).toBe(404)

        const { beginLive } = await import("@/features/maddox/server/game-live")
        const live = beginLive("c1", { kind: "narration", turnNumber: 3, replyToId: null })
        live.delta("A névoa")
        const controller = new AbortController()
        const res = await route.GET(makeRequest(`${base}/game/stream`, { signal: controller.signal }), ctx({ id: "c1" }))
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toContain("application/x-ndjson")
        expect(service.assertGameMember).toHaveBeenLastCalledWith("c1", "user-1")
        const reader = res.body!.getReader()
        const first = JSON.parse(new TextDecoder().decode((await reader.read()).value).split("\n")[0]!)
        expect(first).toMatchObject({ type: "snapshot", live: [{ kind: "narration", turnNumber: 3, text: "A névoa" }] })
        live.delta(" sobe.")
        const next = JSON.parse(new TextDecoder().decode((await reader.read()).value).split("\n")[0]!)
        expect(next).toMatchObject({ type: "delta", text: " sobe." })
        live.end({ messageId: "m1", error: null })
        controller.abort()
    })
})
