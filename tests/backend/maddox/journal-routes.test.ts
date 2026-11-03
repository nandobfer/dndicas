import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeRequest } from "../helpers/http"
import { importFresh } from "../helpers/module"

const permissions: string[] = []
let who: "player" | "noPermission" = "player"

vi.doMock("@/features/auth/server/actor", () => ({
    requirePermissionActor: vi.fn(async (permission: string) => {
        permissions.push(permission)
        const { DomainError } = await import("@/lib/api/route")
        if (who === "noPermission") throw new DomainError(403, "Você não tem permissão para esta ação.", "FORBIDDEN")
        return { id: "user-1", name: "Ana", role: "user", permissions: ["maddox.play"] }
    }),
}))

const service = {
    getJournalSummary: vi.fn(async () => ({ campaignId: "c1" })),
    listJournalNpcs: vi.fn(async () => ({ items: [], nextCursor: null })),
    listJournalMemories: vi.fn(async () => ({ items: [], nextCursor: null })),
    listJournalParty: vi.fn(async () => []),
    listJournalImages: vi.fn(async () => ({ items: [], nextCursor: null })),
    searchJournal: vi.fn(async () => ({ query: "taverna" })),
}
vi.doMock("@/features/maddox/server/journal", () => service)

const ctx = { params: Promise.resolve({ id: "c1" }) }
const base = "http://localhost/api/maddox/campaigns/c1/journal"
type GetRoute = { GET: (req: ReturnType<typeof makeRequest>, context: typeof ctx) => Promise<Response> }
const get = async (path: string, url: string) => (await importFresh<GetRoute>(path)).GET(makeRequest(url), { params: Promise.resolve({ id: "c1" }) })

describe("rotas do Diário da campanha (Maddox 9)", () => {
    beforeEach(() => {
        who = "player"
        permissions.length = 0
        Object.values(service).forEach((fn) => fn.mockClear())
    })

    it("sem maddox.play = 403 e o serviço não é chamado", async () => {
        who = "noPermission"
        const res = await get("@/app/api/maddox/campaigns/[id]/journal/search/route", `${base}/search?q=taverna`)
        expect(res.status).toBe(403)
        expect(service.searchJournal).not.toHaveBeenCalled()
        expect(permissions).toEqual(["maddox.play"])
    })

    it("repassam os parâmetros e o usuário efetivo, no formato ApiResponse", async () => {
        const summary = await get("@/app/api/maddox/campaigns/[id]/journal/route", base)
        expect(await summary.json()).toMatchObject({ success: true, data: { campaignId: "c1" } })
        expect(service.getJournalSummary).toHaveBeenCalledWith("c1", "user-1")

        await get("@/app/api/maddox/campaigns/[id]/journal/npcs/route", `${base}/npcs?cursor=abc`)
        expect(service.listJournalNpcs).toHaveBeenCalledWith("c1", { cursor: "abc" }, "user-1")

        await get("@/app/api/maddox/campaigns/[id]/journal/memories/route", `${base}/memories?kind=missao&status=concluida`)
        expect(service.listJournalMemories).toHaveBeenCalledWith("c1", { kind: "missao", status: "concluida", cursor: undefined }, "user-1")

        await get("@/app/api/maddox/campaigns/[id]/journal/images/route", `${base}/images?kind=retratos&cursor=abc`)
        expect(service.listJournalImages).toHaveBeenCalledWith("c1", { kind: "retratos", cursor: "abc" }, "user-1")
        await get("@/app/api/maddox/campaigns/[id]/journal/images/route", `${base}/images`)
        expect(service.listJournalImages).toHaveBeenLastCalledWith("c1", { kind: undefined, cursor: undefined }, "user-1")

        await get("@/app/api/maddox/campaigns/[id]/journal/party/route", `${base}/party`)
        expect(service.listJournalParty).toHaveBeenCalledWith("c1", "user-1")

        const search = await get("@/app/api/maddox/campaigns/[id]/journal/search/route", `${base}/search?q=tav%C3%A9rna`)
        expect(search.status).toBe(200)
        expect(service.searchJournal).toHaveBeenCalledWith("c1", { q: "tavérna" }, "user-1")
    })

    it("imagens (DND-22): sem maddox.play = 403 e o serviço não é chamado", async () => {
        who = "noPermission"
        const res = await get("@/app/api/maddox/campaigns/[id]/journal/images/route", `${base}/images`)
        expect(res.status).toBe(403)
        expect(service.listJournalImages).not.toHaveBeenCalled()
        expect(permissions).toEqual(["maddox.play"])
    })

    it("erro de validação do serviço vira 400 com a mensagem", async () => {
        service.searchJournal.mockImplementationOnce(async () => {
            const { DomainError } = await import("@/lib/api/route")
            throw new DomainError(400, "Digite ao menos 2 caracteres para buscar.", "VALIDATION_ERROR")
        })
        const res = await get("@/app/api/maddox/campaigns/[id]/journal/search/route", `${base}/search?q=a`)
        expect(res.status).toBe(400)
        expect(await res.json()).toMatchObject({ success: false, error: "Digite ao menos 2 caracteres para buscar." })
    })
})
