import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"
import type { FakeEngramind } from "../../helpers/fake-engramind"

/**
 * Memórias dos NPCs Opex (DND-27): agente próprio com só 2 assinaturas exatas (global dos NPCs Opex e o individual; nunca
 * os canais Jogadores ou Mestre), memória inicial na promoção, nova promoção que restaura o canal e atualiza a memória
 * inicial, aposentadoria (arquiva, desativa, revoga), fila com `agentNpcId` e a entrega dela, ciclo de vida com a
 * campanha e as memórias globais da configuração (409 sem a rede).
 */

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game", () => ({ publishGameChanged: vi.fn(async () => undefined) }))

const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const npcs = await import("@/features/engramind/server/opex-npcs")
const domain = await import("@/features/maddox/server/opex-npcs")
const { syncCampaignChannelLifecycle } = await import("@/features/engramind/server/campaign-channels")
const { flushPendingWrites } = await import("@/features/engramind/server/campaign-memories")
const { PendingWrite } = await import("@/features/engramind/server/pending-writes")
const { withOpexNpcMemories } = await import("@/features/maddox/server/opex-memories")
const { campaignChannel, opexNpcChannel, OPEX_NPC_GLOBAL_CHANNEL } = await import("@/features/engramind/constants")
const { MaddoxCampaignModel, MaddoxNpcModel } = await import("@/features/maddox/models")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer | undefined
let fake: FakeEngramind

async function setup(overrides: { publicDescription?: string; masterNotes?: string } = {}) {
    const campaign = await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "dono", rigor: "narrativo", status: "active" })
    const npc = await MaddoxNpcModel.create({
        campaignId: campaign._id,
        name: "Gundren",
        nameKey: "gundren",
        publicDescription: overrides.publicDescription ?? "Anão mercador, primo dos Rockseeker.",
        masterNotes: overrides.masterNotes ?? "Sabe onde fica a Mina Perdida de Phandelver.",
        visibility: "players",
    })
    return { campaignId: String(campaign._id), npcId: String(npc._id), npcName: "Gundren" }
}

const channelMemories = (ref: { campaignId: string; npcId: string }) => [...fake.state.memories.values()].filter((memory) => memory.channel === opexNpcChannel(ref.campaignId, ref.npcId) && memory.status !== "archived")

