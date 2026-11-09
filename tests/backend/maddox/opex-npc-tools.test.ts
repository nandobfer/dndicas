import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { MaddoxAnswerContext, MaddoxMasterSink, MaddoxNarrationContext } from "@/features/maddox/server/game-master"
import type { AiStreamRequest } from "@/lib/ai/stream"

/**
 * NPCs Opex (DND-27) no Maddox: ferramentas do narrador (promover, desfazer, gravar memória fora de cena, consultar o
 * agente só nas narrações), recusas e limite da configuração, morte pelo `save_npc`, ações do dono (auditadas), o chip e
 * `canManageOpexNpcs` no estado da mesa e a linha de falha do agente só para o dono. O mestre é falso (chama a consulta
 * como o narrador chamaria); o modelo do NPC é o `generateAiText` roteirizado; a rede de memórias é um registro em memória.
 */

const recordAudit = vi.fn(async () => undefined)
const publishToChannels = vi.fn(async () => undefined)
const npcReplies: (string | Error)[] = []
const npcCalls: AiStreamRequest[] = []
const settingsState: { opexNpcLimit: number | null } = { opexNpcLimit: null }
const access: { userId: string | null; permissions: string[] } = { userId: null, permissions: [] }

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
vi.mock("@/features/maddox/server/settings", async () => {
    const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
    const base = { ...DEFAULT_MADDOX_SETTINGS, enabled: true, main: { ...DEFAULT_MADDOX_SETTINGS.main, provider: "gemini" as const, model: "gemini-pro" }, opexCharacterInstructions: "Instruções do Personagem Opex." }
    return {
        loadMaddoxSettings: vi.fn(async () => ({ settings: { ...base, opexNpcLimit: settingsState.opexNpcLimit }, isDefault: false, updatedAt: null })),
        maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
    }
})
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/perfix/server/auth", () => ({
    optionalAccess: vi.fn(async () => (access.userId ? { userId: access.userId, effective: new Set(access.permissions) } : null)),
}))
vi.mock("@/lib/ai/stream", () => ({
    generateAiText: vi.fn(async (request: AiStreamRequest) => {
        npcCalls.push(request)
        const next = npcReplies.shift() ?? JSON.stringify({ fala: "Hm.", acao: "Observa.", memorias: [] })
        if (next instanceof Error) throw next
        return { text: next, usage: null, durationMs: 1 }
    }),
}))
vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)

/** Rede de memórias dos NPCs Opex em memória: canal individual por NPC (a lógica real é testada em engramind/opex-npcs). */
const npcMemories = new Map<string, Map<string, { title: string; text: string }>>()
const engramindNpcs = {
    provisionOpexNpcAgent: vi.fn(async () => true),
    retireOpexNpcAgent: vi.fn(async () => undefined),
    seedOpexNpcInitialMemories: vi.fn(async (ref: { npcId: string }, input: { publicDescription: string; masterNotes: string }) => {
        const own = npcMemories.get(ref.npcId) ?? new Map()
        if (input.publicDescription) own.set("npc-inicial:descricao", { title: "Quem eu sou", text: input.publicDescription })
        if (input.masterNotes) own.set("npc-inicial:segredos", { title: "Meus segredos", text: input.masterNotes })
        npcMemories.set(ref.npcId, own)
        return { saved: own.size, pending: 0 }
    }),
    saveOpexNpcMemories: vi.fn(async (ref: { npcId: string }, memories: { title: string; text: string }[]) => {
        const own = npcMemories.get(ref.npcId) ?? new Map()
        for (const memory of memories) own.set(`opex:${memory.title.toLowerCase()}`, memory)
        npcMemories.set(ref.npcId, own)
        return { saved: memories.length, pending: 0 }
    }),
    opexNpcMemoryBlock: vi.fn(async (ref: { npcId: string }) => [...(npcMemories.get(ref.npcId)?.values() ?? [])].map((memory) => `- ${memory.title}: ${memory.text}`).join("\n")),
}
vi.mock("@/features/engramind/server/opex-npcs", () => engramindNpcs)

