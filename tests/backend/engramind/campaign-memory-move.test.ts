import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"
import type { FakeEngramind } from "../../helpers/fake-engramind"

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
const recordAudit = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/audit/record", () => ({ recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))

const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const { moveCampaignMemories, campaignMoveRows, downloadCampaignBackup, legacyKeys, BACKUP_PART_CHARS } = await import("@/features/engramind/server/campaign-memory-move")
const { campaignChannel } = await import("@/features/engramind/constants")
const { MaddoxCampaignModel } = await import("@/features/maddox/models")
const { EngramindState } = await import("@/features/engramind/server/models")
const { MemoryBackup } = await import("@/features/engramind/server/migration-models")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer | undefined
let fake: FakeEngramind
let campaignId: mongoose.Types.ObjectId
let other: mongoose.Types.ObjectId

beforeAll(async () => {
    mongo = await startDb("engramind_campaign_move_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
    recordAudit.mockClear()
    fake = await configureEngramind()
    campaignId = (await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "u1", rigor: "narrativo" }))._id
    other = (await MaddoxCampaignModel.create({ name: "Areias", ownerId: "u1", rigor: "narrativo" }))._id
    await runBootstrap("admin-1")
})

const legacy = () => mongoose.connection.db!.collection("maddox_campaign_memories")
const combatId = new mongoose.Types.ObjectId()

async function seed() {
    await legacy().insertMany([
        { campaignId, kind: "missao", title: "O Mapa", titleKey: "o mapa", text: "Achar o mapa.", visibility: "players", tags: ["pista"], status: "concluida", turnNumber: 4, createdAt: new Date("2026-10-01T00:00:00Z") },
        { campaignId, kind: "fato", title: "Culto", titleKey: "culto", text: "Há um culto.", visibility: "master", tags: [], hiddenAt: new Date(), createdAt: new Date("2026-10-02T00:00:00Z") },
        { campaignId, kind: "evento", title: "Combate: Ponte (turno 2)", titleKey: "combate: ponte (turno 2)", text: "Vitória.", visibility: "players", tags: ["combate"], combatId, createdAt: new Date("2026-10-03T00:00:00Z") },
        { campaignId: other, kind: "local", title: "Duna", titleKey: "duna", text: "Areia.", visibility: "players", tags: [] },
    ])
}