beforeAll(async () => {
    mongo = await startDb("engramind_opex_npcs_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
    fake = await configureEngramind()
})

describe("agente do NPC Opex", () => {
    beforeEach(async () => {
        await runBootstrap("admin-1")
    })

    it("cria o agente com só as 2 assinaturas exatas inject (nunca Jogadores nem Mestre) e guarda o token cifrado", async () => {
        const ref = await setup()
        await MaddoxNpcModel.updateOne({ _id: ref.npcId }, { $set: { opex: { active: true, promotedAt: new Date(), promotedBy: "system:maddox", retiredAt: null, retiredReason: null, engramind: null } } })
        expect(await npcs.provisionOpexNpcAgent(ref)).toBe(true)
        const slug = `dndicas/npc-opex-${ref.npcId}`
        expect(fake.state.agents.get(slug)).toBeTruthy()
        const subs = fake.state.subscriptions.filter((sub) => sub.agent === slug).map((sub) => `${sub.target}|${sub.mode}`)
        expect(subs.sort()).toEqual([`${OPEX_NPC_GLOBAL_CHANNEL}|inject`, `${opexNpcChannel(ref.campaignId, ref.npcId)}|inject`].sort())
        expect(subs.some((sub) => sub.startsWith(campaignChannel(ref.campaignId, "players")) || sub.startsWith(campaignChannel(ref.campaignId, "master")))).toBe(false)
        const stored = await MaddoxNpcModel.findById(ref.npcId).select("+opex.engramind.tokenBox").lean()
        expect(stored!.opex!.engramind).toMatchObject({ agentSlug: slug, channel: opexNpcChannel(ref.campaignId, ref.npcId), error: null })
        expect(JSON.stringify(stored!.opex!.engramind!.tokenBox)).not.toContain("eng_")
        expect((await MaddoxNpcModel.findById(ref.npcId).lean())!.opex!.engramind!.tokenBox).toBeUndefined()
    })

    it("a promoção grava a descrição pública e as notas do mestre como memória inicial; o contexto vem com o token do NPC", async () => {
        const ref = await setup()
        await domain.promoteOpexNpc(ref.campaignId, { id: ref.npcId }, "system:maddox")
        await domain.waitForOpexNpcWork()
        const own = channelMemories(ref)
        expect(own.map((memory) => [memory.key, memory.title, memory.text]).sort()).toEqual(
            [
                ["npc-inicial:descricao", "Quem eu sou", "Anão mercador, primo dos Rockseeker."],
                ["npc-inicial:segredos", "Meus segredos", "Sabe onde fica a Mina Perdida de Phandelver."],
            ].sort(),
        )
        expect(own.every((memory) => memory.author.agent === `dndicas/npc-opex-${ref.npcId}`)).toBe(true)
        const block = await npcs.opexNpcMemoryBlock(ref)
        expect(block).toContain("Mina Perdida")
    })

    it("as memórias do agente e do Maddox usam a chave do título (atualiza, não duplica)", async () => {
        const ref = await setup({ masterNotes: "" })
        await domain.promoteOpexNpc(ref.campaignId, { id: ref.npcId }, "system:maddox")
        await domain.waitForOpexNpcWork()
        await npcs.saveOpexNpcMemories(ref, [{ title: "Desconfiança do grupo", text: "O grupo parece suspeito." }])
        await npcs.saveOpexNpcMemories(ref, [{ title: "Desconfiança do grupo", text: "O grupo salvou a minha vida." }], "Maddox")
        const subject = channelMemories(ref).filter((memory) => memory.key === "opex:desconfianca-do-grupo")
        expect(subject).toHaveLength(1)
        expect(subject[0]!.text).toBe("O grupo salvou a minha vida.")
        // Sem notas do mestre, a memória inicial só tem a descrição.
        expect(channelMemories(ref).some((memory) => memory.key === "npc-inicial:segredos")).toBe(false)
    })

    it("desfazer arquiva o canal, desativa o agente e revoga o token; promover de novo restaura as memórias e atualiza a inicial", async () => {
        const ref = await setup()
        await domain.promoteOpexNpc(ref.campaignId, { id: ref.npcId }, "system:maddox")
        await domain.waitForOpexNpcWork()
        await npcs.saveOpexNpcMemories(ref, [{ title: "Plano", text: "Fugir para Neverwinter." }])
        const channel = opexNpcChannel(ref.campaignId, ref.npcId)
        const tokenId = (await MaddoxNpcModel.findById(ref.npcId).lean())!.opex!.engramind!.tokenId!

        await domain.retireOpexNpc(ref.campaignId, { id: ref.npcId }, "maddox", "system:maddox")
        await domain.waitForOpexNpcWork()
        expect(fake.state.channels.get(channel)!.archived_at).toBeTruthy()
        expect(fake.state.agents.get(`dndicas/npc-opex-${ref.npcId}`)!.disabled_at).toBeTruthy()
        expect(fake.state.tokens.get(tokenId)!.status).toBe("revoked")
        expect(await npcs.opexNpcClient(ref.npcId)).toBeNull()
        expect((await MaddoxNpcModel.findById(ref.npcId).lean())!.opex).toMatchObject({ active: false, retiredReason: "maddox" })

        await MaddoxNpcModel.updateOne({ _id: ref.npcId }, { $set: { publicDescription: "Anão ferido, resgatado pelo grupo." } })
        await domain.promoteOpexNpc(ref.campaignId, { id: ref.npcId }, "dono")
        await domain.waitForOpexNpcWork()
        expect(fake.state.channels.get(channel)!.archived_at).toBeFalsy()
        expect(fake.state.agents.get(`dndicas/npc-opex-${ref.npcId}`)!.disabled_at).toBeFalsy()
        const own = channelMemories(ref)
        expect(own.find((memory) => memory.key === "opex:plano")!.text).toBe("Fugir para Neverwinter.")
        expect(own.filter((memory) => memory.key === "npc-inicial:descricao")).toEqual([expect.objectContaining({ text: "Anão ferido, resgatado pelo grupo." })])
    })

    it("com a rede recusando, a gravação vai para a fila com agentNpcId; a entrega usa o token do NPC e descarta quem deixou de ser Opex", async () => {
        const ref = await setup()
        await domain.promoteOpexNpc(ref.campaignId, { id: ref.npcId }, "system:maddox")
        await domain.waitForOpexNpcWork()
        const original = fake.fetch
        vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/v1/memories") && init?.method === "POST") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
            return original(input as string, init)
        }) as typeof fetch)
        expect(await npcs.saveOpexNpcMemories(ref, [{ title: "Espiões", text: "O grupo chegou a Vallaki." }], "Maddox")).toEqual({ saved: 0, pending: 1 })
        expect(await PendingWrite.findOne({ agentNpcId: ref.npcId }).lean()).toMatchObject({ channel: opexNpcChannel(ref.campaignId, ref.npcId), agentMemberId: null })
        vi.stubGlobal("fetch", original)
        await flushPendingWrites()
        expect(await PendingWrite.countDocuments({})).toBe(0)
        expect(channelMemories(ref).some((memory) => memory.text === "O grupo chegou a Vallaki." && memory.author.agent === `dndicas/npc-opex-${ref.npcId}`)).toBe(true)

        // Sem token (rede fora na promoção): a entrega provisiona o agente e entrega.
        await MaddoxNpcModel.updateOne({ _id: ref.npcId }, { $set: { "opex.engramind": null } })
        await PendingWrite.create({ _id: `${ref.campaignId}:npc:${ref.npcId}:opex:x`, campaignId: ref.campaignId, key: "opex:x", channel: opexNpcChannel(ref.campaignId, ref.npcId), body: { channel: opexNpcChannel(ref.campaignId, ref.npcId), key: "opex:x", upsert: true, title: "X", text: "Entregue depois." }, agentNpcId: ref.npcId })
        await flushPendingWrites()
        expect(await PendingWrite.countDocuments({})).toBe(0)
        expect(channelMemories(ref).some((memory) => memory.text === "Entregue depois.")).toBe(true)

        // Deixou de ser Opex: a entrada é descartada sem gravar.
        await domain.retireOpexNpc(ref.campaignId, { id: ref.npcId }, "owner", "dono")
        await domain.waitForOpexNpcWork()
        await PendingWrite.create({ _id: `${ref.campaignId}:npc:${ref.npcId}:opex:y`, campaignId: ref.campaignId, key: "opex:y", channel: opexNpcChannel(ref.campaignId, ref.npcId), body: { channel: opexNpcChannel(ref.campaignId, ref.npcId), key: "opex:y", upsert: true, title: "Y", text: "Nunca chega." }, agentNpcId: ref.npcId })
        await flushPendingWrites()
        expect(await PendingWrite.countDocuments({})).toBe(0)
        expect([...fake.state.memories.values()].some((memory) => memory.text === "Nunca chega.")).toBe(false)
    })

    it("arquivar e restaurar a campanha leva junto os canais dos NPCs Opex ativos", async () => {
        const ref = await setup()
        await domain.promoteOpexNpc(ref.campaignId, { id: ref.npcId }, "system:maddox")
        await domain.waitForOpexNpcWork()
        const channel = opexNpcChannel(ref.campaignId, ref.npcId)
        await syncCampaignChannelLifecycle({ id: ref.campaignId, name: "Brumas", status: "archived" })
        expect(fake.state.channels.get(channel)!.archived_at).toBeTruthy()
        await syncCampaignChannelLifecycle({ id: ref.campaignId, name: "Brumas", status: "active" })
        expect(fake.state.channels.get(channel)!.archived_at).toBeFalsy()
    })
})