/** O narrador falso: `consults` é o que ele pede ao agente de NPC Opex durante a narração (como o Maddox pediria). */
const masterScript: { consults: { npc: string; situacao: string }[]; answers: unknown[] } = { consults: [], answers: [] }
const fakeMaster = {
    narrate: vi.fn(async (context: MaddoxNarrationContext, sink: MaddoxMasterSink) => {
        const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")
        for (const consult of masterScript.consults) masterScript.answers.push(await runMaddoxTool(findMaddoxTool("consultar_npc_opex")!, { campaignId: new mongoose.Types.ObjectId(context.campaignId), turnNumber: context.turnNumber, jobId: context.jobId }, consult))
        const text = "Gundren aparece na estrada."
        sink.delta(text)
        return text
    }),
    answer: vi.fn(async (context: MaddoxAnswerContext, sink: MaddoxMasterSink) => {
        sink.delta("Resposta.")
        return "Resposta."
    }),
}
vi.mock("@/features/maddox/server/game-master", () => ({ getMaddoxMaster: vi.fn(async () => fakeMaster) }))

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const domain = await import("@/features/maddox/server/opex-npcs")
const { enqueueMaddoxJob, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { waitForOpexIdle } = await import("@/features/maddox/server/opex-runtime")
const { buildMaddoxAiTools, findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")
const { campaignMemoriesStore } = await import("../../helpers/campaign-memories-mock")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function settle(id: string) {
    for (let round = 0; round < 6; round++) {
        await waitForCampaignIdle(id)
        await waitForOpexIdle()
        await domain.waitForOpexNpcWork()
        await sleep(10)
    }
}

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

/** Campanha com dono, um jogador e os NPCs Gundren (conhecido) e Strahd (só do mestre). */
async function table() {
    const owner = await seedUser("dono")
    const player = await seedUser("jogador")
    const created = await campaigns.createCampaign({ name: "Phandelver", rigor: "narrativo" }, owner)
    const campaignId = new mongoose.Types.ObjectId(created.id)
    await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { "scenarioInterview.status": "done", openingSituation: "Estrada para Phandalin." } })
    const ownerMember = await MaddoxCampaignMemberModel.findOne({ campaignId, userId: owner }).lean()
    const kael = await MaddoxCharacterModel.create({ campaignId, memberId: ownerMember!._id, userId: owner, name: "Kael", interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: ownerMember!._id }, { $set: { characterId: kael._id } })
    const playerMember = await MaddoxCampaignMemberModel.create({ campaignId, userId: player, role: "player", status: "joined", joinedAt: new Date() })
    const lyra = await MaddoxCharacterModel.create({ campaignId, memberId: playerMember._id, userId: player, name: "Lyra", interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: playerMember._id }, { $set: { characterId: lyra._id } })
    const gundren = await MaddoxNpcModel.create({ campaignId, name: "Gundren", nameKey: "gundren", publicDescription: "Anão mercador.", masterNotes: "Sabe onde fica a mina.", visibility: "players" })
    const strahd = await MaddoxNpcModel.create({ campaignId, name: "Strahd", nameKey: "strahd", publicDescription: "Um nobre pálido.", masterNotes: "Vampiro.", visibility: "master" })
    return { id: created.id, campaignId, owner, player, gundren: String(gundren._id), strahd: String(strahd._id) }
}

const run = (name: string, campaignId: mongoose.Types.ObjectId, input: unknown, jobId?: string) => runMaddoxTool(findMaddoxTool(name)!, { campaignId, turnNumber: 1, jobId }, input)

