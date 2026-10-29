import { describe, expect, it, vi } from "vitest"
import { makeRequest } from "../helpers/http"
import { importFresh } from "../helpers/module"

const visitor = { kind: "anonymous" as const, anonymousId: "11111111-1111-4111-8111-111111111111" }
const user = { kind: "user" as const, actor: { id: "user-1", name: "Ana", role: "user" as const } }

function mockScope(scope: unknown) {
    vi.doMock("@/features/opex-agent/server/scope", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@/features/opex-agent/server/scope")>()),
        requestOpexScope: vi.fn(async () => scope),
    }))
    vi.doMock("@/features/opex-agent/server/settings", () => ({ loadOpexSettings: vi.fn(async () => ({ settings: { anonymous: { enabled: true }, files: { maxPerMessage: 5, maxSizeMb: 10 } } })) }))
}

const ctx = { params: Promise.resolve({ id: "65f000000000000000000001" }) }

describe("rotas de arquivos do Agente Opex", () => {
    it("visitante não lê nem envia arquivos (403)", async () => {
        mockScope(visitor)
        const opexFileContent = vi.fn()
        vi.doMock("@/features/opex-agent/server/files", () => ({ opexFileContent, deletePendingOpexFile: vi.fn(), completeOpexFile: vi.fn(), reserveOpexFile: vi.fn() }))
        const content = await importFresh<typeof import("@/app/api/opex/files/[id]/route")>("@/app/api/opex/files/[id]/route")
        const response = await content.GET(makeRequest("http://localhost/api/opex/files/65f000000000000000000001"), ctx)
        expect(response.status).toBe(403)
        expect(opexFileContent).not.toHaveBeenCalled()
    })

    it("usuário logado recebe o conteúdo pelo escopo da própria sessão", async () => {
        mockScope(user)
        const opexFileContent = vi.fn(async () => new Response("ok", { headers: { "X-Content-Type-Options": "nosniff" } }))
        vi.doMock("@/features/opex-agent/server/files", () => ({ opexFileContent, deletePendingOpexFile: vi.fn(), completeOpexFile: vi.fn(), reserveOpexFile: vi.fn() }))
        const content = await importFresh<typeof import("@/app/api/opex/files/[id]/route")>("@/app/api/opex/files/[id]/route")
        const response = await content.GET(makeRequest("http://localhost/api/opex/files/65f000000000000000000001?download=1"), ctx)
        expect(response.status).toBe(200)
        expect(opexFileContent).toHaveBeenCalledWith("65f000000000000000000001", { download: true, range: undefined }, user)
    })
})
