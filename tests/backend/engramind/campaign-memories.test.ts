import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"
import { FAKE_APP_TOKEN, type FakeEngramind } from "../../helpers/fake-engramind"

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR", EXCLUIR: "EXCLUIR" } }))
const publishToChannels = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
vi.mock("@/features/maddox/server/game", () => ({ publishGameChanged: vi.fn(async () => undefined) }))

const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const { saveCampaignMemory, searchCampaignMemories, listCampaignMemories, narratorMemoryIndex, countPlayerMemories, flushPendingWrites, PENDING_MAX_ATTEMPTS } = await import("@/features/engramind/server/campaign-memories")
const { syncCampaignMemories, getCampaignSync } = await import("@/features/engramind/server/campaign-sync")
const { syncCampaignChannelLifecycle } = await import("@/features/engramind/server/campaign-channels")
const { onWebhookEvent } = await import("@/features/engramind/server/webhook")
const { PendingWrite } = await import("@/features/engramind/server/pending-writes")
const { campaignChannel } = await import("@/features/engramind/constants")
const { combatMemoryKey } = await import("@/features/engramind/campaign-memory-format")
const { MaddoxCampaignModel, MaddoxCampaignMemberModel } = await import("@/features/maddox/models")
const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer | undefined
let fake: FakeEngramind
let campaignId: mongoose.Types.ObjectId
let id: string
let admin: { secret: string }

beforeAll(async () => {
    mongo = await startDb("engramind_campaign_memories_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
    publishToChannels.mockClear()
    fake = await configureEngramind()
    campaignId = (await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "u1", rigor: "narrativo" }))._id
    id = String(campaignId)
    await runBootstrap("admin-1")
    admin = fake.admin()
    fake.takeEvents()
})

