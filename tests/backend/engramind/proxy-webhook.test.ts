import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { DomainError } from "@/lib/api/route"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"
import { FAKE_APP_TOKEN, signWebhookBody } from "../../helpers/fake-engramind"

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
const recordAudit = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/audit/record", () => ({ recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
const permissions = vi.hoisted(() => ({ granted: new Set<string>(), logged: true }))
vi.mock("@/features/auth/server/actor", () => ({
    requirePermissionActor: vi.fn(async (permission: string) => {
        if (!permissions.logged) throw new DomainError(401, "Faça login para continuar.", "UNAUTHORIZED")
        if (!permissions.granted.has(permission)) throw new DomainError(403, "Você não tem permissão para esta operação.", "FORBIDDEN")
        return { id: "user-1", name: "Ana", role: "admin", permissions: [...permissions.granted] }
    }),
}))

const { handleProxy } = await import("@/features/engramind/server/proxy")
const { handleWebhook } = await import("@/features/engramind/server/webhook")
const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const { engramindConnection } = await import("@/features/engramind/server/client")
const { engramindBus } = await import("@/features/engramind/server/live")
const { EngramindContextCache } = await import("@/features/engramind/server/models")
const { proxyAccessOf, PROXY_READ_OPERATIONS } = await import("@/features/engramind/proxy-policy")

let mongo: MongoMemoryServer | undefined

beforeAll(async () => {
    mongo = await startDb("engramind_proxy_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
    permissions.granted = new Set(["memories.view"])
    permissions.logged = true
})

const call = (method: string, path: string, body?: unknown) =>
    handleProxy(new Request(`http://dndicas.test/api/engramind/${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}) }))

describe("proxy da rede (/api/engramind/[...path])", () => {
    it("lê com memories.view e nunca devolve o token do app", async () => {
        const fake = await configureEngramind()
        await runBootstrap("admin-1")
        const response = await call("GET", "channels")
        expect(response.status).toBe(200)
        const text = await response.text()
        expect(text).toContain("dndicas/opex/global")
        expect(text).not.toContain(FAKE_APP_TOKEN)
        expect(fake.state.calls.at(-1)?.token).toBe(`Bearer ${FAKE_APP_TOKEN}`)
    })

    it("sem login → 401; sem memories.view → 403", async () => {
        await configureEngramind()
        permissions.logged = false
        expect((await call("GET", "channels")).status).toBe(401)
        permissions.logged = true
        permissions.granted = new Set()
        expect((await call("GET", "channels")).status).toBe(403)
    })

    it("mutação de memória, categoria, agente, token, assinatura, canal e webhook → 403 ENGRAMIND_READ_ONLY sem chamar o Engramind", async () => {
        const fake = await configureEngramind()
        permissions.granted = new Set(["memories.view", "memories.edit"])
        fake.state.calls.length = 0
        const blocked: [string, string][] = [
            ["POST", "memories"],
            ["PATCH", "memories/m_1"],
            ["DELETE", "memories/m_1"],
            ["POST", "memories/m_1/archive"],
            ["POST", "memories/m_1/move"],
            ["POST", "categories"],
            ["POST", "agents"],
            ["POST", "tokens"],
            ["POST", "tokens/tk_1/revoke"],
            ["POST", "subscriptions"],
            ["PATCH", "channels/dndicas%2Fmaddox"],
            ["PUT", "apps/dndicas/webhook"],
            ["GET", "tokens"],
            ["GET", "settings"],
        ]
        for (const [method, path] of blocked) {
            const response = await call(method, path, method === "GET" || method === "DELETE" ? undefined : {})
            expect(response.status, `${method} ${path}`).toBe(403)
            expect(await response.json()).toMatchObject({ code: "ENGRAMIND_READ_ONLY" })
        }
        expect(fake.state.calls).toHaveLength(0)
    })

    it("importar exige memories.edit e é auditado sem os textos", async () => {
        await configureEngramind()
        await runBootstrap("admin-1")
        const body = { channel: "dndicas/maddox", memories: [{ text: "Texto secreto de importação" }] }
        expect((await call("POST", "memories/import", body)).status).toBe(403)
        permissions.granted = new Set(["memories.view", "memories.edit"])
        const response = await call("POST", "memories/import", body)
        expect(response.status).toBe(200)
        const audit = (recordAudit.mock.calls as unknown as [{ entidadeId: string }][]).map((args) => args[0]).find((item) => item.entidadeId === "import_memories")
        expect(audit).toMatchObject({ depois: { canal: "dndicas/maddox", memorias: 1 } })
        expect(JSON.stringify(recordAudit.mock.calls)).not.toContain("Texto secreto")
    })

    it("a lista de permissão só libera leituras e a importação", () => {
        expect(proxyAccessOf("list_memories")).toBe("view")
        expect(proxyAccessOf("import_memories")).toBe("edit")
        for (const operation of ["create_memory", "update_memory", "issue_token", "subscribe", "create_category", "update_app_webhook", "list_tokens", null]) expect(proxyAccessOf(operation)).toBe("blocked")
        expect(PROXY_READ_OPERATIONS).not.toContain("issue_token")
    })

    it("integração não configurada → 409 ENGRAMIND_NOT_CONFIGURED (estado vazio da página)", async () => {
        const response = await call("GET", "channels")
        expect(response.status).toBe(409)
        expect(await response.json()).toMatchObject({ code: "ENGRAMIND_NOT_CONFIGURED" })
    })
})

describe("webhook (/api/engramind/webhook)", () => {
    async function signed(event: Record<string, unknown>, secret?: string) {
        const body = JSON.stringify(event)
        const key = secret ?? (await engramindConnection())!.webhookSecret!
        return handleWebhook(new Request("http://dndicas.test/api/engramind/webhook", { method: "POST", body, headers: { "Engramind-Signature": signWebhookBody(body, key) } }))
    }

    it("assinatura inválida → 401 sem corpo", async () => {
        await configureEngramind()
        await runBootstrap("admin-1")
        const response = await signed({ id: "ev_1", type: "memory.created", channel: "dndicas/maddox" }, "segredo-errado-com-mais-de-32-caracteres-aqui")
        expect(response.status).toBe(401)
        expect(await response.text()).toBe("")
    })

    it("evento válido vai ao SSE (só ids e tipos), suja o contexto e o repetido é descartado", async () => {
        await configureEngramind()
        await runBootstrap("admin-1")
        await EngramindContextCache.create({ _id: "k1", identity: "maddox", channels: ["dndicas/maddox"], content: "x", version: "v1", dirty: false, fetchedAt: new Date() })
        const live: unknown[] = []
        const unsubscribe = engramindBus().subscribe((event) => live.push(event))
        const event = { id: "ev_2", type: "memory.updated", channel: "dndicas/maddox", memory_ids: ["m_1"], text: "nunca vai ao navegador" }
        expect((await signed(event)).status).toBe(200)
        const repeated = await signed(event)
        expect(await repeated.json()).toMatchObject({ duplicate: true })
        unsubscribe()
        expect(live).toHaveLength(1)
        expect(JSON.stringify(live)).not.toContain("nunca vai ao navegador")
        await vi.waitFor(async () => expect((await EngramindContextCache.findById("k1").lean())?.dirty).toBe(true))
    })
})
