import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { DEFAULT_UNIVERSE_LAYOUT, formatUniverseLayoutJson, parseUniverseLayoutJson, type UniverseLayoutConfig } from "@engramind/client"
import { DomainError } from "@/lib/api/route"
import { clearDb, startDb, stopDb } from "./helpers"

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
const recordAudit = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/audit/record", () => ({ recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR" } }))
const publishToChannels = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
const permissions = vi.hoisted(() => ({ granted: new Set<string>(), logged: true }))
vi.mock("@/features/auth/server/actor", () => ({
    requirePermissionActor: vi.fn(async (permission: string) => {
        if (!permissions.logged) throw new DomainError(401, "Faça login para continuar.", "UNAUTHORIZED")
        if (!permissions.granted.has(permission)) throw new DomainError(403, "Você não tem permissão para esta operação.", "FORBIDDEN")
        return { id: "user-1", name: "Ana", role: "admin", permissions: [...permissions.granted] }
    }),
}))
vi.mock("@/features/perfix/server/access", () => ({
    requestAccess: vi.fn(async () => (permissions.logged ? { effective: permissions.granted } : null)),
    denied: () => new DomainError(403, "Você não tem permissão para esta operação.", "FORBIDDEN"),
}))

const { getUniverseLayout, readUniverseLayoutForPage, resetUniverseLayout, saveUniverseLayout } = await import("@/features/engramind/server/universe-layout")
const { engramindBus } = await import("@/features/engramind/server/live")
const { ENGRAMIND_STATE_ID, EngramindState } = await import("@/features/engramind/server/models")
const route = await import("@/app/api/engramind/universe-layout/route")

vi.setConfig({ testTimeout: 20_000 })

/** JSON como a aba Visualização do Opex exporta (`formatUniverseLayoutJson`: `$schema`, `version` e todos os campos). */
const OPEX_EXPORT = `{
  "$schema": "engramind-universe-layout",
  "version": 1,
  "layout": "spiral",
  "order": "newest-outside",
  "orderBy": "uses",
  "grouping": "channel",
  "balance": "fill",
  "firstRadius": 120,
  "ringGap": 84,
  "slot": 52,
  "minPerRing": 8,
  "ringRotationDeg": 20,
  "spiralSpacing": 60,
  "spiralAngleDeg": 137.508,
  "angleJitter": 30,
  "radiusJitter": 20,
  "jitterSeed": 42,
  "avoidOverlap": true,
  "minDistance": 40,
  "particleMinPx": 8,
  "particleMaxPx": 40
}`

const opexConfig = (): UniverseLayoutConfig => {
    const parsed = parseUniverseLayoutJson(OPEX_EXPORT)
    if (!parsed.ok) throw new Error("fixture inválida")
    return parsed.config
}

const call = async (method: "GET" | "PUT" | "DELETE", body?: string) => {
    const handler = route[method] as (req: Request, context: { params: Promise<Record<string, never>> }) => Promise<Response>
    const request = new Request("http://localhost/api/engramind/universe-layout", { method, ...(body !== undefined ? { body, headers: { "Content-Type": "application/json" } } : {}) })
    const response = await handler(request as never, { params: Promise.resolve({}) })
    return { status: response.status, json: (await response.json()) as { success: boolean; data?: { config: UniverseLayoutConfig; isDefault: boolean; updatedAt: string | null }; code?: string; details?: { path: string; message: string }[] } }
}

