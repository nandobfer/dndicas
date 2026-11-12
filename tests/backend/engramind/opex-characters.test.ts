import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"
import type { FakeEngramind } from "../../helpers/fake-engramind"

/**
 * Memórias dos Personagens Opex (DND-26): agente próprio com as 3 assinaturas exatas (global, Jogadores — nunca o
 * Mestre — e o canal individual), token cifrado no membro, gravação com chave (sem duplicar) e fila quando a rede
 * recusa, arquivamento com a campanha e na remoção, e as memórias globais da configuração.
 */

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game", () => ({ publishGameChanged: vi.fn(async () => undefined) }))

const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const opexChars = await import("@/features/engramind/server/opex-characters")
const { syncCampaignChannelLifecycle } = await import("@/features/engramind/server/campaign-channels")
const { flushPendingWrites } = await import("@/features/engramind/server/campaign-memories")
const { PendingWrite } = await import("@/features/engramind/server/pending-writes")
const { campaignChannel, opexCharacterChannel, OPEX_CHARACTER_GLOBAL_CHANNEL } = await import("@/features/engramind/constants")
const { MaddoxCampaignModel, MaddoxCampaignMemberModel } = await import("@/features/maddox/models")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer | undefined
let fake: FakeEngramind

async function setup() {
    const campaign = await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "dono", rigor: "narrativo", status: "active" })
    const _id = new mongoose.Types.ObjectId()
    await MaddoxCampaignMemberModel.create({ _id, campaignId: campaign._id, userId: `opex:${_id}`, kind: "opex", role: "player", status: "joined", opex: { ownerUserId: "dono", prompt: "", interviewMode: "autonomous", addedAt: new Date(), run: null, engramind: null } })
    return { campaignId: String(campaign._id), memberId: String(_id), characterName: "Brunna" }
}

