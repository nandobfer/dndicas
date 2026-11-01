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
const scoresService = {
    submitAbilityScores: vi.fn(async () => turn),
    rollAbilityScore: vi.fn(async () => ({ roll: { rollId: "r1" }, interview: { id: "i1" } })),
    resetAbilityRolls: vi.fn(async () => ({ id: "i1", abilityRolls: null })),
}
vi.doMock("@/features/maddox/server/interview-scores-service", () => scoresService)
const hitPointsService = {
    submitHitPoints: vi.fn(async () => turn),
    rollHitPoint: vi.fn(async () => ({ roll: { rollId: "r2" }, interview: { id: "i1" } })),
}
vi.doMock("@/features/maddox/server/interview-hit-points", () => hitPointsService)

const ctx = (params: { id: string; kind: string }) => ({ params: Promise.resolve(params) })
const base = "@/app/api/maddox/campaigns/[id]/interviews/[kind]"
const url = "http://localhost/api/maddox/campaigns/c1/interviews/scenario"

describe("rotas das entrevistas do Maddox", () => {
    beforeEach(() => {
        who = "player"
        Object.values(service).forEach((fn) => fn.mockClear())
        completeInterview.mockClear()
        Object.values(scoresService).forEach((fn) => fn.mockClear())
        Object.values(hitPointsService).forEach((fn) => fn.mockClear())
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

    it("card de atributos: envio valida o corpo e transmite; rolagem e reinício aceitam só corpo vazio; exigem maddox.play", async () => {
        const guarded = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/ability-scores/roll/route")>(`${base}/ability-scores/roll/route`)
        who = "noPermission"
        expect((await guarded.POST(makeJsonRequest(`${url}/ability-scores/roll`, { method: "POST", body: JSON.stringify({}) }), ctx({ id: "c1", kind: "character" }))).status).toBe(403)
        who = "player"
        expect(scoresService.rollAbilityScore).not.toHaveBeenCalled()
        const submit = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/ability-scores/route")>(`${base}/ability-scores/route`)
        const roll = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/ability-scores/roll/route")>(`${base}/ability-scores/roll/route`)
        const reset = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/ability-scores/reset/route")>(`${base}/ability-scores/reset/route`)
        const params = ctx({ id: "c1", kind: "character" })
        const scores = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 }

        const invalidMethod = await submit.POST(makeJsonRequest(`${url}/ability-scores`, { method: "POST", body: JSON.stringify({ method: "dados", scores }) }), params)
        expect(invalidMethod.status).toBe(400)
        const extra = await submit.POST(makeJsonRequest(`${url}/ability-scores`, { method: "POST", body: JSON.stringify({ method: "standard", scores: { ...scores, luck: 3 } }) }), params)
        expect(extra.status).toBe(400)
        expect(scoresService.submitAbilityScores).not.toHaveBeenCalled()
        const streamed = await submit.POST(makeJsonRequest(`${url}/ability-scores`, { method: "POST", body: JSON.stringify({ method: "standard", scores }) }), params)
        expect(streamed.headers.get("content-type")).toContain("ndjson")
        expect((await streamed.text()).trim().split("\n").map((line) => JSON.parse(line)).at(-1)).toMatchObject({ type: "done" })
        expect(scoresService.submitAbilityScores).toHaveBeenCalledWith("c1", "character", { method: "standard", scores }, "user-1")

        // O cliente não manda dado: corpo com valores é recusado.
        expect((await roll.POST(makeJsonRequest(`${url}/ability-scores/roll`, { method: "POST", body: JSON.stringify({ dice: [6, 6, 6, 6] }) }), params)).status).toBe(400)
        const rolled = await roll.POST(makeJsonRequest(`${url}/ability-scores/roll`, { method: "POST", body: JSON.stringify({}) }), params)
        expect(rolled.status).toBe(200)
        expect((await rolled.json()).data).toMatchObject({ roll: { rollId: "r1" } })
        const resetRes = await reset.POST(makeJsonRequest(`${url}/ability-scores/reset`, { method: "POST", body: JSON.stringify({}) }), params)
        expect((await resetRes.json()).data).toMatchObject({ interview: { abilityRolls: null } })
        expect(scoresService.rollAbilityScore).toHaveBeenCalledTimes(1)
    })

    it("card de PV: maddox.play, corpo validado em pt-BR, rolagem por nível e envio em NDJSON; erro de regra padronizado", async () => {
        const params = ctx({ id: "c1", kind: "character" })
        const post = (path: string, body: unknown) => makeJsonRequest(`${url}${path}`, { method: "POST", body: JSON.stringify(body) })
        // Cada import novo recarrega o módulo dos erros: a checagem de permissão vem logo depois do import da rota.
        who = "noPermission"
        const guardedSubmit = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/hit-points/route")>(`${base}/hit-points/route`)
        expect((await guardedSubmit.POST(post("/hit-points", { escolhas: { "2": "media" } }), params)).status).toBe(403)
        const guardedRoll = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/hit-points/roll/route")>(`${base}/hit-points/roll/route`)
        expect((await guardedRoll.POST(post("/hit-points/roll", { nivel: 2 }), params)).status).toBe(403)
        who = "player"
        const submit = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/hit-points/route")>(`${base}/hit-points/route`)
        const roll = await importFresh<typeof import("@/app/api/maddox/campaigns/[id]/interviews/[kind]/hit-points/roll/route")>(`${base}/hit-points/roll/route`)

        expect((await roll.POST(post("/hit-points/roll", { nivel: 1 }), params)).status).toBe(400)
        expect((await roll.POST(post("/hit-points/roll", { nivel: 2, dado: 10 }), params)).status).toBe(400)
        const rolled = await roll.POST(post("/hit-points/roll", { nivel: 3 }), params)
        expect(rolled.status).toBe(200)
        expect(hitPointsService.rollHitPoint).toHaveBeenCalledWith("c1", "character", 3, "user-1")

        const invalid = await submit.POST(post("/hit-points", { escolhas: { "2": "maximo" } }), params)
        expect(invalid.status).toBe(400)
        expect(JSON.stringify(await invalid.json())).toContain("Escolha média ou rolagem")
        expect(hitPointsService.submitHitPoints).not.toHaveBeenCalled()
        const streamed = await submit.POST(post("/hit-points", { escolhas: { "2": "media", "3": "rolagem" } }), params)
        expect(streamed.headers.get("content-type")).toContain("application/x-ndjson")
        expect((await streamed.text()).trim().split("\n").map((line) => JSON.parse(line).type)).toEqual(["delta", "done"])
        expect(hitPointsService.submitHitPoints).toHaveBeenCalledWith("c1", "character", { escolhas: { "2": "media", "3": "rolagem" } }, "user-1")

        const { DomainError } = await import("@/lib/api/route")
        hitPointsService.rollHitPoint.mockRejectedValueOnce(new DomainError(409, "O dado de vida do nível 3 já foi rolado.", "HIT_POINT_ROLLED"))
        const conflict = await roll.POST(post("/hit-points/roll", { nivel: 3 }), params)
        expect(conflict.status).toBe(409)
        expect(JSON.stringify(await conflict.json())).toContain("já foi rolado")
    })
})