const players = () => campaignChannel(id, "players")
const master = () => campaignChannel(id, "master")
const remotes = () => [...fake.state.memories.values()]
const net = async (method: string, path: string, body?: unknown) => {
    const response = await fake.fetch(`https://engramind.test${path}`, { method, headers: { Authorization: `Bearer ${admin.secret}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return response.status === 204 ? null : ((await response.json()) as Record<string, unknown>)
}
const tool = (name: string, input: unknown) => runMaddoxTool(findMaddoxTool(name)!, { campaignId, turnNumber: 3 }, input)

describe("gravação (Engramind como única fonte)", () => {
    it("save_memory cria e atualiza pelo tipo + título, com categoria, título travado e tags de situação e turno; nada no Mongo", async () => {
        const first = await tool("save_memory", { kind: "missao", title: "O Mapa", text: "Achar o mapa.", tags: ["pista"] })
        expect(first).toMatchObject({ saved: true, created: true, kind: "missao", title: "O Mapa" })
        await tool("save_memory", { kind: "missao", title: "o mapá", text: "Mapa achado.", status: "concluida" })
        expect(remotes()).toHaveLength(1)
        expect(remotes()[0]).toMatchObject({ channel: players(), key: "mx:missao:o-mapa", category: "MISSAO", title: "o mapá", text: "Mapa achado." })
        expect(remotes()[0]!.tags).toEqual(["pista", "status:concluida", "turno:3"])
        expect(await mongoose.connection.db!.collection("maddox_campaign_memories").countDocuments({})).toBe(0)
    })

    it("troca de visibilidade move a memória; uma arquivada volta pelo upsert", async () => {
        await saveCampaignMemory(id, { kind: "fato", title: "Culto", text: "Há um culto.", turnNumber: 1 })
        await saveCampaignMemory(id, { kind: "fato", title: "Culto", text: "Há um culto no porto.", visibility: "master", turnNumber: 2 })
        expect(remotes()).toHaveLength(1)
        expect(remotes()[0]).toMatchObject({ channel: master(), text: "Há um culto no porto." })
        await net("POST", `/v1/memories/${remotes()[0]!.id}/archive`)
        const restored = await saveCampaignMemory(id, { kind: "fato", title: "Culto", text: "O culto voltou.", turnNumber: 4 })
        expect(restored).toMatchObject({ saved: true, created: false, restored: true })
        expect(remotes()[0]).toMatchObject({ status: "active", channel: master(), text: "O culto voltou." })
    })

    it("memória criada fora do jogo (sem chave) é achada pelo título e atualizada pelo id", async () => {
        const created = (await net("POST", "/v1/memories", { channel: players(), text: "Ao norte.", title: "Farol", category: "LOCAL" })) as { memory: { id: string } }
        await saveCampaignMemory(id, { kind: "local", title: "Farol", text: "Ao norte, apagado.", turnNumber: 5 })
        expect(remotes()).toHaveLength(1)
        expect(fake.state.memories.get(created.memory.id)).toMatchObject({ text: "Ao norte, apagado.", key: null })
    })

    it("texto acima do limite da rede é cortado com aviso", async () => {
        fake.state.textMax = 20
        const result = await saveCampaignMemory(id, { kind: "fato", title: "Longo", text: "x".repeat(50), turnNumber: 1 })
        expect(result).toMatchObject({ truncated: true, aviso: expect.stringContaining("20") })
        expect(remotes()[0]!.text).toHaveLength(20)
    })

    it("marco de combate: uma memória por combate pela chave do combate", async () => {
        const a = new mongoose.Types.ObjectId()
        const b = new mongoose.Types.ObjectId()
        await saveCampaignMemory(id, { kind: "evento", title: "Combate: Ponte (turno 2)", text: "Vitória.", key: combatMemoryKey(String(a)), tags: ["combate"] })
        await saveCampaignMemory(id, { kind: "evento", title: "Combate: Ponte (turno 2)", text: "Derrota.", key: combatMemoryKey(String(b)), tags: ["combate"] })
        expect(remotes().map((item) => item.key).sort()).toEqual([combatMemoryKey(String(a)), combatMemoryKey(String(b))].sort())
    })

    it("rede fora: a gravação vai para a fila (a mais nova substitui a pendente), não aparece na leitura e o cron entrega e apaga", async () => {
        fake.state.down = true
        const pending = await tool("save_memory", { kind: "fato", title: "Porto", text: "Primeira." })
        expect(pending).toMatchObject({ saved: true, pending: true, aviso: expect.stringContaining("indisponível") })
        await tool("save_memory", { kind: "fato", title: "Porto", text: "Segunda." })
        expect(await PendingWrite.countDocuments({})).toBe(1)
        fake.state.down = false
        expect((await listCampaignMemories(id, { scope: "all", reader: "maddox", limit: 10 })).items).toEqual([])
        expect(await syncCampaignMemories("admin-1")).toMatch(/1 entregues/)
        expect(await PendingWrite.countDocuments({})).toBe(0)
        expect(remotes()).toHaveLength(1)
        expect(remotes()[0]!.text).toBe("Segunda.")
        expect(await getCampaignSync()).toMatchObject({ pending: 0, lastResult: expect.objectContaining({ delivered: 1 }) })
    })

    it("recusa de validação não vai para a fila: volta ao narrador; uma da fila recusada fica marcada", async () => {
        fake.state.textMax = 5
        await PendingWrite.create({ _id: `${id}:mx:fato:x`, campaignId: id, key: "mx:fato:x", channel: players(), body: { channel: players(), key: "mx:fato:x", upsert: true, text: "texto longo demais", category: "FATO" } })
        expect(await flushPendingWrites()).toMatchObject({ delivered: 0, failed: 1, remaining: 1 })
        expect(await getCampaignSync()).toMatchObject({ failures: [expect.objectContaining({ failed: true })] })
        fake.state.textMax = 4000
        await net("POST", `/v1/channels/${encodeURIComponent(players())}/archive`)
        await expect(tool("save_memory", { kind: "fato", title: "Nada", text: "Canal arquivado." })).rejects.toThrow(/recusou/)
        expect(await PendingWrite.countDocuments({ key: "mx:fato:nada" })).toBe(0)
    })
})

describe("fila: entrada ruim não trava as seguintes", () => {
    it("5xx repetido conta tentativas e vira recusa depois do teto, sem impedir a entrega das próximas", async () => {
        const body = (key: string, text: string) => ({ channel: players(), key, upsert: true, text, category: "FATO", title: key.slice(8) })
        await PendingWrite.create({ _id: `${id}:mx:fato:ruim`, campaignId: id, key: "mx:fato:ruim", channel: players(), body: body("mx:fato:ruim", "RUIM") })
        await PendingWrite.create({ _id: `${id}:mx:fato:boa`, campaignId: id, key: "mx:fato:boa", channel: players(), body: body("mx:fato:boa", "Boa.") })
        const original = fake.fetch
        vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(init?.body ?? "").includes('"RUIM"')) return new Response(JSON.stringify({ error: { code: "INTERNAL", message: "falhou" } }), { status: 500, headers: { "Content-Type": "application/json" } })
            return original(input as string, init)
        }) as typeof fetch)
        expect(await flushPendingWrites()).toMatchObject({ delivered: 1, failed: 0, remaining: 1 })
        expect(remotes().map((item) => item.key)).toEqual(["mx:fato:boa"])
        for (let attempt = 1; attempt < PENDING_MAX_ATTEMPTS; attempt++) await flushPendingWrites()
        expect(await PendingWrite.findById(`${id}:mx:fato:ruim`).lean()).toMatchObject({ failed: true, attempts: PENDING_MAX_ATTEMPTS })
        expect(await flushPendingWrites()).toMatchObject({ delivered: 0, remaining: 1 })
    })

    it("rede inteira fora para a entrega (tenta tudo no próximo ciclo, sem gastar tentativas)", async () => {
        await saveCampaignMemory(id, { kind: "fato", title: "Antes", text: "x" })
        fake.state.down = true
        await saveCampaignMemory(id, { kind: "fato", title: "Um", text: "Um." })
        await saveCampaignMemory(id, { kind: "fato", title: "Dois", text: "Dois." })
        expect(await flushPendingWrites()).toMatchObject({ delivered: 0, failed: 0, remaining: 2 })
        expect(await PendingWrite.countDocuments({ attempts: { $gt: 0 } })).toBe(0)
        fake.state.down = false
        expect(await flushPendingWrites()).toMatchObject({ delivered: 2, remaining: 0 })
    })

    it("o texto já entra na fila cortado no limite conhecido do canal (rede fora e sem o token do agente)", async () => {
        fake.state.textMax = 30
        await saveCampaignMemory(id, { kind: "fato", title: "Lê o limite", text: "curto" })
        fake.state.down = true
        expect(await saveCampaignMemory(id, { kind: "fato", title: "Rede fora", text: "z".repeat(100) })).toMatchObject({ pending: true, truncated: true })
        expect(String((await PendingWrite.findOne({ key: "mx:fato:rede-fora" }).lean())!.body.text)).toHaveLength(30)
        // Sem o token do agente (e sem esperar o provisionamento sob demanda, que falha com a rede fora).
        const { writeEngramindSecrets, resetEngramindLazyForTests } = await import("@/features/engramind/server/client")
        await writeEngramindSecrets({ agentTokenMaddox: null }, "admin-1")
        const { invalidateStoredIntegrations } = await import("@/lib/integrations/store")
        invalidateStoredIntegrations()
        resetEngramindLazyForTests({ waitMs: 0 })
        expect(await saveCampaignMemory(id, { kind: "fato", title: "Sem token", text: "w".repeat(100) })).toMatchObject({ pending: true, truncated: true })
        expect(String((await PendingWrite.findOne({ key: "mx:fato:sem-token" }).lean())!.body.text)).toHaveLength(30)
    })
})

describe("leitura", () => {
    beforeEach(async () => {
        await saveCampaignMemory(id, { kind: "missao", title: "Achar o mapa", text: "O mapa do farol.", turnNumber: 1 })
        await saveCampaignMemory(id, { kind: "missao", title: "Velha", text: "Feita.", status: "concluida", turnNumber: 1 })
        await saveCampaignMemory(id, { kind: "local", title: "Farol", text: "Luz azul no farol.", turnNumber: 2 })
        await saveCampaignMemory(id, { kind: "fato", title: "Segredo", text: "O farol esconde um culto.", visibility: "master", turnNumber: 2 })
    })

    it("search_memories do narrador busca nos dois canais; sem a rede, erro acionável", async () => {
        const found = (await tool("search_memories", { query: "farol" })) as { memories: { title: string; visibility: string }[] }
        expect(found.memories.map((item) => item.title).sort()).toEqual(["Achar o mapa", "Farol", "Segredo"])
        const quests = (await tool("search_memories", { kind: "missao" })) as { memories: { title: string; status: string }[] }
        expect(quests.memories.map((item) => item.status).sort()).toEqual(["ativa", "concluida"])
        fake.state.down = true
        await expect(tool("search_memories", { query: "farol" })).rejects.toThrow(/indisponível/)
    })

    it("o escopo dos jogadores nunca lê o canal do mestre", async () => {
        const search = await searchCampaignMemories(id, { query: "farol", scope: "players", reader: "app", limit: 10 })
        expect(search.map((item) => item.title).sort()).toEqual(["Achar o mapa", "Farol"])
        expect(await countPlayerMemories(id)).toMatchObject({ missao: 2, local: 1, fato: 0 })
        const appCalls = fake.state.calls.filter((call) => call.token === `Bearer ${FAKE_APP_TOKEN}` && call.path.startsWith("/v1/memories"))
        expect(appCalls.length).toBeGreaterThan(0)
        for (const call of appCalls) expect(`${call.query.channels ?? ""} ${call.body ?? ""}`).not.toContain("/mestre")
    })

    it("missão sem a tag de situação (criada fora do jogo) conta como ativa no Diário e no prompt", async () => {
        await net("POST", "/v1/memories", { channel: players(), text: "Achar o elmo.", title: "Elmo perdido", category: "MISSAO" })
        const active = await listCampaignMemories(id, { scope: "players", reader: "app", kind: "missao", status: "ativa", limit: 10 })
        expect(active.items.map((item) => item.title).sort()).toEqual(["Achar o mapa", "Elmo perdido"])
        expect((await narratorMemoryIndex(id, 5)).filter((item) => item.status === "ativa").map((item) => item.title).sort()).toEqual(["Achar o mapa", "Elmo perdido"])
        const page = await listCampaignMemories(id, { scope: "players", reader: "app", kind: "missao", status: "ativa", limit: 1 })
        expect(page.nextCursor).toBe("o:1")
        expect((await listCampaignMemories(id, { scope: "players", reader: "app", kind: "missao", status: "ativa", limit: 1, cursor: page.nextCursor! })).items).toHaveLength(1)
    })

    it("lista por tipo com filtro de situação e paginação pelo cursor da rede", async () => {
        const active = await listCampaignMemories(id, { scope: "players", reader: "app", kind: "missao", status: "ativa", limit: 10 })
        expect(active.items.map((item) => item.title)).toEqual(["Achar o mapa"])
        const first = await listCampaignMemories(id, { scope: "players", reader: "app", limit: 2 })
        expect(first.items).toHaveLength(2)
        expect(first.nextCursor).toBeTruthy()
        const second = await listCampaignMemories(id, { scope: "players", reader: "app", limit: 2, cursor: first.nextCursor! })
        expect(second.items).toHaveLength(1)
    })

    it("prompt do narrador: missões ativas sempre + recentes; sem a rede, vazio", async () => {
        const index = await narratorMemoryIndex(id, 2)
        expect(index[0]).toMatchObject({ title: "Achar o mapa", status: "ativa" })
        expect(index).toHaveLength(2)
        fake.state.down = true
        expect(await narratorMemoryIndex(id, 2)).toEqual([])
    })
})

describe("webhook, ciclo de vida e Redator", () => {
    it("mudança no canal dos jogadores avisa os membros (Diário); a do mestre não", async () => {
        await MaddoxCampaignMemberModel.create({ campaignId, userId: "u1", role: "owner", status: "joined" })
        await onWebhookEvent({ id: "evt_1", type: "memory.updated", channel: master(), memory_ids: ["m_1"], created_at: "2026-11-06T00:00:00Z" } as never)
        await onWebhookEvent({ id: "evt_2", type: "memory.updated", channel: players(), memory_ids: ["m_1"], created_at: "2026-11-06T00:00:00Z" } as never)
        await vi.waitFor(() => expect(publishToChannels).toHaveBeenCalledWith(["private-maddox-u-u1"], "maddox.campaign.changed", { campaignId: id }))
        expect(publishToChannels.mock.calls.filter((call) => (call as unknown[])[1] === "maddox.campaign.changed")).toHaveLength(1)
    })

    it("a rotina arquiva os canais da campanha arquivada e os restaura quando ela sai de archived", async () => {
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { status: "archived" } })
        await syncCampaignMemories("admin-1")
        expect(fake.state.channels.get(players())!.archived_at).not.toBeNull()
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { status: "active" } })
        await syncCampaignMemories("admin-1")
        expect(fake.state.channels.get(players())!.archived_at).toBeNull()
        fake.state.down = true
        await expect(syncCampaignChannelLifecycle({ id, name: "Brumas", status: "archived" })).resolves.toBeUndefined()
    })

    it("Redator: o Engramind atual recusa a configuração por canal do token de app e o aviso fica visível", async () => {
        expect(await getCampaignSync()).toMatchObject({ redator: { supported: false, message: expect.stringContaining("redator.rewrite_text") } })
    })
})
