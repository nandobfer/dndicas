import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"
import type { FakeEngramind } from "../../helpers/fake-engramind"

/**
 * Memórias na volta a um turno (DND-44), contra o Engramind falso (com `history` e `revert` do contrato): as criadas
 * depois do retrato são arquivadas, as atualizadas voltam à revisão do retrato (texto, tags, situação), ir para frente
 * e retomar reativam, as nascidas de ações feitas depois da volta são excluídas, a perda definitiva exclui o trecho e
 * repetir não duplica nada. Vale para os canais da campanha e para o canal individual do Personagem Opex.
 */

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game", () => ({ publishGameChanged: vi.fn(async () => undefined) }))

const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const { saveCampaignMemory, listCampaignMemories, resetCampaignMemoriesForTests } = await import("@/features/engramind/server/campaign-memories")
const rewind = await import("@/features/engramind/server/campaign-rewind")
const opexChars = await import("@/features/engramind/server/opex-characters")
const { PendingWrite } = await import("@/features/engramind/server/pending-writes")
const { MaddoxCampaignModel, MaddoxCampaignMemberModel } = await import("@/features/maddox/models")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer | undefined
let fake: FakeEngramind
let id: string
let clock = 1_000

const at = (time: number) => {
    clock = time
}
const remote = (title: string) => [...fake.state.memories.values()].find((memory) => memory.title === title)
const revisions = (memoryId: string) => fake.state.revisions.get(memoryId)?.length ?? 0

async function rewindTo(target: { asOf: number; deleteAfter: number | null; keepAfter?: number | null }, known: Set<string> = new Set()) {
    const channels = await rewind.resolveRewindChannels(id, await rewind.npcTokenBoxesOf(id))
    const items = await rewind.planMemoryRewinds(channels!, target, known)
    await rewind.applyMemoryRewinds(channels!, items)
    return items
}

const quests = async () => (await listCampaignMemories(id, { scope: "all", reader: "maddox", kind: "missao", limit: 50 })).items

beforeAll(async () => {
    mongo = await startDb("engramind_campaign_rewind_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
    resetCampaignMemoriesForTests()
    fake = await configureEngramind()
    id = String((await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "dono", rigor: "narrativo", status: "active" }))._id)
    await runBootstrap("admin-1")
    vi.spyOn(Date, "now").mockImplementation(() => clock)
    // Turno 2 (antes do retrato 1500): a missão ativa e um fato.
    at(1_000)
    await saveCampaignMemory(id, { kind: "missao", title: "O Mapa", text: "Achar o mapa.", status: "ativa", turnNumber: 2 })
    await saveCampaignMemory(id, { kind: "fato", title: "O Farol", text: "O farol apagou.", turnNumber: 2 })
    // Turno 5 (depois do retrato, antes da origem 3000): a missão concluída e um lugar novo.
    at(2_000)
    await saveCampaignMemory(id, { kind: "missao", title: "O Mapa", text: "O mapa foi achado na cripta.", status: "concluida", turnNumber: 5 })
    await saveCampaignMemory(id, { kind: "local", title: "A Torre", text: "Uma torre ao sul.", turnNumber: 5 })
})
afterEach(() => {
    vi.restoreAllMocks()
})

