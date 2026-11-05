import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"
import type { FakeEngramind } from "../../helpers/fake-engramind"

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
const curator = vi.hoisted(() => ({ answer: (prompt: string): string => prompt, fail: null as null | ((prompt: string) => boolean), hang: false }))
vi.mock("@/lib/ai/stream", () => ({
    streamAi: async function* (request: { prompt: string; signal?: AbortSignal }) {
        if (curator.hang) await new Promise((_, reject) => request.signal?.addEventListener("abort", () => reject(new Error("abortado"))))
        if (curator.fail?.(request.prompt)) {
            yield { type: "error", message: "Provedor fora do ar" }
            return
        }
        yield { type: "delta", text: curator.answer(request.prompt) }
    },
}))

const migration = await import("@/features/engramind/server/migration")
const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const { MemoryMigration, MIGRATION_ID } = await import("@/features/engramind/server/migration-models")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer | undefined
let fake: FakeEngramind

beforeAll(async () => {
    mongo = await startDb("engramind_migration_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
    migration.resetMigrationRuntimeForTests()
    migration.setCuratorTimeoutForTests(null)
    curator.fail = null
    curator.hang = false
    fake = await configureEngramind()
    await runBootstrap("admin-1")
})

const legacy = () => mongoose.connection.db!.collection("agent_memories")
const seedLegacy = async () => {
    const at = new Date("2026-01-01T00:00:00Z")
    await legacy().insertMany([
        { agentId: "opex-global", texto: "Responda em pt-BR.", resumo: "pt-BR", createdBy: "u1", updatedBy: "u1", createdAt: at, updatedAt: at },
        { agentId: "opex-global", texto: "Teste 123", resumo: "teste", createdBy: "u1", updatedBy: "u1", createdAt: at, updatedAt: at },
        { agentId: "maddox", texto: "Descreva com os cinco sentidos.", resumo: "sentidos", createdBy: "u1", updatedBy: "u1", createdAt: at, updatedAt: at },
        { agentId: "image-generator", texto: "Evite fundos brancos.", resumo: "fundos", createdBy: "u1", updatedBy: "u1", createdAt: at, updatedAt: at },
    ])
}
/** Resposta do curador: migra tudo, descarta "Teste 123" e propõe a categoria GLOSSARIO para o Maddox. */
const defaultAnswer = (prompt: string) => {
    const { memorias } = JSON.parse(prompt) as { memorias: { id: string; texto: string }[] }
    return JSON.stringify(
        memorias.map((item) =>
            item.texto.startsWith("Teste")
                ? { id: item.id, decisao: "descartar", motivo: "Memória de teste" }
                : item.texto.includes("sentidos")
                  ? { id: item.id, decisao: "migrar_reescrevendo", motivo: "Mais claro", textoProposto: "Descreva as cenas com os cinco sentidos.", novaCategoria: { key: "glossário", label: "Glossário" } }
                  : { id: item.id, decisao: "migrar", motivo: "Vale", categoriaProposta: "NAMING" },
        ),
    )
}

async function triaged() {
    await seedLegacy()
    curator.answer = defaultAnswer
    await migration.generateBackup("admin-1")
    await migration.runCurator({ provider: "gemini", model: "gemini-2.5-flash" }, "admin-1")
    await migration.waitMigrationIdle()
    return migration.getMigration()
}

describe("migração das listas para o Engramind", () => {
    it("backup: lê agent_memories sem alterar, com SHA-256 e download", async () => {
        await seedLegacy()
        const before = await legacy().find({}).toArray()
        const state = await migration.generateBackup("admin-1")
        expect(state.backup).toMatchObject({ count: 4, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
        expect(await legacy().find({}).toArray()).toEqual(before)
        const file = await migration.downloadBackup()
        expect(JSON.parse(file.body)).toMatchObject({ total: 4, colecao: "agent_memories" })
    })

    it("curador classifica 100% (destino = canal da lista); orçamento por combinação de turno", async () => {
        const state = await triaged()
        expect(state.steps.triage.status).toBe("done")
        expect(state.items.every((item) => item.decision)).toBe(true)
        const maddox = state.items.find((item) => item.list === "maddox")!
        expect(maddox.decision).toMatchObject({ decisao: "migrar_reescrevendo", canalDestino: "dndicas/maddox", categoriaProposta: "GLOSSARIO", novaCategoria: { key: "GLOSSARIO", label: "Glossário" } })
        expect(state.items.find((item) => item.texto.startsWith("Teste"))).toMatchObject({ needsAttention: true, decision: { decisao: "descartar" } })
        expect(state.budget.map((item) => item.key)).toEqual(["opex-admin", "opex-user", "image-generator", "entity-understanding", "entity-import", "maddox"])
        expect(state.budget.find((item) => item.key === "opex-admin")).toMatchObject({ memories: 1, over: false })
    })

    it("memória sem classificação válida ou acima de text_max vai para revisão; um bloco que falha preserva as decisões anteriores; todos falhando → etapa falha", async () => {
        fake.state.textMax = 20
        await seedLegacy()
        await migration.generateBackup("admin-1")
        curator.answer = () => "[]"
        await migration.runCurator({ provider: "gemini", model: "x" }, "admin-1")
        await migration.waitMigrationIdle()
        let state = await migration.getMigration()
        expect(state.items.every((item) => item.decision?.decisao === "revisar_dono" && item.decision.motivo === "Sem classificação válida do curador")).toBe(true)
        curator.answer = (prompt) => JSON.stringify((JSON.parse(prompt) as { memorias: { id: string }[] }).memorias.map((item) => ({ id: item.id, decisao: "migrar", motivo: "Vale" })))
        await migration.runCurator({ provider: "gemini", model: "x" }, "admin-1")
        await migration.waitMigrationIdle()
        state = await migration.getMigration()
        expect(state.items.find((item) => item.list === "maddox")!.decision).toMatchObject({ decisao: "revisar_dono", motivo: expect.stringMatching(/Acima de 20/) })

        fake.state.textMax = 4000
        curator.answer = defaultAnswer
        await migration.runCurator({ provider: "gemini", model: "x" }, "admin-1")
        await migration.waitMigrationIdle()
        curator.fail = (prompt) => prompt.includes('"id": "maddox"')
        await migration.runCurator({ provider: "gemini", model: "x" }, "admin-1")
        await migration.waitMigrationIdle()
        state = await migration.getMigration()
        expect(state.steps.triage.status).toBe("done")
        expect(state.items.find((item) => item.list === "maddox")!.decision!.decisao).toBe("migrar_reescrevendo")

        curator.fail = () => true
        await migration.runCurator({ provider: "gemini", model: "x" }, "admin-1")
        await migration.waitMigrationIdle()
        state = await migration.getMigration()
        expect(state.steps.triage).toMatchObject({ status: "failed", error: expect.stringContaining("Provedor fora do ar") })
        expect(state.items.find((item) => item.list === "maddox")!.decision!.decisao).toBe("migrar_reescrevendo")
    })

    it("curador que não responde no prazo: etapa falha com mensagem acionável", async () => {
        await seedLegacy()
        await migration.generateBackup("admin-1")
        migration.setCuratorTimeoutForTests(30)
        curator.hang = true
        await migration.runCurator({ provider: "gemini", model: "x" }, "admin-1")
        await migration.waitMigrationIdle()
        expect((await migration.getMigration()).steps.triage).toMatchObject({ status: "failed", error: expect.stringContaining("não classificou") })
    })

    it("revisão: lote não aprova descartadas nem o que não cabe; importação idempotente com relatório por lista", async () => {
        await triaged()
        await migration.reviewBulk({ list: "opex-global", status: "aprovada", includeAttention: true }, "admin-1")
        let state = await migration.getMigration()
        expect(state.items.find((item) => item.texto.startsWith("Teste"))!.review.status).toBe("pendente")
        const discarded = state.items.find((item) => item.texto.startsWith("Teste"))!
        await migration.reviewItems({ items: [{ id: discarded.id, status: "rejeitada" }] }, "admin-1")
        await migration.reviewBulk({ list: "maddox", status: "aprovada" }, "admin-1")
        await migration.reviewBulk({ list: "image-generator", status: "aprovada" }, "admin-1")
        await expect(migration.reviewItems({ items: [{ id: discarded.id, status: "aprovada", texto: "x".repeat(5000) }] }, "admin-1")).rejects.toThrow(/reescreva em até/)

        await migration.importApproved("admin-1")
        await migration.waitMigrationIdle()
        state = await migration.getMigration()
        expect(state.steps.import.status).toBe("done")
        expect(fake.state.categories.some((item) => item.key === "GLOSSARIO")).toBe(true)
        const imported = [...fake.state.memories.values()]
        expect(imported.map((item) => `${item.channel}|${item.category}|${item.text}`).sort()).toEqual([
            "dndicas/image-generator|NAMING|Evite fundos brancos.",
            "dndicas/maddox|GLOSSARIO|Descreva as cenas com os cinco sentidos.",
            "dndicas/opex/global|NAMING|Responda em pt-BR.",
        ])
        expect(state.importReport.find((row) => row.list === "opex-global")).toMatchObject({ source: 2, approved: 1, imported: 1, duplicates: 0 })
        expect(state.firstCompletedAt).not.toBeNull()

        // Repetir não duplica (nada mais aprovado); voltar a marcar como não importada e repetir também não.
        await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { "items.$[].imported": null } })
        await migration.importApproved("admin-1")
        await migration.waitMigrationIdle()
        expect(fake.state.memories.size).toBe(3)
        await expect(legacy().countDocuments()).resolves.toBe(4)
    })

    it("etapa em andamento num reinício vira falha", async () => {
        await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { "steps.import": { status: "running", error: null, startedAt: new Date("2020-01-01"), finishedAt: null, progress: null } } }, { upsert: true })
        const state = await migration.getMigration()
        expect(state.steps.import).toMatchObject({ status: "failed", error: expect.stringContaining("Interrompida pelo reinício do dndicas") })
    })
})
