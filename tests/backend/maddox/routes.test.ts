import { describe, expect, it, vi } from "vitest"
import { makeJsonRequest, makeRequest } from "../helpers/http"
import { importFresh } from "../helpers/module"

const admin = { id: "admin-1", name: "Ana", role: "admin" as const }
/** Permissões exigidas pelas rotas (Perfix: ver para leitura, editar para escrita). */
const permissions: string[] = []

function mockActor(result: "admin" | "user" | "anonymous") {
    vi.doMock("@/features/auth/server/actor", () => ({
        requireAdminActor: vi.fn(async (permission: string) => {
            permissions.push(permission)
            // Importado aqui: o `importFresh` recria o módulo e o `withRoute` só reconhece a classe nova.
            const { DomainError } = await import("@/lib/api/route")
            if (result === "anonymous") throw new DomainError(401, "Faça login para continuar.", "UNAUTHORIZED")
            if (result === "user") throw new DomainError(403, "Acesso restrito a administradores.", "FORBIDDEN")
            return admin
        }),
    }))
}

const settingsService = () => {
    const getMaddoxSettings = vi.fn(async () => ({ settings: { enabled: false }, isDefault: true }))
    const saveMaddoxSettings = vi.fn(async () => ({ settings: { enabled: false }, isDefault: false }))
    vi.doMock("@/features/maddox/server/settings", () => ({ getMaddoxSettings, saveMaddoxSettings }))
    return { getMaddoxSettings, saveMaddoxSettings }
}

