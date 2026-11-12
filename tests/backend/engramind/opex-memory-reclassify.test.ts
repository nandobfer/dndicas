import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, configureEngramind, resetEngramindRuntime, startDb, stopDb } from "./helpers"
import type { FakeEngramind } from "../../helpers/fake-engramind"
import type { AiStreamRequest } from "@/lib/ai/stream"

/**
 * Reclassificação única das memórias dos Opex (DND-57): as memórias que os Personagens e NPCs Opex gravaram sem
 * categoria (na padrão da rede, PROJECT_RULES) ganham a categoria escolhida pelo modelo; falha ou resposta inválida =
 * OUTRO; canais de Opex removidos (arquivados) também entram; a marca em `migration_marks` só vem quando termina.
 * Banco em memória isolado e Engramind falso — nunca o MongoDB da aplicação.
 */

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR", IMPORTAR: "IMPORTAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game", () => ({ publishGameChanged: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/settings", async () => {
    const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
    const settings = { ...DEFAULT_MADDOX_SETTINGS, enabled: true, main: { ...DEFAULT_MADDOX_SETTINGS.main, provider: "gemini" as const, model: "gemini-pro" } }
    return { loadMaddoxSettings: vi.fn(async () => ({ settings, isDefault: false, updatedAt: null })) }
})
const model = { available: true }
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => (model.available ? { available: true, reason: null } : { available: false, reason: "sem modelo" })) }))
const replies: (string | Error)[] = []
const generations: AiStreamRequest[] = []
vi.mock("@/lib/ai/stream", () => ({
    generateAiText: vi.fn(async (request: AiStreamRequest) => {
        generations.push(request)
        const next = replies.shift() ?? "{}"
        if (next instanceof Error) throw next
        return { text: next, usage: null, durationMs: 1 }
    }),
}))

const { runBootstrap } = await import("@/features/engramind/server/bootstrap")
const opexChars = await import("@/features/engramind/server/opex-characters")
const { engramindAgentClient, engramindAppClient } = await import("@/features/engramind/server/client")
const { ensureAgentSubscription } = await import("@/features/engramind/server/bootstrap")
const { reclassifyOpexMemories, categoriesFromAnswer } = await import("@/features/engramind/server/opex-memory-reclassify")
const { reclassifyOpexMemoriesOnce, waitForOpexMemoryReclassify } = await import("@/lib/db/migrations/reclassify-opex-memories")
const { opexCharacterChannel, opexNpcChannel, OPEX_CHARACTER_GLOBAL_CHANNEL } = await import("@/features/engramind/constants")
const { MaddoxCampaignModel, MaddoxCampaignMemberModel } = await import("@/features/maddox/models")

vi.setConfig({ testTimeout: 30_000 })

let mongo: MongoMemoryServer | undefined
let fake: FakeEngramind

async function opexMember(campaignId: string) {
    const _id = new mongoose.Types.ObjectId()
    await MaddoxCampaignMemberModel.create({ _id, campaignId, userId: `opex:${_id}`, kind: "opex", role: "player", status: "joined", opex: { ownerUserId: "dono", prompt: "", interviewMode: "autonomous", addedAt: new Date(), run: null, engramind: null } })
    const ref = { campaignId, memberId: String(_id), characterName: "Uther" }
    await opexChars.provisionOpexCharacterAgent(ref)
    return ref
}

/** Memória gravada como antes da DND-57: sem categoria (a padrão da rede, PROJECT_RULES). */
async function legacy(memberId: string, channel: string, title: string, text: string) {
    const client = await opexChars.opexCharacterClient(memberId)
    const result = (await client!.call("POST", "/v1/memories", { body: { channel, title, text } })) as { memory: { id: string; category: string } }
    expect(result.memory.category).toBe("PROJECT_RULES")
    return result.memory.id
}

const categoryOf = (id: string) => fake.state.memories.get(id)!.category

async function scene() {
    await runBootstrap("admin-1")
    const campaign = await MaddoxCampaignModel.create({ name: "Phandelver and Below", ownerId: "dono", rigor: "fiel-dnd", status: "active" })
    const campaignId = String(campaign._id)
    const uther = await opexMember(campaignId)
    const channel = opexCharacterChannel(campaignId, uther.memberId)
    const ids = {
        conversa: await legacy(uther.memberId, channel, "Interrogatório", "Afrouxei a lâmina e assumi a conversa."),
        nala: await legacy(uther.memberId, channel, "Proteger Nala", "Mantê-la sob o escudo, mesmo que a teimosia dela resista."),
    }
    // Já fora das regras: não é tocada.
    const client = await opexChars.opexCharacterClient(uther.memberId)
    const kept = ((await client!.call("POST", "/v1/memories", { body: { channel, title: "Medo", text: "Tenho medo do escuro.", category: "SENTIMENTO" } })) as { memory: { id: string } }).memory.id
    return { campaignId, uther, channel, ids, kept }
}