beforeAll(async () => {
    mongo = await startDb("engramind_opex_characters_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
    fake = await configureEngramind()
})

describe("agente do Personagem Opex", () => {
    beforeEach(async () => {
        await runBootstrap("admin-1")
    })

    it("cria o agente, as 3 assinaturas exatas (nunca o canal do Mestre) e guarda o token cifrado; repetir não duplica", async () => {
        const ref = await setup()
        expect(await opexChars.provisionOpexCharacterAgent(ref)).toBe(true)
        const slug = `dndicas/personagem-opex-${ref.memberId}`
        expect(fake.state.agents.get(slug)).toBeTruthy()
        const subs = fake.state.subscriptions.filter((sub) => sub.agent === slug).map((sub) => `${sub.target}|${sub.mode}`)
        expect(subs.sort()).toEqual([`${OPEX_CHARACTER_GLOBAL_CHANNEL}|inject`, `${campaignChannel(ref.campaignId, "players")}|search`, `${opexCharacterChannel(ref.campaignId, ref.memberId)}|inject`].sort())
        expect(subs.some((sub) => sub.startsWith(campaignChannel(ref.campaignId, "master")))).toBe(false)
        expect(fake.state.channels.get(opexCharacterChannel(ref.campaignId, ref.memberId))).toBeTruthy()
        const stored = await MaddoxCampaignMemberModel.findById(ref.memberId).select("+opex.engramind.tokenBox").lean()
        expect(stored!.opex!.engramind).toMatchObject({ agentSlug: slug, channel: opexCharacterChannel(ref.campaignId, ref.memberId), error: null })
        expect(JSON.stringify(stored!.opex!.engramind!.tokenBox)).not.toContain("eng_")
        // A leitura normal nunca traz o token.
        expect((await MaddoxCampaignMemberModel.findById(ref.memberId).lean())!.opex!.engramind!.tokenBox).toBeUndefined()

        const counts = { subs: fake.state.subscriptions.length, tokens: fake.state.tokens.size }
        await opexChars.provisionOpexCharacterAgent(ref)
        expect({ subs: fake.state.subscriptions.length, tokens: fake.state.tokens.size }).toEqual(counts)
    })

    it("grava as memórias no canal individual pela chave do título (atualiza, não duplica); com a rede recusando, vai para a fila", async () => {
        const ref = await setup()
        await opexChars.provisionOpexCharacterAgent(ref)
        await opexChars.saveOpexCharacterMemories(ref, [{ title: "Confiança em Kael", text: "Kael parece corajoso." }])
        await opexChars.saveOpexCharacterMemories(ref, [{ title: "Confiança em Kael", text: "Kael mentiu para o grupo." }])
        const own = [...fake.state.memories.values()].filter((memory) => memory.channel === opexCharacterChannel(ref.campaignId, ref.memberId))
        expect(own).toHaveLength(1)
        expect(own[0]).toMatchObject({ text: "Kael mentiu para o grupo.", key: "opex:confianca-em-kael" })
        expect(own[0]!.author.agent).toBe(`dndicas/personagem-opex-${ref.memberId}`)

        // O teto real é o limite de texto do canal no Engramind.
        const max = fake.state.textMax
        await opexChars.saveOpexCharacterMemories(ref, [{ title: "Diário", text: "x".repeat(max + 500) }])
        expect([...fake.state.memories.values()].find((memory) => memory.key === "opex:diario")!.text.length).toBe(max)

        const original = fake.fetch
        vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/v1/memories") && init?.method === "POST") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
            return original(input as string, init)
        }) as typeof fetch)
        const result = await opexChars.saveOpexCharacterMemories(ref, [{ title: "Plano", text: "Fugir à noite." }])
        expect(result).toEqual({ saved: 0, pending: 1 })
        expect(await PendingWrite.findOne({ agentMemberId: ref.memberId }).lean()).toMatchObject({ channel: opexCharacterChannel(ref.campaignId, ref.memberId) })
        vi.stubGlobal("fetch", original)
        await runBootstrap("admin-1")
        await flushPendingWrites()
        expect(await PendingWrite.countDocuments({})).toBe(0)
        expect([...fake.state.memories.values()].some((memory) => memory.text === "Fugir à noite." && memory.author.agent === `dndicas/personagem-opex-${ref.memberId}`)).toBe(true)
    })

    it("o contexto vem com o token do Opex nos 3 canais", async () => {
        const ref = await setup()
        await opexChars.provisionOpexCharacterAgent(ref)
        await opexChars.saveOpexCharacterMemories(ref, [{ title: "Medo", text: "Tenho pavor de aranhas." }])
        const block = await opexChars.opexCharacterMemoryBlock(ref)
        expect(block.memories).toContain("Tenho pavor de aranhas.")
        expect(block.guidance).toBe("")
    })

    it("DND-57: as orientações do dono (canal global) voltam à parte das demais memórias, em chamadas independentes", async () => {
        const ref = await setup()
        await opexChars.provisionOpexCharacterAgent(ref)
        await opexChars.createOpexGlobalMemory({ title: "Diálogo", text: "Deixe os jogadores conduzirem os diálogos." }, "admin-1")
        await opexChars.saveOpexCharacterMemories(ref, [{ title: "Medo", text: "Tenho pavor de aranhas.", category: "SENTIMENTO" }])
        const block = await opexChars.opexCharacterMemoryBlock(ref)
        expect(block.guidance).toContain("Deixe os jogadores conduzirem os diálogos.")
        expect(block.guidance).not.toContain("Tenho pavor de aranhas.")
        expect(block.memories).toContain("Tenho pavor de aranhas.")
        expect(block.memories).not.toContain("Deixe os jogadores conduzirem")
        const contexts = fake.state.calls.filter((call) => call.path === "/v1/context").map((call) => call.query.channels)
        expect(contexts).toEqual(expect.arrayContaining([OPEX_CHARACTER_GLOBAL_CHANNEL, `${campaignChannel(ref.campaignId, "players")},${opexCharacterChannel(ref.campaignId, ref.memberId)}`]))

        // A falha das orientações não derruba as demais memórias.
        const original = fake.fetch
        vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = new URL(String(input))
            if (url.pathname === "/v1/context" && url.searchParams.get("channels") === OPEX_CHARACTER_GLOBAL_CHANNEL) return new Response(JSON.stringify({ error: { code: "INTERNAL", message: "x" } }), { status: 500 })
            return original(input as string, init)
        }) as typeof fetch)
        const partial = await opexChars.opexCharacterMemoryBlock(ref)
        vi.stubGlobal("fetch", original)
        expect(partial).toEqual({ guidance: "", memories: expect.stringContaining("Tenho pavor de aranhas.") })
    })

    it("DND-57: grava a categoria escolhida; inexistente na rede vira OUTRO, também na fila", async () => {
        const ref = await setup()
        await opexChars.provisionOpexCharacterAgent(ref)
        await opexChars.saveOpexCharacterMemories(ref, [
            { title: "Medo", text: "Tenho pavor de aranhas.", category: "SENTIMENTO" },
            { title: "Sem categoria", text: "Algo sem categoria." },
        ])
        const own = (key: string) => [...fake.state.memories.values()].find((memory) => memory.key === key)
        expect(own("opex:medo")!.category).toBe("SENTIMENTO")
        expect(own("opex:sem-categoria")!.category).toBe("OUTRO")

        // A categoria sumiu da rede (removida no Opex): a gravação cai em OUTRO em vez de se perder.
        fake.state.categories = fake.state.categories.filter((item) => item.key !== "PLANO")
        const { invalidateCategoryCache } = await import("@/features/engramind/server/categories")
        invalidateCategoryCache()
        await opexChars.saveOpexCharacterMemories(ref, [{ title: "Plano", text: "Fugir à noite.", category: "PLANO" }])
        expect(own("opex:plano")!.category).toBe("OUTRO")

        // Fila: o corpo guarda a categoria; a entrega aplica o mesmo fallback.
        const original = fake.fetch
        vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/v1/memories") && init?.method === "POST") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
            return original(input as string, init)
        }) as typeof fetch)
        await opexChars.saveOpexCharacterMemories(ref, [{ title: "Raiva", text: "Odeio o goblin.", category: "SENTIMENTO" }, { title: "Rota", text: "Ir a Phandalin.", category: "PLANO" }])
        vi.stubGlobal("fetch", original)
        const queued = await PendingWrite.find({ agentMemberId: ref.memberId }).lean()
        expect(queued.map((entry) => (entry.body as { category?: string }).category).sort()).toEqual(["OUTRO", "SENTIMENTO"])
        fake.state.categories = fake.state.categories.filter((item) => item.key !== "SENTIMENTO")
        await flushPendingWrites()
        expect(await PendingWrite.countDocuments({})).toBe(0)
        expect(own("opex:raiva")!.category).toBe("OUTRO")
        expect(own("opex:rota")!.category).toBe("OUTRO")
    })

    it("arquiva o canal individual com a campanha e restaura ao sair do arquivo; a remoção desativa o agente e revoga o token", async () => {
        const ref = await setup()
        await opexChars.provisionOpexCharacterAgent(ref)
        const channel = opexCharacterChannel(ref.campaignId, ref.memberId)
        await syncCampaignChannelLifecycle({ id: ref.campaignId, name: "Brumas", status: "archived" })
        expect(fake.state.channels.get(channel)!.archived_at).toBeTruthy()
        await syncCampaignChannelLifecycle({ id: ref.campaignId, name: "Brumas", status: "active" })
        expect(fake.state.channels.get(channel)!.archived_at).toBeFalsy()

        const stored = await MaddoxCampaignMemberModel.findById(ref.memberId).lean()
        await opexChars.retireOpexCharacterAgent(ref)
        expect(fake.state.channels.get(channel)!.archived_at).toBeTruthy()
        expect(fake.state.agents.get(`dndicas/personagem-opex-${ref.memberId}`)!.disabled_at).toBeTruthy()
        expect(fake.state.tokens.get(stored!.opex!.engramind!.tokenId!)!.status).toBe("revoked")
        expect(await opexChars.opexCharacterClient(ref.memberId)).toBeNull()
    })
})

describe("memórias globais do Personagem Opex", () => {
    it("inclui, lista, edita e remove no canal global", async () => {
        await runBootstrap("admin-1")
        const created = await opexChars.createOpexGlobalMemory({ title: "Coopere", text: "Prefira cooperar com o grupo." }, "admin-1")
        expect(fake.state.memories.get(created.id)).toMatchObject({ channel: OPEX_CHARACTER_GLOBAL_CHANNEL })
        expect(await opexChars.listOpexGlobalMemories()).toEqual([expect.objectContaining({ id: created.id, text: "Prefira cooperar com o grupo." })])
        await opexChars.updateOpexGlobalMemory(created.id, { title: "Coopere", text: "Coopere sempre." }, "admin-1")
        expect(fake.state.memories.get(created.id)!.text).toBe("Coopere sempre.")
        await opexChars.deleteOpexGlobalMemory(created.id, "admin-1")
        expect(await opexChars.listOpexGlobalMemories()).toEqual([])
    })
})