describe("rotas do Agente Maddox", () => {
    it("quem não é administrador recebe 401/403", async () => {
        permissions.length = 0
        for (const [who, status] of [["anonymous", 401], ["user", 403]] as const) {
            mockActor(who)
            const { getMaddoxSettings } = settingsService()
            const route = await importFresh<typeof import("@/app/api/ai/features/maddox/route")>("@/app/api/ai/features/maddox/route")
            const response = await route.GET(makeRequest("http://localhost/api/ai/features/maddox"), { params: Promise.resolve({}) } as never)
            expect(response.status).toBe(status)
            expect(getMaddoxSettings).not.toHaveBeenCalled()
        }
    })

    it("PUT inválido responde 400; válido salva com o administrador", async () => {
        mockActor("admin")
        const { saveMaddoxSettings } = settingsService()
        const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
        const route = await importFresh<typeof import("@/app/api/ai/features/maddox/route")>("@/app/api/ai/features/maddox/route")
        const bad = await route.PUT(makeJsonRequest("http://localhost/api/ai/features/maddox", { method: "PUT", body: JSON.stringify({ enabled: "sim" }) }), { params: Promise.resolve({}) } as never)
        expect(bad.status).toBe(400)
        const good = await route.PUT(makeJsonRequest("http://localhost/api/ai/features/maddox", { method: "PUT", body: JSON.stringify(DEFAULT_MADDOX_SETTINGS) }), { params: Promise.resolve({}) } as never)
        expect(good.status).toBe(200)
        expect(saveMaddoxSettings).toHaveBeenCalledWith(DEFAULT_MADDOX_SETTINGS, "admin-1")
    })

    it("roteiros: tipo desconhecido 404, versão específica e gravação", async () => {
        mockActor("admin")
        const getMaddoxScriptVersion = vi.fn(async () => ({ version: 2 }))
        const saveMaddoxScript = vi.fn(async () => ({ current: { version: 3 } }))
        vi.doMock("@/features/maddox/server/scripts", () => ({ getMaddoxScriptState: vi.fn(), getMaddoxScriptVersion, saveMaddoxScript }))
        const route = await importFresh<typeof import("@/app/api/ai/features/maddox/scripts/[kind]/route")>("@/app/api/ai/features/maddox/scripts/[kind]/route")
        const unknown = await route.GET(makeRequest("http://localhost/api/ai/features/maddox/scripts/combate"), { params: Promise.resolve({ kind: "combate" }) })
        expect(unknown.status).toBe(404)
        const version = await route.GET(makeRequest("http://localhost/api/ai/features/maddox/scripts/scenario?version=2"), { params: Promise.resolve({ kind: "scenario" }) })
        expect(version.status).toBe(200)
        expect(getMaddoxScriptVersion).toHaveBeenCalledWith("scenario", 2)
        const body = { guide: "Guia", topics: [{ id: "a", text: "Tom", active: true }], notes: "", version: 2 }
        const saved = await route.PUT(makeJsonRequest("http://localhost/api/ai/features/maddox/scripts/character", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ kind: "character" }) })
        expect(saved.status).toBe(200)
        expect(saveMaddoxScript).toHaveBeenCalledWith("character", body, "admin-1")
    })

    it("avatar: persona curta 400; gerado devolve a URL", async () => {
        mockActor("admin")
        const generateMaddoxAvatar = vi.fn(async () => ({ url: "/api/files/x.png" }))
        vi.doMock("@/features/maddox/server/avatar", () => ({ generateMaddoxAvatar }))
        const route = await importFresh<typeof import("@/app/api/ai/features/maddox/avatar/route")>("@/app/api/ai/features/maddox/avatar/route")
        const bad = await route.POST(makeJsonRequest("http://localhost/api/ai/features/maddox/avatar", { method: "POST", body: JSON.stringify({ persona: "x" }) }), { params: Promise.resolve({}) } as never)
        expect(bad.status).toBe(400)
        const ok = await route.POST(makeJsonRequest("http://localhost/api/ai/features/maddox/avatar", { method: "POST", body: JSON.stringify({ persona: "Mestre sábio" }) }), { params: Promise.resolve({}) } as never)
        expect(ok.status).toBe(200)
        expect(await ok.json()).toMatchObject({ data: { url: "/api/files/x.png" } })
        expect(generateMaddoxAvatar).toHaveBeenCalledWith("Mestre sábio", "admin-1")
    })

    it("sessões: excluir repassa o id e o administrador", async () => {
        mockActor("admin")
        const deleteMaddoxSession = vi.fn(async () => ({ deleted: true }))
        vi.doMock("@/features/maddox/server/opencode-sessions", () => ({ deleteMaddoxSession, listMaddoxSessions: vi.fn(async () => []) }))
        const route = await importFresh<typeof import("@/app/api/ai/features/maddox/opencode-sessions/[id]/route")>("@/app/api/ai/features/maddox/opencode-sessions/[id]/route")
        const response = await route.DELETE(makeRequest("http://localhost/api/ai/features/maddox/opencode-sessions/abc", { method: "DELETE" }), { params: Promise.resolve({ id: "abc" }) })
        expect(response.status).toBe(200)
        expect(deleteMaddoxSession).toHaveBeenCalledWith("abc", "admin-1")
    })

    it("as rotas exigem as permissões de IA do Perfix (ver/editar)", async () => {
        permissions.length = 0
        mockActor("admin")
        const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
        settingsService()
        vi.doMock("@/features/maddox/server/scripts", () => ({ getMaddoxScriptState: vi.fn(), getMaddoxScriptVersion: vi.fn(async () => ({ version: 0 })), saveMaddoxScript: vi.fn(async () => ({})) }))
        vi.doMock("@/features/maddox/server/avatar", () => ({ generateMaddoxAvatar: vi.fn(async () => ({ url: "/x.png" })) }))
        vi.doMock("@/features/maddox/server/opencode-sessions", () => ({ deleteMaddoxSession: vi.fn(async () => ({ deleted: true })), listMaddoxSessions: vi.fn(async () => []) }))
        const settingsRoute = await importFresh<typeof import("@/app/api/ai/features/maddox/route")>("@/app/api/ai/features/maddox/route")
        const scriptRoute = await importFresh<typeof import("@/app/api/ai/features/maddox/scripts/[kind]/route")>("@/app/api/ai/features/maddox/scripts/[kind]/route")
        const avatarRoute = await importFresh<typeof import("@/app/api/ai/features/maddox/avatar/route")>("@/app/api/ai/features/maddox/avatar/route")
        const sessionsRoute = await importFresh<typeof import("@/app/api/ai/features/maddox/opencode-sessions/route")>("@/app/api/ai/features/maddox/opencode-sessions/route")
        const sessionRoute = await importFresh<typeof import("@/app/api/ai/features/maddox/opencode-sessions/[id]/route")>("@/app/api/ai/features/maddox/opencode-sessions/[id]/route")

        await settingsRoute.GET(makeRequest("http://localhost/api/ai/features/maddox"), { params: Promise.resolve({}) } as never)
        await settingsRoute.PUT(makeJsonRequest("http://localhost/api/ai/features/maddox", { method: "PUT", body: JSON.stringify(DEFAULT_MADDOX_SETTINGS) }), { params: Promise.resolve({}) } as never)
        await sessionsRoute.GET(makeRequest("http://localhost/api/ai/features/maddox/opencode-sessions"), { params: Promise.resolve({}) } as never)
        await scriptRoute.GET(makeRequest("http://localhost/api/ai/features/maddox/scripts/scenario"), { params: Promise.resolve({ kind: "scenario" }) })
        await scriptRoute.PUT(makeJsonRequest("http://localhost/api/ai/features/maddox/scripts/scenario", { method: "PUT", body: JSON.stringify({ guide: "G", topics: [], notes: "", version: 0 }) }), { params: Promise.resolve({ kind: "scenario" }) })
        await avatarRoute.POST(makeJsonRequest("http://localhost/api/ai/features/maddox/avatar", { method: "POST", body: JSON.stringify({ persona: "Mestre sábio" }) }), { params: Promise.resolve({}) } as never)
        await sessionRoute.DELETE(makeRequest("http://localhost/api/ai/features/maddox/opencode-sessions/abc", { method: "DELETE" }), { params: Promise.resolve({ id: "abc" }) })

        expect(permissions).toEqual([
            "integrations.ai.view",
            "integrations.ai.edit",
            "integrations.ai.view",
            "integrations.ai.view",
            "integrations.ai.edit",
            "integrations.ai.edit",
            "integrations.ai.edit",
        ])
    })
})
