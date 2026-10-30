import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeJsonRequest, makeRequest } from "../helpers/http"
import { importFresh } from "../helpers/module"

let who: "player" | "noPermission" = "player"

vi.doMock("@/features/auth/server/actor", () => ({
    requirePermissionActor: vi.fn(async (permission: string) => {
        const { DomainError } = await import("@/lib/api/route")
        if (who === "noPermission" || permission !== "maddox.play") throw new DomainError(403, "Você não tem permissão para esta ação.", "FORBIDDEN")
        return { id: "user-1", name: "Ana", role: "user", permissions: ["maddox.play"] }
    }),
}))

const turn = { fake: true }
const service = {
    getInterview: vi.fn(async () => ({ interview: null, maddoxAvatarUrl: null })),
    startInterview: vi.fn(async (): Promise<{ interview: unknown; turn: unknown }> => ({ interview: { id: "i1" }, turn })),
    sendInterviewMessage: vi.fn(async () => turn),
    retryInterviewTurn: vi.fn(async () => turn),
    runTurn: vi.fn(async (_turn: unknown, emit: (line: unknown) => void) => {
        emit({ type: "delta", text: "Olá" })
        emit({ type: "done", message: { id: "m1" }, interview: { id: "i1" } })
    }),
}
const completeInterview = vi.fn(async () => ({ id: "c1" }))

vi.doMock("@/features/maddox/server/interviews", async () => {
    const { DomainError } = await import("@/lib/api/route")
    return {
        ...service,
        interviewKind: (value: string) => {
            if (value !== "scenario" && value !== "character") throw new DomainError(404, "Entrevista não encontrada", "NOT_FOUND")
            return value
        },
    }
})
vi.doMock("@/features/maddox/server/interview-consolidation", () => ({ completeInterview }))

const ctx = (params: { id: string; kind: string }) => ({ params: Promise.resolve(params) })
const base = "@/app/api/maddox/campaigns/[id]/interviews/[kind]"
const url = "http://localhost/api/maddox/campaigns/c1/interviews/scenario"

describe("rotas das entrevistas do Maddox", () => {
    beforeEach(() => {
        who = "player"
        Object.values(service).forEach((fn) => fn.mockClear())
        completeInterview.mockClear()
    })

    it("exigem maddox.play (403) e tipo de entrevista válido (404)", async () => {
        const route = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/route")>(`${base}/route`)
        who = "noPermission"
        expect((await route.GET(makeRequest(url), ctx({ id: "c1", kind: "scenario" }))).status).toBe(403)
        who = "player"
        const invalid = await route.GET(makeRequest(url), ctx({ id: "c1", kind: "combate" }))
        expect(invalid.status).toBe(404)
        expect(service.getInterview).not.toHaveBeenCalled()
        expect((await route.GET(makeRequest(url), ctx({ id: "c1", kind: "character" }))).status).toBe(200)
        expect(service.getInterview).toHaveBeenCalledWith("c1", "character", "user-1")
    })

    it("começar transmite NDJSON; já começada devolve JSON", async () => {
        const route = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/route")>(`${base}/route`)
        const streamed = await route.POST(makeRequest(url, { method: "POST" }), ctx({ id: "c1", kind: "scenario" }))
        expect(streamed.headers.get("content-type")).toContain("application/x-ndjson")
        const lines = (await streamed.text()).trim().split("\n").map((line) => JSON.parse(line))
        expect(lines.map((line) => line.type)).toEqual(["delta", "done"])
        expect(service.startInterview).toHaveBeenCalledWith("c1", "scenario", "user-1")

        service.startInterview.mockResolvedValueOnce({ interview: { id: "i1" }, turn: null })
        const json = await route.POST(makeRequest(url, { method: "POST" }), ctx({ id: "c1", kind: "scenario" }))
        expect(json.headers.get("content-type")).toContain("application/json")
        expect(await json.json()).toMatchObject({ success: true, data: { interview: { id: "i1" } } })
    })

    it("mensagem valida o corpo (vazio e longo demais = 400 em pt-BR) e transmite a resposta", async () => {
        const route = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/messages/route")>(`${base}/messages/route`)
        const empty = await route.POST(makeJsonRequest(`${url}/messages`, { method: "POST", body: JSON.stringify({ content: "   " }) }), ctx({ id: "c1", kind: "scenario" }))
        expect(empty.status).toBe(400)
        expect(JSON.stringify(await empty.json())).toContain("Escreva sua resposta")
        const long = await route.POST(makeJsonRequest(`${url}/messages`, { method: "POST", body: JSON.stringify({ content: "x".repeat(4001) }) }), ctx({ id: "c1", kind: "scenario" }))
        expect(long.status).toBe(400)
        expect(service.sendInterviewMessage).not.toHaveBeenCalled()

        const good = await route.POST(makeJsonRequest(`${url}/messages`, { method: "POST", body: JSON.stringify({ content: " Fantasia sombria " }) }), ctx({ id: "c1", kind: "scenario" }))
        expect(good.headers.get("content-type")).toContain("application/x-ndjson")
        await good.text()
        expect(service.sendInterviewMessage).toHaveBeenCalledWith("c1", "scenario", { content: "Fantasia sombria" }, "user-1")
        expect(service.runTurn).toHaveBeenCalledWith(turn, expect.any(Function))
    })

    it("nova tentativa transmite; concluir devolve a campanha; erro de regra vira resposta padronizada", async () => {
        const retry = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/retry/route")>(`${base}/retry/route`)
        const retried = await retry.POST(makeRequest(`${url}/retry`, { method: "POST" }), ctx({ id: "c1", kind: "character" }))
        await retried.text()
        expect(service.retryInterviewTurn).toHaveBeenCalledWith("c1", "character", "user-1")

        const complete = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/complete/route")>(`${base}/complete/route`)
        const ok = await complete.POST(makeRequest(`${url}/complete`, { method: "POST" }), ctx({ id: "c1", kind: "scenario" }))
        expect(await ok.json()).toMatchObject({ success: true, data: { id: "c1" } })
        expect(completeInterview).toHaveBeenCalledWith("c1", "scenario", "user-1")

        const { DomainError } = await import("@/lib/api/route")
        completeInterview.mockRejectedValueOnce(new DomainError(409, "O Maddox ainda não apresentou a síntese para você confirmar.", "NO_PROPOSAL") as never)
        const conflict = await complete.POST(makeRequest(`${url}/complete`, { method: "POST" }), ctx({ id: "c1", kind: "scenario" }))
        expect(conflict.status).toBe(409)
        expect(await conflict.json()).toMatchObject({ success: false, code: "NO_PROPOSAL" })
    })
})