beforeAll(async () => {
    mongo = await startDb("engramind_opex_reclassify_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    await resetEngramindRuntime()
    fake = await configureEngramind()
    replies.length = 0
    generations.length = 0
    model.available = true
})

describe("reclassificação das memórias dos Opex (DND-57)", () => {
    it("cria as categorias novas abaixo de OUTRO e as assinaturas manage de prefixo dos agentes globais", async () => {
        await runBootstrap("admin-1")
        const priority = (key: string) => fake.state.categories.find((item) => item.key === key)!.priority
        for (const key of ["SENTIMENTO", "PLANO", "OPINIAO"]) expect(priority(key)).toBeLessThan(priority("OUTRO"))
        expect(fake.state.categories.find((item) => item.key === "OPINIAO")!.label).toBe("Opinião")
        const subs = fake.state.subscriptions.map((sub) => `${sub.agent}|${sub.target}|${sub.mode}`)
        expect(subs).toContain("dndicas/personagem-opex|dndicas/personagem-opex/*|manage")
        expect(subs).toContain("dndicas/npc-opex|dndicas/npc-opex/*|manage")
    })

    it("tira das categorias de regra as memórias dos canais individuais (inclusive arquivadas e de NPC); o que o modelo não decidir vira OUTRO", async () => {
        const { campaignId, uther, ids, kept } = await scene()
        // Memória arquivada no canal do Uther.
        const archived = await legacy(uther.memberId, opexCharacterChannel(campaignId, uther.memberId), "Antigo", "Ia na frente do grupo.")
        fake.state.memories.get(archived)!.status = "archived"
        // Canal de NPC Opex com memória legada.
        const app = await engramindAppClient()
        const npcChannel = opexNpcChannel(campaignId, String(new mongoose.Types.ObjectId()))
        await ensureAgentSubscription(app!, "dndicas/npc-opex", npcChannel, "inject")
        const npcClient = await engramindAgentClient("npc-opex")
        const npcMemory = ((await npcClient!.call("POST", "/v1/memories", { body: { channel: npcChannel, title: "Quem eu sou", text: "Goblin da tribo Cragmaw." } })) as { memory: { id: string } }).memory.id
        // Memória do canal global (orientação do dono) continua como está.
        const guidance = (await opexChars.createOpexGlobalMemory({ title: "Diálogo", text: "Deixe os jogadores conduzirem os diálogos." }, "admin-1")).id

        replies.push(
            JSON.stringify({ itens: [{ id: ids.conversa, categoria: "EVENTO" }, { id: ids.nala, categoria: "PLANO" }, { id: archived, categoria: "PROJECT_RULES" }] }),
            JSON.stringify({ itens: [{ id: npcMemory, categoria: "FATO" }] }),
        )
        const outcome = await reclassifyOpexMemories()
        expect(outcome).toMatchObject({ status: "done", changed: 4, skipped: 0, failed: 0 })
        expect(categoryOf(ids.conversa)).toBe("EVENTO")
        expect(categoryOf(ids.nala)).toBe("PLANO")
        expect(categoryOf(archived)).toBe("OUTRO")
        expect(fake.state.memories.get(archived)!.status).toBe("archived")
        expect(categoryOf(npcMemory)).toBe("FATO")
        expect(categoryOf(kept)).toBe("SENTIMENTO")
        expect(fake.state.memories.get(guidance)?.channel ?? OPEX_CHARACTER_GLOBAL_CHANNEL).toBe(OPEX_CHARACTER_GLOBAL_CHANNEL)
        expect(categoryOf(guidance)).toBe("PROJECT_RULES")
        // Uma geração por canal, com o modelo do Personagem Opex.
        expect(generations).toHaveLength(2)
        expect(generations[0]!.prompt).toContain("Afrouxei a lâmina e assumi a conversa.")

        // Nada mais com categoria de regra: rodar de novo não gera nem altera.
        const again = await reclassifyOpexMemories()
        expect(again).toMatchObject({ status: "done", changed: 0 })
        expect(generations).toHaveLength(2)
    })

    it("geração com falha ou resposta inválida = OUTRO", async () => {
        const { ids } = await scene()
        replies.push(new Error("provedor fora"))
        expect(await reclassifyOpexMemories()).toMatchObject({ status: "done", changed: 2 })
        expect([categoryOf(ids.conversa), categoryOf(ids.nala)]).toEqual(["OUTRO", "OUTRO"])
        expect([...categoriesFromAnswer([{ id: "a", channel: "c", title: null, text: "x", category: "PROJECT_RULES", version: 1 }], { itens: "lixo" }).values()]).toEqual(["OUTRO"])
    })

    it("canal de Opex removido (arquivado, agente desativado) é restaurado, ajustado e arquivado de novo", async () => {
        const { campaignId, uther, channel, ids } = await scene()
        await opexChars.retireOpexCharacterAgent({ campaignId, memberId: uther.memberId })
        expect(fake.state.channels.get(channel)!.archived_at).toBeTruthy()
        replies.push(JSON.stringify({ itens: [{ id: ids.conversa, categoria: "OPINIAO" }] }))
        expect(await reclassifyOpexMemories()).toMatchObject({ status: "done", changed: 2 })
        expect(categoryOf(ids.conversa)).toBe("OPINIAO")
        expect(categoryOf(ids.nala)).toBe("OUTRO")
        expect(fake.state.channels.get(channel)!.archived_at).toBeTruthy()
    })

    it("memória que mudou no meio do processo é ignorada (conflito de versão) e o resto segue", async () => {
        const { ids } = await scene()
        const { generateAiText } = await import("@/lib/ai/stream")
        vi.mocked(generateAiText).mockImplementationOnce(async (request: AiStreamRequest) => {
            generations.push(request)
            const memory = fake.state.memories.get(ids.nala)!
            memory.version += 1
            return { text: JSON.stringify({ itens: [{ id: ids.conversa, categoria: "EVENTO" }, { id: ids.nala, categoria: "PLANO" }] }), usage: null, durationMs: 1 } as never
        })
        expect(await reclassifyOpexMemories()).toMatchObject({ status: "done", changed: 1, skipped: 1 })
        expect(categoryOf(ids.conversa)).toBe("EVENTO")
        expect(categoryOf(ids.nala)).toBe("PROJECT_RULES")
    })

    it("sem modelo disponível nada muda e pede nova tentativa", async () => {
        const { ids } = await scene()
        model.available = false
        expect(await reclassifyOpexMemories()).toMatchObject({ status: "retry" })
        expect(categoryOf(ids.conversa)).toBe("PROJECT_RULES")
    })
})

describe("migração reclassify-opex-memories", () => {
    const marks = () => mongoose.connection.collection<{ _id: string }>("migration_marks")

    it("roda em segundo plano uma vez e grava a marca; com a marca, não roda de novo", async () => {
        const { ids } = await scene()
        await reclassifyOpexMemoriesOnce()
        await waitForOpexMemoryReclassify()
        expect(await marks().findOne({ _id: "reclassify-opex-memories" })).toBeTruthy()
        expect(categoryOf(ids.conversa)).toBe("OUTRO")

        const before = generations.length
        fake.state.memories.get(ids.conversa)!.category = "PROJECT_RULES"
        await reclassifyOpexMemoriesOnce()
        await waitForOpexMemoryReclassify()
        expect(generations.length).toBe(before)
        expect(categoryOf(ids.conversa)).toBe("PROJECT_RULES")
    })

    it("com o Engramind fora (ou sem modelo) não grava a marca, sem derrubar o boot", async () => {
        await scene()
        model.available = false
        await expect(reclassifyOpexMemoriesOnce()).resolves.toBeUndefined()
        await waitForOpexMemoryReclassify()
        expect(await marks().findOne({ _id: "reclassify-opex-memories" })).toBeNull()

        const { Integration } = await import("@/lib/db/models/Integration")
        await Integration.deleteMany({})
        const { invalidateStoredIntegrations } = await import("@/lib/integrations/store")
        invalidateStoredIntegrations()
        model.available = true
        await reclassifyOpexMemoriesOnce()
        await waitForOpexMemoryReclassify()
        expect(await marks().findOne({ _id: "reclassify-opex-memories" })).toBeNull()
    })
})