/** Roda a ferramenta dentro de um job da fila (narração ou resposta), como no turno do mestre. */
async function inJob<T>(campaignId: mongoose.Types.ObjectId, kind: "narration" | "answer", work: (jobId: string) => Promise<T>): Promise<T> {
    let result: { value?: T; error?: unknown } = {}
    await enqueueMaddoxJob(
        String(campaignId),
        "teste",
        async ({ jobId }) => {
            try {
                result = { value: await work(jobId) }
            } catch (error) {
                result = { error }
            }
        },
        { kind, turnNumber: 1, round: 0 },
    )
    if ("error" in result && result.error) throw result.error
    return result.value as T
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_opex_npc_tools_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxNpcModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all([mongoose.connection.collection("users").deleteMany({}), MaddoxCampaignModel.deleteMany({}), MaddoxCampaignMemberModel.deleteMany({}), MaddoxCharacterModel.deleteMany({}), MaddoxCampaignMessageModel.deleteMany({}), MaddoxNpcModel.deleteMany({})])
    campaignMemoriesStore.reset()
    npcMemories.clear()
    npcReplies.length = 0
    npcCalls.length = 0
    settingsState.opexNpcLimit = null
    access.userId = null
    access.permissions = []
    masterScript.consults = []
    masterScript.answers = []
    recordAudit.mockClear()
    publishToChannels.mockClear()
    Object.values(engramindNpcs).forEach((fn) => fn.mockClear())
})

describe("promover e desfazer pelo Maddox", () => {
    it("promove um NPC conhecido e um só do mestre, grava a memória inicial e não cria mensagem; já Opex não muda", async () => {
        const t = await table()
        expect(await run("promover_npc_opex", t.campaignId, { npc: "gundren" })).toMatchObject({ npc: "Gundren", promovido: true })
        expect(await run("promover_npc_opex", t.campaignId, { npc: "Strahd" })).toMatchObject({ npc: "Strahd", promovido: true })
        await domain.waitForOpexNpcWork()
        expect((await MaddoxNpcModel.findById(t.gundren).lean())!.opex).toMatchObject({ active: true, promotedBy: "system:maddox", retiredReason: null })
        expect(engramindNpcs.provisionOpexNpcAgent).toHaveBeenCalledTimes(2)
        expect(engramindNpcs.seedOpexNpcInitialMemories).toHaveBeenCalledWith({ campaignId: t.id, npcId: t.gundren, npcName: "Gundren" }, { publicDescription: "Anão mercador.", masterNotes: "Sabe onde fica a mina." })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: t.campaignId })).toBe(0)
        expect(publishToChannels).toHaveBeenCalled()

        expect(await run("promover_npc_opex", t.campaignId, { npc: "Gundren" })).toMatchObject({ jaOpex: true, nota: "Gundren já é NPC Opex: nada mudou." })
        expect(engramindNpcs.provisionOpexNpcAgent).toHaveBeenCalledTimes(2)
    })

    it("recusa NPC inexistente (com a lista), morto, limite 0, limite atingido e campanha encerrada ou arquivada", async () => {
        const t = await table()
        await expect(run("promover_npc_opex", t.campaignId, { npc: "Sildar" })).rejects.toThrow('Nenhum NPC "Sildar" nesta campanha. NPCs: Gundren, Strahd.')
        await MaddoxNpcModel.updateOne({ _id: t.strahd }, { $set: { status: "dead" } })
        await expect(run("promover_npc_opex", t.campaignId, { npc: "Strahd" })).rejects.toThrow("Strahd está morto: um NPC morto não pode ser promovido a NPC Opex.")
        settingsState.opexNpcLimit = 0
        await expect(run("promover_npc_opex", t.campaignId, { npc: "Gundren" })).rejects.toThrow("A promoção de NPCs Opex está desligada nesta configuração.")
        settingsState.opexNpcLimit = 1
        await MaddoxNpcModel.create({ campaignId: t.campaignId, name: "Sildar", nameKey: "sildar", visibility: "players" })
        await run("promover_npc_opex", t.campaignId, { npc: "Sildar" })
        await expect(run("promover_npc_opex", t.campaignId, { npc: "Gundren" })).rejects.toThrow("Limite de 1 NPC Opex desta campanha atingido.")
        settingsState.opexNpcLimit = null
        await MaddoxCampaignModel.updateOne({ _id: t.campaignId }, { $set: { status: "ended" } })
        await expect(run("promover_npc_opex", t.campaignId, { npc: "Gundren" })).rejects.toThrow("A campanha foi encerrada: não dá para promover NPCs Opex.")
        await expect(run("desfazer_npc_opex", t.campaignId, { npc: "Sildar" })).rejects.toThrow("A campanha foi encerrada: não dá para desfazer NPCs Opex.")
        await MaddoxCampaignModel.updateOne({ _id: t.campaignId }, { $set: { status: "archived" } })
        await expect(run("promover_npc_opex", t.campaignId, { npc: "Gundren" })).rejects.toThrow("A campanha foi arquivada: não dá para promover NPCs Opex.")
        expect((await MaddoxNpcModel.findById(t.gundren).lean())!.opex ?? null).toBeNull()
    })

    it("baixar o limite não desfaz ninguém: só bloqueia novas promoções", async () => {
        const t = await table()
        await run("promover_npc_opex", t.campaignId, { npc: "Gundren" })
        await run("promover_npc_opex", t.campaignId, { npc: "Strahd" })
        settingsState.opexNpcLimit = 1
        await MaddoxNpcModel.create({ campaignId: t.campaignId, name: "Sildar", nameKey: "sildar", visibility: "players" })
        await expect(run("promover_npc_opex", t.campaignId, { npc: "Sildar" })).rejects.toThrow("Limite de 1 NPC Opex desta campanha atingido.")
        expect(await MaddoxNpcModel.countDocuments({ campaignId: t.campaignId, "opex.active": true })).toBe(2)
    })

    it("desfazer desliga a marca e aposenta o agente; NPC que não é Opex não muda; a morte pelo save_npc desfaz sozinha", async () => {
        const t = await table()
        await run("promover_npc_opex", t.campaignId, { npc: "Gundren" })
        expect(await run("desfazer_npc_opex", t.campaignId, { npc: "Gundren" })).toMatchObject({ desfeito: true })
        await domain.waitForOpexNpcWork()
        expect(engramindNpcs.retireOpexNpcAgent).toHaveBeenCalledWith({ campaignId: t.id, npcId: t.gundren }, "system:maddox")
        expect((await MaddoxNpcModel.findById(t.gundren).lean())!.opex).toMatchObject({ active: false, retiredReason: "maddox" })
        expect(await run("desfazer_npc_opex", t.campaignId, { npc: "Gundren" })).toMatchObject({ naoOpex: true })

        await run("promover_npc_opex", t.campaignId, { npc: "Gundren" })
        expect(await run("save_npc", t.campaignId, { name: "Gundren", status: "dead" })).toMatchObject({ npcOpex: "deixou de ser NPC Opex (morreu)" })
        expect((await MaddoxNpcModel.findById(t.gundren).lean())!.opex).toMatchObject({ active: false, retiredReason: "death" })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: t.campaignId })).toBe(0)
    })
})

