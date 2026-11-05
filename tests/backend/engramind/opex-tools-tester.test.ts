import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))

const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const { testEngramind } = await import("@/features/engramind/server/tester")
const { findOpexTool, toolMinRole } = await import("@/features/opex-agent/server/tools/registry")

let mongo: MongoMemoryServer | undefined

beforeAll(async () => {
    mongo = await startDb("engramind_tools_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
})

const ctx = { sessionId: "s1", actorId: "admin-1", scope: {} as never }
const run = (name: string, input: unknown) => findOpexTool(name)!.execute(input as never, ctx)
const tester = () => testEngramind({ emit: vi.fn(), signal: new AbortController().signal })

describe("ferramentas de memória do Agente Opex", () => {
    it("são só de administradores e usam o token do agente dndicas/opex", async () => {
        for (const name of ["search_memories", "get_memory", "create_memory", "list_memory_categories", "create_memory_category"]) expect(toolMinRole(findOpexTool(name)!)).toBe("admin")
        const fake = await configureEngramind()
        await runBootstrap("admin-1")
        const created = (await run("create_memory", { channel: "dndicas/opex/admin", text: "Confirme antes de excluir.", category: "PROJECT_RULES" })) as { id: string }
        expect(fake.state.memories.get(created.id)).toMatchObject({ channel: "dndicas/opex/admin", author: { agent: "dndicas/opex" } })
        // Os outros canais fixos são alcançados em manage, citando o canal.
        await run("create_memory", { channel: "dndicas/maddox", text: "Use nomes medievais." })
        const found = (await run("search_memories", { query: "nomes", channels: ["dndicas/maddox"] })) as { results: { channel: string }[] }
        expect(found.results).toEqual([expect.objectContaining({ channel: "dndicas/maddox" })])
        expect(await run("get_memory", { id: created.id })).toMatchObject({ text: "Confirme antes de excluir." })
        await expect(run("create_memory", { channel: "dndicas/maddox/campanhas/6650f1a2b3c4d5e6f7a8b9c0/jogadores", text: "x" })).rejects.toThrow()
    })

    it("cria a categoria que achar adequada (normalizada) e recusa conflito com mensagem pt-BR", async () => {
        const fake = await configureEngramind()
        await runBootstrap("admin-1")
        expect(await run("create_memory_category", { key: "glossário", label: "Glossário" })).toEqual({ ok: true, key: "GLOSSARIO", created: true })
        expect(await run("create_memory_category", { key: "GLOSSARIO", label: "Glossário" })).toEqual({ ok: true, key: "GLOSSARIO", created: false })
        await expect(run("create_memory_category", { key: "GLOSSARIO", label: "Outro" })).rejects.toThrow(/já existe com outro rótulo/)
        expect(((await run("list_memory_categories", {})) as { categories: { key: string }[] }).categories.map((item) => item.key)).toContain("GLOSSARIO")
        expect(fake.state.categories.filter((item) => item.key === "GLOSSARIO")).toHaveLength(1)
    })

    it("sem integração: erro acionável, sem lançar erro genérico", async () => {
        await expect(run("search_memories", { query: "x" })).rejects.toThrow(/integracoes\/engramind/)
    })
})

describe("teste de conexão", () => {
    it("vermelho sem configuração, fora do ar ou com token que não é de app", async () => {
        await expect(tester()).rejects.toThrow(/Configure a URL base/)
        const fake = await configureEngramind()
        fake.state.down = true
        await expect(tester()).rejects.toThrow(/fora do ar/)
        fake.state.down = false
        const admin = fake.admin()
        await configureEngramind({ fake, appToken: admin.secret })
        await expect(tester()).rejects.toThrow(/kind: app/)
    })

    it("amarelo antes da configuração automática; verde depois", async () => {
        await configureEngramind()
        expect(await tester()).toMatchObject({ status: "warn", message: expect.stringMatching(/configuração automática ainda não rodou.*categorias.*webhook não registrado/) })
        await runBootstrap("admin-1")
        expect(await tester()).toBe("Engramind disponível; rede do dndicas configurada")
    })
})
