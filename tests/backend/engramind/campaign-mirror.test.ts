import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"
import type { FakeEngramind } from "../../helpers/fake-engramind"

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game", () => ({ publishGameChanged: vi.fn(async () => undefined) }))

const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const { handleCampaignMemoryEvent, mirrorCampaignMemory, reconcileCampaignMemories, searchCampaignMemories, getCampaignSync, mirrorCampaignHistory, campaignHistoryCounts } = await import("@/features/engramind/server/campaign-mirror")
const { syncCampaignChannelLifecycle, provisionCampaignMemoryNetwork } = await import("@/features/engramind/server/campaign-channels")
const { campaignChannel } = await import("@/features/engramind/constants")
const { MaddoxCampaignMemoryModel, MaddoxCampaignModel } = await import("@/features/maddox/models")
const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer | undefined
let fake: FakeEngramind
let campaignId: mongoose.Types.ObjectId
let admin: { secret: string }

beforeAll(async () => {
    mongo = await startDb("engramind_mirror_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
    fake = await configureEngramind()
    campaignId = (await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "u1", rigor: "narrativo" }))._id
    await runBootstrap("admin-1")
    admin = fake.admin()
    fake.takeEvents()
})

const players = () => campaignChannel(String(campaignId), "players")
const master = () => campaignChannel(String(campaignId), "master")
const remote = (id: string) => fake.state.memories.get(id)!
const net = async (method: string, path: string, body?: unknown) => {
    const response = await fake.fetch(`https://engramind.test${path}`, { method, headers: { Authorization: `Bearer ${admin.secret}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return response.status === 204 ? null : ((await response.json()) as Record<string, unknown>)
}
/** Entrega ao dndicas os eventos que o Engramind mandaria pelo webhook. */
const deliver = async () => {
    for (const event of fake.takeEvents()) await handleCampaignMemoryEvent(event)
}
const tool = (name: string, input: unknown) => runMaddoxTool(findMaddoxTool(name)!, { campaignId, turnNumber: 3 }, input)
const local = (title: string) => MaddoxCampaignMemoryModel.findOne({ title }).lean()

async function gameMemory(input: Record<string, unknown>) {
    const doc = await MaddoxCampaignMemoryModel.create({ campaignId, kind: "fato", title: "Farol", titleKey: "farol", text: "Ao norte.", visibility: "players", origin: "agent", createdBy: "maddox", ...input })
    await mirrorCampaignMemory(doc._id)
    return (await MaddoxCampaignMemoryModel.findById(doc._id).lean())!
}

describe("jogo → Engramind", () => {
    it("save_memory cria e atualiza a memória espelhada (key mx-<id>, título travado, categoria e linha de status)", async () => {
        await tool("save_memory", { kind: "missao", title: "Resgatar Lia", text: "Ela está na torre.", status: "ativa" })
        await vi.waitFor(async () => expect((await local("Resgatar Lia"))?.engramindMemoryId).toBeTruthy())
        const saved = (await local("Resgatar Lia"))!
        expect(remote(saved.engramindMemoryId!)).toMatchObject({ channel: players(), key: `mx-${saved._id}`, title: "Resgatar Lia", category: "MISSAO", text: "Status: ativa\nEla está na torre." })
        expect(saved.engramindVersion).toBe(remote(saved.engramindMemoryId!).version)

        await tool("save_memory", { kind: "missao", title: "resgatar lia", text: "Ela foi salva.", status: "concluida", visibility: "master" })
        await vi.waitFor(async () => expect(remote(saved.engramindMemoryId!).channel).toBe(master()))
        expect(remote(saved.engramindMemoryId!)).toMatchObject({ text: "Status: concluida\nEla foi salva." })
        expect([...fake.state.memories.values()].filter((item) => item.key === `mx-${saved._id}`)).toHaveLength(1)
    })

    it("se o espelho falha o jogo segue e a memória fica pendente para o cron", async () => {
        fake.state.down = true
        await tool("save_memory", { kind: "local", title: "Cais", text: "Úmido." })
        await vi.waitFor(async () => expect((await local("Cais"))?.engramindSyncPending).toBe(true))
        expect((await local("Cais"))!.engramindSyncError).toMatch(/Engramind/)
        expect(await getCampaignSync()).toMatchObject({ pending: 1, failures: [expect.objectContaining({ title: "Cais" })] })
        fake.state.down = false
        await reconcileCampaignMemories("admin-1")
        const after = (await local("Cais"))!
        expect(after.engramindSyncPending).toBe(false)
        expect(remote(after.engramindMemoryId!).channel).toBe(players())
    })

    it("save_memory com o tipo + título de uma escondida reexibe e restaura na rede", async () => {
        const memory = await gameMemory({ hiddenAt: new Date() })
        expect(remote(memory.engramindMemoryId!).status).toBe("archived")
        const result = await tool("save_memory", { kind: "fato", title: "Farol", text: "Ao norte, aceso." })
        expect(result).toMatchObject({ created: false, restored: true })
        await vi.waitFor(() => expect(remote(memory.engramindMemoryId!).status).toBe("active"))
        expect((await MaddoxCampaignMemoryModel.findById(memory._id).lean())!.hiddenAt).toBeNull()
    })

    it("categoria ausente na rede: grava em OUTRO sem trocar o tipo do jogo", async () => {
        fake.state.categories = fake.state.categories.filter((item) => item.key !== "LOCAL")
        fake.state.categoryLimit = fake.state.categories.length
        const memory = await gameMemory({ kind: "local", title: "Cripta", titleKey: "cripta" })
        expect(remote(memory.engramindMemoryId!).category).toBe("OUTRO")
        await net("PATCH", `/v1/memories/${memory.engramindMemoryId}`, { text: "Fria e úmida." })
        await deliver()
        expect((await MaddoxCampaignMemoryModel.findById(memory._id).lean())).toMatchObject({ kind: "local", text: "Fria e úmida." })
    })
})

describe("Engramind → jogo (webhook)", () => {
    it("criar num canal de campanha cria a memória no jogo (origin user, autor da rede)", async () => {
        await net("POST", "/v1/memories", { channel: master(), text: "O farol é uma armadilha.", title: "Segredo do farol", category: "FATO" })
        await deliver()
        expect(await local("Segredo do farol")).toMatchObject({ visibility: "master", origin: "user", createdBy: "opex", kind: "fato", text: "O farol é uma armadilha." })
    })

    it("editar atualiza título, texto, tipo e status; linha de status ausente ou inválida mantém o anterior", async () => {
        const memory = await gameMemory({ kind: "missao", title: "Mapa", titleKey: "mapa", text: "Achar o mapa.", status: "ativa" })
        await net("PATCH", `/v1/memories/${memory.engramindMemoryId}`, { text: "Status: concluida\nMapa achado.", title: "Mapa antigo" })
        await deliver()
        expect(await MaddoxCampaignMemoryModel.findById(memory._id).lean()).toMatchObject({ title: "Mapa antigo", text: "Mapa achado.", status: "concluida" })
        await net("PATCH", `/v1/memories/${memory.engramindMemoryId}`, { text: "Sem a linha de status." })
        await deliver()
        expect(await MaddoxCampaignMemoryModel.findById(memory._id).lean()).toMatchObject({ text: "Sem a linha de status.", status: "concluida" })
        await net("PATCH", `/v1/memories/${memory.engramindMemoryId}`, { text: "Status: talvez\nTexto." })
        await deliver()
        expect(await MaddoxCampaignMemoryModel.findById(memory._id).lean()).toMatchObject({ text: "Texto.", status: "concluida" })
        await net("PATCH", `/v1/memories/${memory.engramindMemoryId}`, { category: "LOCAL" })
        await deliver()
        expect(await MaddoxCampaignMemoryModel.findById(memory._id).lean()).toMatchObject({ kind: "local", status: null })
    })

    it("texto da rede maior que o limite do jogo fica inteiro no Mongo", async () => {
        const memory = await gameMemory({})
        const long = "x".repeat(3500)
        await net("PATCH", `/v1/memories/${memory.engramindMemoryId}`, { text: long })
        await deliver()
        expect((await MaddoxCampaignMemoryModel.findById(memory._id).lean())!.text).toHaveLength(3500)
    })

    it("mover troca a visibilidade, a campanha, ou remove do jogo; de fora para dentro cria", async () => {
        const other = (await MaddoxCampaignModel.create({ name: "Areias", ownerId: "u1", rigor: "narrativo" }))._id
        await provisionCampaignMemoryNetwork({ id: String(other), name: "Areias", status: "lobby" })
        const memory = await gameMemory({})
        await net("POST", `/v1/memories/${memory.engramindMemoryId}/move`, { channel: master() })
        await deliver()
        expect(await MaddoxCampaignMemoryModel.findById(memory._id).lean()).toMatchObject({ visibility: "master" })
        await net("POST", `/v1/memories/${memory.engramindMemoryId}/move`, { channel: campaignChannel(String(other), "players") })
        await deliver()
        expect(String((await MaddoxCampaignMemoryModel.findById(memory._id).lean())!.campaignId)).toBe(String(other))
        await net("POST", `/v1/memories/${memory.engramindMemoryId}/move`, { channel: "dndicas/maddox" })
        await deliver()
        expect(await MaddoxCampaignMemoryModel.findById(memory._id).lean()).toBeNull()
        await net("POST", `/v1/memories/${memory.engramindMemoryId}/move`, { channel: players() })
        await deliver()
        expect(await MaddoxCampaignMemoryModel.findOne({ engramindMemoryId: memory.engramindMemoryId }).lean()).toMatchObject({ campaignId, visibility: "players" })
    })

    it("arquivar esconde (fora do Diário e da busca do narrador); restaurar reexibe; excluir remove", async () => {
        const memory = await gameMemory({})
        await net("POST", `/v1/memories/${memory.engramindMemoryId}/archive`)
        await deliver()
        expect((await MaddoxCampaignMemoryModel.findById(memory._id).lean())!.hiddenAt).toBeInstanceOf(Date)
        expect(await tool("search_memories", {})).toMatchObject({ memories: [] })
        await net("POST", `/v1/memories/${memory.engramindMemoryId}/restore`)
        await deliver()
        expect((await MaddoxCampaignMemoryModel.findById(memory._id).lean())!.hiddenAt).toBeNull()
        await net("DELETE", `/v1/memories/${memory.engramindMemoryId}`)
        await deliver()
        expect(await MaddoxCampaignMemoryModel.findById(memory._id).lean()).toBeNull()
    })

    it("anti-laço: o evento da própria gravação do dndicas (versão igual) é ignorado", async () => {
        const memory = await gameMemory({})
        await MaddoxCampaignMemoryModel.updateOne({ _id: memory._id }, { $set: { text: "Editado no jogo depois" } })
        await deliver()
        expect((await MaddoxCampaignMemoryModel.findById(memory._id).lean())!.text).toBe("Editado no jogo depois")
    })

    it("canal de campanha que não existe mais no Mongo: evento ignorado", async () => {
        const memory = await gameMemory({})
        await MaddoxCampaignModel.deleteOne({ _id: campaignId })
        await net("PATCH", `/v1/memories/${memory.engramindMemoryId}`, { text: "Mudou." })
        await deliver()
        expect((await MaddoxCampaignMemoryModel.findById(memory._id).lean())!.text).toBe("Ao norte.")
    })

    it("cron e webhook juntos são idempotentes pela versão; o cron acha o que o webhook perdeu (inclusive exclusões)", async () => {
        const memory = await gameMemory({})
        await net("PATCH", `/v1/memories/${memory.engramindMemoryId}`, { text: "Pelo cron." })
        await net("POST", "/v1/memories", { channel: players(), text: "Nova pela rede.", title: "Nova" })
        const events = fake.takeEvents()
        await Promise.all([reconcileCampaignMemories("admin-1"), ...events.map((event) => handleCampaignMemoryEvent(event))])
        expect((await MaddoxCampaignMemoryModel.findById(memory._id).lean())!.text).toBe("Pelo cron.")
        expect(await MaddoxCampaignMemoryModel.countDocuments({ title: "Nova" })).toBe(1)
        fake.state.memories.delete(memory.engramindMemoryId!)
        await reconcileCampaignMemories("admin-1")
        expect(await MaddoxCampaignMemoryModel.findById(memory._id).lean()).toBeNull()
        expect(await getCampaignSync()).toMatchObject({ lastError: null, lastResult: expect.objectContaining({ removed: 1 }) })
    })
})

describe("busca do narrador, ciclo de vida e histórico", () => {
    it("search_memories busca no Engramind (os dois canais) e cai para o Mongo se ele falhar", async () => {
        await gameMemory({ title: "Farol", text: "Luz azul no farol." })
        await gameMemory({ title: "Segredo", titleKey: "segredo", text: "O farol esconde um culto.", visibility: "master" })
        const found = await searchCampaignMemories(campaignId, { query: "farol", limit: 10 })
        expect(found?.map((item) => item.title).sort()).toEqual(["Farol", "Segredo"])
        expect(fake.state.calls.some((item) => item.path === "/v1/memories/search")).toBe(true)
        fake.state.down = true
        expect(await searchCampaignMemories(campaignId, { query: "farol", limit: 10 })).toBeNull()
        const viaTool = (await tool("search_memories", { query: "farol" })) as { memories: { title: string }[] }
        expect(viaTool.memories.map((item) => item.title).sort()).toEqual(["Farol", "Segredo"])
    })

    it("campanha arquivada arquiva os dois canais; saindo de archived, restaura; falha não lança", async () => {
        await syncCampaignChannelLifecycle({ id: String(campaignId), name: "Brumas", status: "archived" })
        expect(fake.state.channels.get(players())!.archived_at).not.toBeNull()
        expect(fake.state.channels.get(master())!.archived_at).not.toBeNull()
        await syncCampaignChannelLifecycle({ id: String(campaignId), name: "Brumas", status: "active" })
        expect(fake.state.channels.get(players())!.archived_at).toBeNull()
        fake.state.down = true
        await expect(syncCampaignChannelLifecycle({ id: String(campaignId), name: "Brumas", status: "archived" })).resolves.toBeUndefined()
    })

    it("Redator: o Engramind atual recusa a configuração por canal do token de app e o aviso fica visível", async () => {
        expect(await getCampaignSync()).toMatchObject({ redator: { supported: false, message: expect.stringContaining("redator.rewrite_text") } })
        expect(fake.state.channels.get(players())!.settings).toEqual({})
    })

    it("histórico das campanhas espelhado sem curadoria, idempotente, com contagem por campanha", async () => {
        await MaddoxCampaignMemoryModel.create([
            { campaignId, kind: "evento", title: "Chegada", titleKey: "chegada", text: "Chegaram ao porto.", visibility: "players", origin: "agent", createdBy: "maddox" },
            { campaignId, kind: "fato", title: "Culto", titleKey: "culto", text: "Há um culto.", visibility: "master", origin: "agent", createdBy: "maddox", hiddenAt: new Date() },
        ])
        const counts = await mirrorCampaignHistory("admin-1")
        expect(counts).toEqual([{ campaignId: String(campaignId), name: "Brumas", source: 2, mirrored: 2 }])
        const total = fake.state.memories.size
        await MaddoxCampaignMemoryModel.updateMany({}, { $set: { engramindMemoryId: null } })
        await mirrorCampaignHistory("admin-1")
        expect(fake.state.memories.size).toBe(total)
        expect(await campaignHistoryCounts()).toEqual([{ campaignId: String(campaignId), name: "Brumas", source: 2, mirrored: 2 }])
        expect([...fake.state.memories.values()].find((item) => item.title === "Culto")).toMatchObject({ status: "archived", channel: master() })
    })
})