describe("memória fora de cena e consulta ao agente", () => {
    it("gravar_memoria_npc_opex grava no canal do NPC sem acionar o agente, e a memória entra na consulta seguinte", async () => {
        const t = await table()
        await expect(run("gravar_memoria_npc_opex", t.campaignId, { npc: "Gundren", titulo: "Espiões", texto: "O grupo chegou a Vallaki." })).rejects.toThrow("Gundren não é NPC Opex")
        await run("promover_npc_opex", t.campaignId, { npc: "Gundren" })
        await domain.waitForOpexNpcWork()
        expect(await run("gravar_memoria_npc_opex", t.campaignId, { npc: "Gundren", titulo: "Espiões", texto: "O grupo chegou a Vallaki." })).toMatchObject({ gravada: true })
        expect(npcCalls).toHaveLength(0)

        npcReplies.push(JSON.stringify({ fala: "Vocês chegaram rápido a Vallaki!", acao: "Aperta a mão de Kael.", memorias: [{ titulo: "Confiança no grupo", texto: "Kael parece honesto." }] }))
        const answer = await inJob(t.campaignId, "narration", (jobId) => run("consultar_npc_opex", t.campaignId, { npc: "Gundren", situacao: "O grupo encontra Gundren na estrada." }, jobId))
        expect(answer).toMatchObject({ npc: "Gundren", fala: "Vocês chegaram rápido a Vallaki!", acao: "Aperta a mão de Kael." })
        expect(npcCalls).toHaveLength(1)
        const instructions = String(npcCalls[0]!.instructions)
        expect(instructions).toContain("Você é um NPC da campanha")
        expect(instructions).toContain("O grupo chegou a Vallaki.")
        expect(instructions).toContain("Sabe onde fica a mina.")
        expect(String(npcCalls[0]!.prompt)).toContain("O grupo encontra Gundren na estrada.")
        expect(npcCalls[0]!.consumption).toMatchObject({ origin: "maddox-opex-npc" })
        expect(npcMemories.get(t.gundren)!.get("opex:confiança no grupo")).toMatchObject({ text: "Kael parece honesto." })
    })

    it("na mesma narração reaproveita a decisão; na resposta a uma pergunta recusa e a AI SDK nem oferece a consulta", async () => {
        const t = await table()
        await run("promover_npc_opex", t.campaignId, { npc: "Gundren" })
        npcReplies.push(JSON.stringify({ fala: "Olá.", acao: "Acena." }))
        const [first, second] = await inJob(t.campaignId, "narration", async (jobId) => [
            await run("consultar_npc_opex", t.campaignId, { npc: "Gundren", situacao: "Cena 1." }, jobId),
            await run("consultar_npc_opex", t.campaignId, { npc: "Gundren", situacao: "Cena 2." }, jobId),
        ])
        expect(second).toEqual(first)
        expect(npcCalls).toHaveLength(1)
        await expect(inJob(t.campaignId, "answer", (jobId) => run("consultar_npc_opex", t.campaignId, { npc: "Gundren", situacao: "Cena." }, jobId))).rejects.toThrow("Nas respostas a perguntas, decida você mesmo pelo NPC.")
        expect(Object.keys(await buildMaddoxAiTools({ campaignId: t.campaignId, turnNumber: 1 }, { opexNpcs: false }))).not.toContain("consultar_npc_opex")
        const narration = Object.keys(await buildMaddoxAiTools({ campaignId: t.campaignId, turnNumber: 1 }, { opexNpcs: true }))
        expect(narration).toEqual(expect.arrayContaining(["promover_npc_opex", "desfazer_npc_opex", "gravar_memoria_npc_opex", "consultar_npc_opex"]))
    })
})