let mongo: MongoMemoryServer | undefined
beforeAll(async () => {
    mongo = await startDb("engramind_universe_layout_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    recordAudit.mockClear()
    publishToChannels.mockClear()
    permissions.granted = new Set(["memories.view", "integrations.engramind.edit"])
    permissions.logged = true
})

describe("layout dos universos (serviço)", () => {
    it("sem nada gravado vale o padrão da lib (e a página recebe null)", async () => {
        expect(await getUniverseLayout()).toEqual({ config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null })
        expect(await readUniverseLayoutForPage()).toBeNull()
    })

    it("grava o JSON exportado do Opex, audita antes/depois e avisa a rede (SSE) e a aba (Pusher)", async () => {
        const events: string[] = []
        const unsubscribe = engramindBus().subscribe((event) => events.push(event.type))
        const saved = await saveUniverseLayout(opexConfig(), "user-1")
        unsubscribe()
        expect(saved).toMatchObject({ config: opexConfig(), isDefault: false })
        expect(await getUniverseLayout()).toMatchObject({ config: opexConfig(), isDefault: false, updatedAt: saved.updatedAt })
        expect(await readUniverseLayoutForPage()).toEqual(opexConfig())
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "Engramind", entidadeId: "universe-layout", acao: "ATUALIZAR", depois: expect.objectContaining({ layout: "spiral" }), antes: expect.objectContaining({ layout: "rings" }) }))
        expect(events).toEqual(["universe-layout.updated"])
        expect(publishToChannels).toHaveBeenCalledWith(["private-integration-engramind"], "engramind-updated", { type: "universe-layout" })
    })

    it("o JSON exportado pelo dndicas volta ao Opex sem transformação (mesmo $schema, version e campos)", async () => {
        await saveUniverseLayout(opexConfig(), "user-1")
        const exported = formatUniverseLayoutJson((await getUniverseLayout()).config)
        expect(JSON.parse(exported)).toEqual(JSON.parse(OPEX_EXPORT))
        expect(parseUniverseLayoutJson(exported)).toEqual({ ok: true, config: opexConfig() })
    })

    it("só os campos alterados: os ausentes assumem o padrão", async () => {
        const saved = await saveUniverseLayout({ layout: "spiral", ringGap: 84 }, "user-1")
        expect(saved.config).toEqual({ ...DEFAULT_UNIVERSE_LAYOUT, layout: "spiral", ringGap: 84 })
    })

    it("campo desconhecido ou fora do intervalo é recusado com erros em pt-BR por campo e nada é gravado", async () => {
        await saveUniverseLayout({ layout: "spiral" }, "user-1")
        recordAudit.mockClear()
        const error = await saveUniverseLayout({ cor: "azul", ringGap: 9999 }, "user-1").catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(DomainError)
        expect((error as DomainError).status).toBe(400)
        expect((error as DomainError).code).toBe("UNIVERSE_LAYOUT_INVALID")
        const details = (error as DomainError).details as { path: string; message: string }[]
        expect(details).toEqual(expect.arrayContaining([{ path: "cor", message: 'Campo desconhecido: "cor"' }, expect.objectContaining({ path: "ringGap" })]))
        expect((await getUniverseLayout()).config.layout).toBe("spiral")
        expect(recordAudit).not.toHaveBeenCalled()
    })

    it("gravação antiga inválida no banco cai no padrão", async () => {
        await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { universeLayout: { config: { layout: "hexagono" }, updatedAt: new Date() } } }, { upsert: true })
        expect(await getUniverseLayout()).toMatchObject({ isDefault: true, config: DEFAULT_UNIVERSE_LAYOUT })
    })

    it("falha ao ler o banco: a página recebe null (padrão) sem lançar", async () => {
        const spy = vi.spyOn(EngramindState, "findById").mockImplementationOnce(() => {
            throw new Error("banco fora")
        })
        await expect(readUniverseLayoutForPage()).resolves.toBeNull()
        spy.mockRestore()
    })

    it("restaurar apaga a configuração, audita e avisa", async () => {
        await saveUniverseLayout(opexConfig(), "user-1")
        publishToChannels.mockClear()
        expect(await resetUniverseLayout("user-1")).toEqual({ config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null })
        expect(await getUniverseLayout()).toMatchObject({ isDefault: true })
        expect(publishToChannels).toHaveBeenCalledTimes(1)
    })
})

describe("rota /api/engramind/universe-layout", () => {
    it("GET com memories.view ou integrations.engramind.view; sem nenhuma, 403; sem login, 401", async () => {
        permissions.granted = new Set(["memories.view"])
        expect((await call("GET")).status).toBe(200)
        permissions.granted = new Set(["integrations.engramind.view"])
        expect((await call("GET")).json.data).toMatchObject({ isDefault: true })
        permissions.granted = new Set(["maddox.play"])
        expect((await call("GET")).status).toBe(403)
        permissions.logged = false
        expect((await call("GET")).status).toBe(401)
    })

    it("PUT grava e aplica; erro de validação devolve 400 com os erros por campo", async () => {
        const saved = await call("PUT", JSON.stringify(opexConfig()))
        expect(saved.status).toBe(200)
        expect(saved.json.data?.config).toEqual(opexConfig())
        const refused = await call("PUT", JSON.stringify({ desconhecido: 1 }))
        expect(refused.status).toBe(400)
        expect(refused.json.code).toBe("UNIVERSE_LAYOUT_INVALID")
        expect(refused.json.details).toEqual([{ path: "desconhecido", message: 'Campo desconhecido: "desconhecido"' }])
        expect((await call("PUT", "{nao-json")).status).toBe(400)
        expect((await getUniverseLayout()).config).toEqual(opexConfig())
    })

    it("PUT e DELETE exigem integrations.engramind.edit (memories.edit não basta)", async () => {
        permissions.granted = new Set(["memories.view", "memories.edit"])
        expect((await call("PUT", JSON.stringify({ layout: "spiral" }))).status).toBe(403)
        expect((await call("DELETE")).status).toBe(403)
        expect((await getUniverseLayout()).isDefault).toBe(true)
    })

    it("DELETE volta ao padrão", async () => {
        await saveUniverseLayout(opexConfig(), "user-1")
        const reset = await call("DELETE")
        expect(reset.status).toBe(200)
        expect(reset.json.data).toEqual({ config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null })
    })
})
