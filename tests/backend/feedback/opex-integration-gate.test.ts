import { describe, expect, it, vi } from "vitest"
import { assertOpexIntegrationAvailable, isOpexIntegrationAvailable, OPEX_INTEGRATION_UNAVAILABLE_CODE } from "@/features/feedback/services/opex-integration-gate"
import { makeJsonRequest, readJson } from "../helpers/http"
import { importFresh } from "../helpers/module"

describe("fluxo agêntico dos feedbacks bloqueado pela integração Opex", () => {
    it("fica indisponível enquanto a integração Opex está em desenvolvimento", () => {
        expect(isOpexIntegrationAvailable()).toBe(false)
        expect(() => assertOpexIntegrationAvailable()).toThrow(/integração "Opex"/)
    })

    it.each(["plan", "implement", "iterate", "approve"])("POST /api/feedback/[id]/%s responde 409 para administradores", async (action) => {
        vi.doMock("@/core/auth/server", () => ({ currentUser: vi.fn().mockResolvedValue({ id: "admin-1", publicMetadata: { role: "admin" } }) }))
        const mod = await importFresh<{ POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> }>(`@/app/api/feedback/[id]/${action}/route`)
        const response = await mod.POST(makeJsonRequest(`http://localhost/api/feedback/abc/${action}`, { method: "POST", body: JSON.stringify({ model: "x", message: "y" }) }), { params: Promise.resolve({ id: "abc" }) })
        const payload = await readJson<{ code: string }>(response)
        expect(response.status).toBe(409)
        expect(payload.code).toBe(OPEX_INTEGRATION_UNAVAILABLE_CODE)
    })

    it("mantém o 401/403 antes do bloqueio para quem não é administrador", async () => {
        vi.doMock("@/core/auth/server", () => ({ currentUser: vi.fn().mockResolvedValue(null) }))
        const mod = await importFresh<{ POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> }>("@/app/api/feedback/[id]/plan/route")
        const response = await mod.POST(makeJsonRequest("http://localhost/api/feedback/abc/plan", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "abc" }) })
        expect(response.status).toBe(401)
    })
})