describe("mover as memórias antigas das campanhas", () => {
    it("faz o backup, importa com chaves e tags, confere e apaga do banco por campanha; repetir não duplica", async () => {
        await seed()
        const rows = await moveCampaignMemories("admin-1")
        expect(rows.find((row) => row.campaignId === String(campaignId))).toMatchObject({ imported: 3, verified: 3, deleted: 3, source: 0, error: null })
        expect(rows.find((row) => row.campaignId === String(other))).toMatchObject({ deleted: 1, error: null })
        expect(await legacy().countDocuments({})).toBe(0)
        const remote = [...fake.state.memories.values()]
        expect(remote.find((item) => item.key === "mx:missao:o-mapa")).toMatchObject({ channel: campaignChannel(String(campaignId), "players"), category: "MISSAO", tags: ["pista", "status:concluida", "turno:4"], created_at: "2026-10-01T00:00:00.000Z" })
        expect(remote.find((item) => item.key === "mx:fato:culto")).toMatchObject({ channel: campaignChannel(String(campaignId), "master"), status: "archived" })
        expect(remote.find((item) => item.key === `mx:combate:${combatId}`)).toMatchObject({ category: "EVENTO" })
        const backup = await downloadCampaignBackup()
        expect(JSON.parse(backup.body)).toHaveLength(4)
        // Nenhum texto das memórias vai para a auditoria.
        expect(JSON.stringify(recordAudit.mock.calls)).not.toContain("Achar o mapa")
        const total = fake.state.memories.size
        await moveCampaignMemories("admin-1")
        expect(fake.state.memories.size).toBe(total)
        expect((await campaignMoveRows()).every((row) => row.source === 0)).toBe(true)
    })

    it("falha numa campanha não apaga nada dela (as outras seguem)", async () => {
        await seed()
        const original = fake.fetch
        vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input instanceof Request ? input.url : input)
            if (url.endsWith("/v1/memories/import") && String(init?.body ?? "").includes(String(campaignId))) return new Response(JSON.stringify({ error: { code: "CHANNEL_ARCHIVED", message: "Canal arquivado" } }), { status: 409, headers: { "Content-Type": "application/json" } })
            return original(input as string, init)
        }) as typeof fetch)
        const rows = await moveCampaignMemories("admin-1")
        expect(rows.find((row) => row.campaignId === String(campaignId))).toMatchObject({ deleted: 0, error: expect.any(String) })
        expect(await legacy().countDocuments({ campaignId })).toBe(3)
        expect(rows.find((row) => row.campaignId === String(other))).toMatchObject({ deleted: 1 })
    })

    it("cada execução acrescenta um backup (nenhum é substituído); coleção vazia não gera backup; JSON grande vai em partes", async () => {
        await seed()
        await legacy().insertOne({ campaignId, kind: "fato", title: "Longa", titleKey: "longa", text: "x".repeat(BACKUP_PART_CHARS + 10), visibility: "players", tags: [] })
        fake.state.textMax = 20_000
        await moveCampaignMemories("admin-1")
        const state = await EngramindState.findById("global").lean()
        expect(state!.campaignBackups).toHaveLength(1)
        expect(state!.campaignBackups[0]).toMatchObject({ count: 5 })
        expect(state!.campaignBackups[0]!.parts).toBeGreaterThan(1)
        const first = await downloadCampaignBackup()
        expect(JSON.parse(first.body)).toHaveLength(5)
        // A memória longa passou do limite: ficou no banco, e a segunda execução gera outro backup (só com ela).
        await moveCampaignMemories("admin-1")
        const after = await EngramindState.findById("global").lean()
        expect(after!.campaignBackups).toHaveLength(2)
        expect(JSON.parse((await downloadCampaignBackup(after!.campaignBackups[0]!.id)).body)).toHaveLength(5)
        await legacy().deleteMany({})
        await moveCampaignMemories("admin-1")
        expect((await EngramindState.findById("global").lean())!.campaignBackups).toHaveLength(2)
        // Parte faltando: o download recusa em vez de entregar um arquivo truncado.
        await MemoryBackup.deleteOne({ _id: `${after!.campaignBackups[0]!.id}:p1` })
        await expect(downloadCampaignBackup(after!.campaignBackups[0]!.id)).rejects.toMatchObject({ status: 500 })
    })

    it("texto acima do limite do canal não é cortado: fica fora da importação e nada da campanha é apagado", async () => {
        await seed()
        await legacy().insertOne({ campaignId, kind: "fato", title: "Enorme", titleKey: "enorme", text: "y".repeat(5000), visibility: "players", tags: [] })
        const rows = await moveCampaignMemories("admin-1")
        const row = rows.find((item) => item.campaignId === String(campaignId))!
        expect(row).toMatchObject({ deleted: 0, error: expect.stringContaining("passam do limite de texto") })
        expect(await legacy().countDocuments({ campaignId })).toBe(4)
        expect([...fake.state.memories.values()].some((item) => item.key === "mx:fato:enorme")).toBe(false)
        expect(rows.find((item) => item.campaignId === String(other))).toMatchObject({ deleted: 1 })
    })

    it("chave repetida na mesma campanha recebe o sufixo do _id", () => {
        const a = new mongoose.Types.ObjectId()
        const b = new mongoose.Types.ObjectId()
        const keys = legacyKeys([
            { _id: a, kind: "fato", title: "Culto", combatId: null },
            { _id: b, kind: "fato", title: "culto", combatId: null },
        ])
        expect(keys.get(String(a))).toBe("mx:fato:culto")
        expect(keys.get(String(b))).toBe(`mx:fato:culto:${b}`)
    })
})