describe("memórias globais dos NPCs Opex", () => {
    it("inclui, lista, edita e remove no canal global dos NPCs Opex", async () => {
        await runBootstrap("admin-1")
        const created = await npcs.createOpexNpcGlobalMemory({ title: "Estranhos", text: "NPCs desconfiam de estranhos armados." }, "admin-1")
        expect(fake.state.memories.get(created.id)).toMatchObject({ channel: OPEX_NPC_GLOBAL_CHANNEL })
        expect(await npcs.listOpexNpcGlobalMemories()).toEqual([expect.objectContaining({ id: created.id })])
        await npcs.updateOpexNpcGlobalMemory(created.id, { title: "Estranhos", text: "Desconfie sempre." }, "admin-1")
        expect(fake.state.memories.get(created.id)!.text).toBe("Desconfie sempre.")
        await npcs.deleteOpexNpcGlobalMemory(created.id, "admin-1")
        expect(await npcs.listOpexNpcGlobalMemories()).toEqual([])
    })

    it("sem a rede de memórias, responde 409 ENGRAMIND_UNAVAILABLE em pt-BR", async () => {
        const [{ Integration }, { invalidateStoredIntegrations }] = await Promise.all([import("@/lib/db/models/Integration"), import("@/lib/integrations/store")])
        await Integration.deleteMany({})
        invalidateStoredIntegrations()
        await resetEngramindRuntime()
        await expect(withOpexNpcMemories((memories) => memories.listOpexNpcGlobalMemories())).rejects.toMatchObject({ status: 409, code: "ENGRAMIND_UNAVAILABLE", message: expect.stringContaining("NPCs Opex") })
    })
})
