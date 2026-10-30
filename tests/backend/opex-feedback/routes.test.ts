import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { DomainError } from "@/lib/api/route"
const mocks = vi.hoisted(() => ({ actor: vi.fn(), access: vi.fn(), dashboard: vi.fn() }))
vi.mock("@/features/auth/server/actor", () => ({ requireActor: mocks.actor }))
vi.mock("@/features/opex-feedback/server/access-service", () => ({ ensureOpexAccess: mocks.access }))
vi.mock("@/features/opex-feedback/server/dashboard-service", () => ({ getOpexDashboard: mocks.dashboard }))
import { POST } from "@/app/api/opex-feedback/access/route"
import { GET } from "@/app/api/opex-feedback/dashboard/route"
const context = { params: Promise.resolve({}) }
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ id: "u" }); mocks.access.mockResolvedValue({ access: { portalUrl: "https://opex/cliente?t=usr_test" }, token: "never-return", connection: {} }); mocks.dashboard.mockResolvedValue({ tasksActive: 0 }) })
describe("rotas Opex Feedback", () => {
    it("exige login antes de provisionar", async () => {
        mocks.actor.mockRejectedValue(new DomainError(401, "Faça login", "UNAUTHENTICATED"))
        const response = await POST(new NextRequest("http://localhost/api/opex-feedback/access", { method: "POST", body: "{}" }), context)
        expect(response.status).toBe(401); expect(mocks.access).not.toHaveBeenCalled()
    })
    it("valida corpo e recusa dados de identidade enviados pelo cliente", async () => {
        const response = await POST(new NextRequest("http://localhost/api/opex-feedback/access", { method: "POST", body: '{"userId":"other"}' }), context)
        expect(response.status).toBe(400); expect(mocks.access).not.toHaveBeenCalled()
    })
    it("retorna somente resumo, sem token de sessão, e impede cache", async () => {
        const response = await POST(new NextRequest("http://localhost/api/opex-feedback/access", { method: "POST", body: "{}" }), context)
        expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store")
        expect(await response.text()).not.toContain("never-return")
    })
    it("propaga erro de configuração em pt-BR", async () => {
        mocks.access.mockRejectedValue(new DomainError(409, "Configure o Opex", "OPEX_NOT_CONFIGURED"))
        const response = await POST(new NextRequest("http://localhost/api/opex-feedback/access", { method: "POST", body: "{}" }), context)
        expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: "OPEX_NOT_CONFIGURED" })
    })
    it("dashboard exige login e usa ator do servidor", async () => {
        const response = await GET(new NextRequest("http://localhost/api/opex-feedback/dashboard?from=2026-10-01&timeZone=UTC"), context)
        expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store")
        expect(mocks.dashboard).toHaveBeenCalledWith({ id: "u" }, { from: "2026-10-01", timeZone: "UTC" })
    })
})