describe("mesa: chip, ações do dono e a linha de falha", () => {
    it("a falha do agente não trava a narração e a linha com o motivo só chega ao dono (estado e histórico)", async () => {
        const t = await table()
        await run("promover_npc_opex", t.campaignId, { npc: "Gundren" })
        masterScript.consults = [{ npc: "Gundren", situacao: "Gundren aparece." }]
        npcReplies.push(new Error("MARCADOR-SECRETO provedor fora"))
        await game.startCampaign(t.id, t.owner)
        await settle(t.id)
        expect(masterScript.answers[0]).toMatchObject({ npc: "Gundren", falhou: true, nota: "O NPC Opex não respondeu: decida você o que Gundren fala e faz nesta narração." })
        expect(JSON.stringify(masterScript.answers[0])).not.toContain("MARCADOR-SECRETO")

        const ownerState = await game.getGameState(t.id, t.owner)
        const narration = ownerState.messages.find((message) => message.kind === "narration")!
        expect(narration.content).toBe("Gundren aparece na estrada.")
        expect(narration.opexNpcFailures).toEqual([{ npcName: "Gundren", reason: expect.stringContaining("MARCADOR-SECRETO") }])

        const playerState = await game.getGameState(t.id, t.player)
        expect(playerState.messages.find((message) => message.kind === "narration")).not.toHaveProperty("opexNpcFailures")
        expect(JSON.stringify(playerState)).not.toContain("MARCADOR-SECRETO")
        const page = await game.listGameMessages(t.id, null, t.player)
        expect(JSON.stringify(page)).not.toContain("MARCADOR-SECRETO")
        const ownerPage = await game.listGameMessages(t.id, null, t.owner)
        expect(JSON.stringify(ownerPage)).toContain("MARCADOR-SECRETO")
    })

    it("o chip vale para todos só nos NPCs conhecidos; canManageOpexNpcs só para o dono com a permissão", async () => {
        const t = await table()
        await run("promover_npc_opex", t.campaignId, { npc: "Gundren" })
        await run("promover_npc_opex", t.campaignId, { npc: "Strahd" })
        await game.startCampaign(t.id, t.owner)
        await settle(t.id)
        const playerState = await game.getGameState(t.id, t.player)
        expect(playerState.npcs).toEqual([expect.objectContaining({ name: "Gundren", opex: true })])
        expect(playerState.canManageOpexNpcs).toBe(false)

        expect((await game.getGameState(t.id, t.owner)).canManageOpexNpcs).toBe(false)
        access.userId = t.owner
        access.permissions = ["maddox.play", "maddox.opex"]
        expect((await game.getGameState(t.id, t.owner)).canManageOpexNpcs).toBe(true)
        access.userId = t.player
        expect((await game.getGameState(t.id, t.player)).canManageOpexNpcs).toBe(false)

        // NPC Opex que volta a ser só do mestre: o chip some e ele continua Opex.
        await MaddoxNpcModel.updateOne({ _id: t.gundren }, { $set: { visibility: "master" } })
        expect((await game.getGameState(t.id, t.player)).npcs).toEqual([])
        expect((await MaddoxNpcModel.findById(t.gundren).lean())!.opex!.active).toBe(true)
    })

    it("o dono promove e remove NPCs conhecidos (auditado); jogador recebe 403, quem não participa e NPC só do mestre 404", async () => {
        const t = await table()
        await game.startCampaign(t.id, t.owner)
        await settle(t.id)
        const promoted = await domain.promoteOpexNpcAsOwner(t.id, t.gundren, t.owner)
        expect(promoted.npcs).toEqual([expect.objectContaining({ name: "Gundren", opex: true })])
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: t.owner, entidadeId: t.id, depois: { npcOpex: t.gundren, nome: "Gundren", acao: "promover" } }))
        expect((await MaddoxNpcModel.findById(t.gundren).lean())!.opex).toMatchObject({ active: true, promotedBy: t.owner })

        const removed = await domain.retireOpexNpcAsOwner(t.id, t.gundren, t.owner)
        expect(removed.npcs).toEqual([expect.objectContaining({ name: "Gundren" })])
        expect(removed.npcs[0]).not.toHaveProperty("opex")
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: { npcOpex: t.gundren, nome: "Gundren", acao: "remover" } }))
        expect((await MaddoxNpcModel.findById(t.gundren).lean())!.opex).toMatchObject({ active: false, retiredReason: "owner" })

        await expect(domain.promoteOpexNpcAsOwner(t.id, t.gundren, t.player)).rejects.toMatchObject({ status: 403, message: "Só o dono da campanha pode cuidar dos NPCs Opex." })
        await expect(domain.promoteOpexNpcAsOwner(t.id, t.gundren, "estranho")).rejects.toMatchObject({ status: 404 })
        await expect(domain.promoteOpexNpcAsOwner(t.id, t.strahd, t.owner)).rejects.toMatchObject({ status: 404, message: "NPC não encontrado" })
        settingsState.opexNpcLimit = 0
        await expect(domain.promoteOpexNpcAsOwner(t.id, t.gundren, t.owner)).rejects.toMatchObject({ status: 409, code: "OPEX_NPC_DISABLED" })
        settingsState.opexNpcLimit = null
        await MaddoxCampaignModel.updateOne({ _id: t.campaignId }, { $set: { status: "ended" } })
        await expect(domain.promoteOpexNpcAsOwner(t.id, t.gundren, t.owner)).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_CLOSED", message: "A campanha foi encerrada: não dá para promover NPCs Opex." })
    })
})