describe("volta a um turno — memórias da campanha", () => {
    it("ir ao turno: a missão volta a ativa com o texto de antes, a criada depois é arquivada e a antiga fica intacta", async () => {
        const farolRevisions = revisions(remote("O Farol")!.id)
        const items = await rewindTo({ asOf: 1_500, deleteAfter: 3_000 })
        expect(remote("O Mapa")).toMatchObject({ text: "Achar o mapa.", status: "active" })
        expect(remote("O Mapa")!.tags).toEqual(expect.arrayContaining(["status:ativa", "turno:2"]))
        expect(remote("A Torre")).toMatchObject({ status: "archived" })
        expect(revisions(remote("O Farol")!.id)).toBe(farolRevisions)
        expect(items.map((item) => item.action.kind).sort()).toEqual(["apply", "apply"])
        expect((await quests()).map((quest) => [quest.title, quest.status])).toEqual([["O Mapa", "ativa"]])
    })

    it("repetir é idempotente: nenhuma revisão nova na segunda vez", async () => {
        const first = await rewindTo({ asOf: 1_500, deleteAfter: 3_000 })
        const known = new Set(first.map((item) => item.id))
        const counts = [...fake.state.memories.values()].map((memory) => revisions(memory.id))
        const second = await rewindTo({ asOf: 1_500, deleteAfter: 3_000 }, known)
        expect(second.every((item) => item.action.kind === "keep")).toBe(true)
        expect([...fake.state.memories.values()].map((memory) => revisions(memory.id))).toEqual(counts)
    })

    it("retomar a origem devolve a versão nova e reativa; o que nasceu depois da volta é excluído", async () => {
        const first = await rewindTo({ asOf: 1_500, deleteAfter: 3_000 })
        at(4_000)
        await saveCampaignMemory(id, { kind: "fato", title: "A Nova Pista", text: "Pegadas na neve.", turnNumber: 2 })
        const known = new Set([...first.map((item) => item.id), remote("A Nova Pista")!.id])
        await rewindTo({ asOf: 3_000, deleteAfter: 3_000 }, known)
        expect(remote("O Mapa")).toMatchObject({ text: "O mapa foi achado na cripta.", status: "active" })
        expect(remote("O Mapa")!.tags).toEqual(expect.arrayContaining(["status:concluida", "turno:5"]))
        expect(remote("A Torre")).toMatchObject({ status: "active" })
        expect(remote("A Nova Pista")).toBeUndefined()
        expect((await quests()).map((quest) => quest.status)).toEqual(["concluida"])
    })

    it("andar para frente dentro da volta: o que é até o turno de destino volta, o posterior segue fora", async () => {
        at(2_500)
        await saveCampaignMemory(id, { kind: "fato", title: "O Eco", text: "Um eco no poço.", turnNumber: 8 })
        const first = await rewindTo({ asOf: 1_500, deleteAfter: 3_000 })
        const known = new Set(first.map((item) => item.id))
        expect(remote("O Eco")).toMatchObject({ status: "archived" })
        // Retrato do turno 6 em 2200: a torre e a missão concluída voltam; o eco (turno 8) segue arquivado.
        await rewindTo({ asOf: 2_200, deleteAfter: 3_000 }, known)
        expect(remote("A Torre")).toMatchObject({ status: "active" })
        expect(remote("O Mapa")).toMatchObject({ text: "O mapa foi achado na cripta." })
        expect(remote("O Eco")).toMatchObject({ status: "archived" })
    })

    it("perda definitiva: exclui só o que nasceu no trecho descartado; a missão revertida fica com a versão do turno", async () => {
        const first = await rewindTo({ asOf: 1_500, deleteAfter: 3_000 })
        const channels = await rewind.resolveRewindChannels(id, new Map())
        const result = await rewind.purgeDiscardedMemories(channels!, first.map(({ id: memoryId, ref }) => ({ id: memoryId, ref })), { after: 1_500, upTo: 3_000 })
        expect(result).toEqual({ deleted: 1, failed: [] })
        expect(remote("A Torre")).toBeUndefined()
        expect(remote("O Mapa")).toMatchObject({ text: "Achar o mapa.", status: "active" })
        expect((await quests()).map((quest) => quest.status)).toEqual(["ativa"])
    })

    it("memória antiga, sem turno, nunca é afetada", async () => {
        const channel = `dndicas/maddox/campanhas/${id}/jogadores`
        const admin = fake.admin()
        await fake.fetch(`https://engramind.test/v1/memories`, { method: "POST", headers: { Authorization: `Bearer ${admin.secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ channel, text: "Registro antigo do mundo.", category: "FATO", title: "Antigo" }) })
        const before = remote("Antigo")!
        await rewindTo({ asOf: 0, deleteAfter: 3_000 }, new Set([before.id]))
        expect(remote("Antigo")).toMatchObject({ status: "active", version: before.version })
    })

    it("rede cai no meio da aplicação: parte fica aplicada, repetir completa sem revisão extra nem duplicação", async () => {
        const reference = new Map<string, number>()
        // Revisões esperadas depois de uma volta só, sem falha (uma por revert e uma por archive/restore).
        const channels = await rewind.resolveRewindChannels(id, new Map())
        const items = await rewind.planMemoryRewinds(channels!, { asOf: 1_500, deleteAfter: 3_000 }, new Set())
        for (const item of items) reference.set(item.id, revisions(item.id) + (item.action.kind === "apply" ? Number(item.action.revertTo !== null) + Number(item.action.status !== null) : 0))
        // A primeira memória é aplicada; a rede cai antes da segunda.
        const changing = items.filter((item) => item.action.kind !== "keep")
        expect(changing.length).toBeGreaterThan(1)
        await rewind.applyMemoryRewinds(channels!, changing.slice(0, 1))
        fake.state.down = true
        await expect(rewind.applyMemoryRewinds(channels!, changing.slice(1))).rejects.toBeInstanceOf(rewind.MemoryRewindUnavailableError)
        const partial = [...reference.keys()].filter((memoryId) => revisions(memoryId) === reference.get(memoryId))
        expect(partial.length).toBeGreaterThan(0)
        expect(partial.length).toBeLessThan(reference.size)
        // Rede de volta: repetir com as já tocadas como conhecidas fecha o que faltou.
        fake.state.down = false
        await rewindTo({ asOf: 1_500, deleteAfter: 3_000 }, new Set(items.map((item) => item.id)))
        for (const [memoryId, count] of reference) expect(revisions(memoryId)).toBe(count)
        expect(remote("O Mapa")).toMatchObject({ text: "Achar o mapa.", status: "active" })
        expect(remote("A Torre")).toMatchObject({ status: "archived" })
        expect(fake.state.memories.size).toBe(3)
        // Uma terceira vez não muda nada.
        await rewindTo({ asOf: 1_500, deleteAfter: 3_000 }, new Set(items.map((item) => item.id)))
        for (const [memoryId, count] of reference) expect(revisions(memoryId)).toBe(count)
    })

    it("rede fora: o plano lança MemoryRewindUnavailableError", async () => {
        fake.state.down = true
        await expect(rewindTo({ asOf: 1_500, deleteAfter: 3_000 })).rejects.toBeInstanceOf(rewind.MemoryRewindUnavailableError)
    })

    it("fila: as gravações depois do retrato saem da fila e voltam na retomada", async () => {
        const recent = new Date()
        await PendingWrite.create({ _id: `${id}:mx:fato:x`, campaignId: id, key: "mx:fato:x", channel: "c", body: { text: "x" } })
        const stashed = await rewind.stashPendingWrites(id, new Date(recent.getTime() - 60_000))
        expect(stashed).toHaveLength(1)
        expect(await PendingWrite.countDocuments()).toBe(0)
        await rewind.restorePendingWrites(stashed as unknown as Record<string, unknown>[])
        expect(await PendingWrite.countDocuments()).toBe(1)
    })
})

describe("volta a um turno — Personagem Opex", () => {
    it("a memória do Opex leva turno e instante e volta com a campanha", async () => {
        const memberId = new mongoose.Types.ObjectId()
        await MaddoxCampaignMemberModel.create({ _id: memberId, campaignId: id, userId: `opex:${memberId}`, kind: "opex", role: "player", status: "joined", opex: { ownerUserId: "dono", prompt: "", interviewMode: "autonomous", addedAt: new Date(), run: null, engramind: null } })
        const ref = { campaignId: id, memberId: String(memberId), characterName: "Brunna" }
        expect(await opexChars.provisionOpexCharacterAgent(ref)).toBe(true)
        at(1_200)
        await opexChars.saveOpexCharacterMemories(ref, [{ title: "Medo do escuro", text: "Brunna teme a cripta." }], 2)
        at(2_100)
        await opexChars.saveOpexCharacterMemories(ref, [{ title: "Medo do escuro", text: "Brunna venceu o medo." }, { title: "Dívida", text: "Devo ao ferreiro." }], 5)
        expect(remote("Medo do escuro")!.tags).toEqual(["personagem-opex", "turno:5", "gravado:2100"])
        await rewindTo({ asOf: 1_500, deleteAfter: 3_000 })
        expect(remote("Medo do escuro")).toMatchObject({ text: "Brunna teme a cripta.", status: "active" })
        expect(remote("Dívida")).toMatchObject({ status: "archived" })
    })
})
