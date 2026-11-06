import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
const warn = vi.hoisted(() => vi.fn())
vi.mock("@/lib/logger", async (importOriginal) => {
    const real = (await importOriginal()) as typeof import("@/lib/logger")
    return { ...real, loggerFor: (bindings: Record<string, unknown>) => (bindings.feature === "engramind" ? { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn } : real.loggerFor(bindings)) }
})

const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const { agentMemoryBlock, getAgentMemoryContext, markContextDirty } = await import("@/features/engramind/server/memory-context")
const { resetEngramindLazyForTests } = await import("@/features/engramind/server/client")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer | undefined

beforeAll(async () => {
    mongo = await startDb("engramind_context_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
})

async function seed() {
    const fake = await configureEngramind()
    await runBootstrap("admin-1")
    const admin = fake.admin()
    const add = (channel: string, text: string) => fake.fetch("https://engramind.test/v1/memories", { method: "POST", headers: { Authorization: `Bearer ${admin.secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ channel, text }) })
    await add("dndicas/opex/global", "Responda em pt-BR.")
    await add("dndicas/opex/admin", "Só para administradores.")
    await add("dndicas/opex/user", "Só para usuários.")
    await add("dndicas/image-generator", "Evite fundos brancos.")
    await add("dndicas/maddox", "Descreva com os cinco sentidos.")
    return fake
}

describe("contexto das memórias dos agentes", () => {
    it("cada consumidor recebe os próprios canais; o Agente Opex conforme o papel do turno", async () => {
        await seed()
        const admin = await agentMemoryBlock("opex", "admin")
        expect(admin).toContain("Responda em pt-BR.")
        expect(admin).toContain("Só para administradores.")
        expect(admin).not.toContain("Só para usuários.")
        const user = await agentMemoryBlock("opex", "user")
        expect(user).toContain("Só para usuários.")
        expect(user).not.toContain("Só para administradores.")
        expect(await agentMemoryBlock("opex", "anonymous")).toContain("Só para usuários.")
        expect(await agentMemoryBlock("image-generator")).toBe("## Memórias\n- [PROJECT_RULES] Evite fundos brancos.")
        expect(await agentMemoryBlock("maddox")).toContain("cinco sentidos")
        expect(await agentMemoryBlock("entity-import")).toBe("")
    })

    it("usa o token do agente e manda If-None-Match na releitura (304 reaproveita o bloco)", async () => {
        const fake = await seed()
        const first = await getAgentMemoryContext("image-generator", ["dndicas/image-generator"])
        fake.state.calls.length = 0
        const second = await getAgentMemoryContext("image-generator", ["dndicas/image-generator"])
        expect(second).toMatchObject({ source: "live", block: first.block })
        const call = fake.state.calls.find((item) => item.path === "/v1/context")!
        const token = [...fake.state.tokens.values()].find((item) => item.agent === "dndicas/image-generator")!
        expect(call.token).toBe(`Bearer ${token.secret}`)
    })

    it("com o Engramind fora do ar usa o último bloco em cache, com warn; sem cache segue sem memórias", async () => {
        const fake = await seed()
        const live = await getAgentMemoryContext("maddox", ["dndicas/maddox"])
        fake.state.down = true
        const cached = await getAgentMemoryContext("maddox", ["dndicas/maddox"])
        expect(cached).toMatchObject({ source: "cache", block: live.block })
        expect(warn).toHaveBeenCalledWith(expect.objectContaining({ identity: "maddox", cache: true }), expect.stringContaining("usa o cache"))
        const none = await getAgentMemoryContext("entity-understanding", ["dndicas/entity-understanding"])
        expect(none).toMatchObject({ source: "none", block: "" })
        await expect(agentMemoryBlock("entity-understanding")).resolves.toBe("")
    })

    it("nunca lê agent_memories e nunca lança, mesmo sem integração configurada", async () => {
        await mongoose.connection.db!.collection("agent_memories").insertOne({ agentId: "maddox", texto: "LEGADO", resumo: "x" })
        await expect(agentMemoryBlock("maddox")).resolves.toBe("")
        await seed()
        expect(await agentMemoryBlock("maddox")).not.toContain("LEGADO")
    })

    it("sem token gravado o turno espera no máximo o prazo do provisionamento sob demanda", async () => {
        const fake = await configureEngramind()
        resetEngramindLazyForTests({ waitMs: 50 })
        const original = fake.fetch
        vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
            await new Promise((resolve) => setTimeout(resolve, 200))
            return original(input as string, init)
        }) as typeof fetch)
        const started = Date.now()
        const result = await getAgentMemoryContext("opex", ["dndicas/opex/global"])
        expect(Date.now() - started).toBeLessThan(1000)
        expect(result.source).toBe("none")
        // O provisionamento continua em segundo plano: espera terminar para não vazar no próximo teste.
        vi.stubGlobal("fetch", original)
        await (globalThis as typeof globalThis & { __engramindBootstrap?: Promise<unknown> | null }).__engramindBootstrap
    }, 20_000)

    it("o webhook marca o bloco do canal como sujo (a próxima leitura vem sem If-None-Match)", async () => {
        const fake = await seed()
        await getAgentMemoryContext("maddox", ["dndicas/maddox"])
        await markContextDirty("dndicas/maddox")
        fake.state.calls.length = 0
        await getAgentMemoryContext("maddox", ["dndicas/maddox"])
        expect(fake.state.calls.find((item) => item.path === "/v1/context")).toBeTruthy()
    })
})
