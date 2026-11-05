import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

vi.mock("@/features/engramind/server/campaign-mirror", () => ({ mirrorCampaignMemoryLater: vi.fn(), searchCampaignMemories: vi.fn(async () => null) }))

const { MaddoxCampaignMemberModel, MaddoxCampaignMemoryModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel } = await import("@/features/maddox/models")
const { enqueueMaddoxJob, jobDraftChecks, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { findMaddoxTool, runMaddoxTool, MaddoxToolError } = await import("@/features/maddox/server/master-tools")
const { MADDOX_TOOL_TEXT_MAX } = await import("@/features/maddox/constants")

let mongo: MongoMemoryServer

const run = (name: string, campaignId: mongoose.Types.ObjectId, input: unknown, turnNumber = 1) => runMaddoxTool(findMaddoxTool(name)!, { campaignId, turnNumber }, input)

async function campaign() {
    return (await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "u1", rigor: "narrativo" }))._id
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_master_tools_test" })
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all([MaddoxCampaignModel.deleteMany({}), MaddoxNpcModel.deleteMany({}), MaddoxCampaignMemoryModel.deleteMany({}), MaddoxCharacterModel.deleteMany({})])
})

describe("ferramentas do Maddox narrador", () => {
    it("save_npc grava pelo nome sem acento e sem caixa, sem duplicar e mantendo a grafia gravada; get_npc traz as notas do mestre", async () => {
        const id = await campaign()
        expect(await run("save_npc", id, { name: "Ângela", publicDescription: "Taverneira.", masterNotes: "Espiã." })).toMatchObject({ created: true })
        expect(await run("save_npc", id, { name: "angela", status: "dead" })).toMatchObject({ created: false, name: "Ângela" })
        const npcs = await MaddoxNpcModel.find({ campaignId: id }).lean()
        expect(npcs).toHaveLength(1)
        expect(npcs[0]).toMatchObject({ name: "Ângela", publicDescription: "Taverneira.", masterNotes: "Espiã.", status: "dead" })
        expect(await run("get_npc", id, { name: "ANGELA" })).toMatchObject({ found: true, npc: { name: "Ângela", masterNotes: "Espiã." } })
        expect(await run("list_npcs", id, {})).toMatchObject({ npcs: [{ name: "Ângela" }] })
        expect((await run("list_npcs", id, {})) as { npcs: Record<string, unknown>[] }).not.toHaveProperty("npcs.0.masterNotes")
    })

    it("save_npc renomeia só com `newName` explícito e recusa um nome já usado por outro NPC", async () => {
        const id = await campaign()
        await run("save_npc", id, { name: "Ângela" })
        await run("save_npc", id, { name: "Bruno" })
        expect(await run("save_npc", id, { name: "angela", newName: "Ângela Ventobravo" })).toMatchObject({ created: false, name: "Ângela Ventobravo" })
        expect(await run("get_npc", id, { name: "angela ventobravo" })).toMatchObject({ found: true, npc: { name: "Ângela Ventobravo" } })
        expect(await run("get_npc", id, { name: "Ângela" })).toMatchObject({ found: false })
        await expect(run("save_npc", id, { name: "Bruno", newName: "ângela VENTOBRAVO" })).rejects.toThrow(/Já existe um NPC chamado/)
        expect(await MaddoxNpcModel.countDocuments({ campaignId: id })).toBe(2)
    })

    it("cada campanha só enxerga os próprios registros", async () => {
        const a = await campaign()
        const b = await campaign()
        await run("save_npc", a, { name: "Bartolomeu" })
        await run("save_memory", a, { kind: "local", title: "Farol", text: "Ao norte." })
        expect(await run("get_npc", b, { name: "Bartolomeu" })).toMatchObject({ found: false })
        expect(await run("search_memories", b, { query: "Farol" })).toEqual({ memories: [] })
    })

    it("save_memory: missão nasce ativa, atualiza por tipo + título e guarda o turno; busca por texto", async () => {
        const id = await campaign()
        await run("save_memory", id, { kind: "missao", title: "Reacender o farol", text: "Descobrir a causa." }, 2)
        await run("save_memory", id, { kind: "missao", title: "reacender o FAROL", text: "Concluída.", status: "concluida" }, 5)
        await run("save_memory", id, { kind: "local", title: "Reacender o farol", text: "Outro tipo, outro registro." }, 5)
        const quests = await MaddoxCampaignMemoryModel.find({ campaignId: id, kind: "missao" }).lean()
        expect(quests).toHaveLength(1)
        expect(quests[0]).toMatchObject({ status: "concluida", text: "Concluída.", turnNumber: 5, origin: "agent", createdBy: "maddox" })
        const local = await MaddoxCampaignMemoryModel.findOne({ campaignId: id, kind: "local" }).lean()
        expect(local!.status).toBeNull()
        expect(await run("search_memories", id, { query: "concluída" })).toMatchObject({ memories: [{ kind: "missao" }] })
        expect(await run("search_memories", id, { kind: "local" })).toMatchObject({ memories: [{ kind: "local" }] })
    })

    it("search_memories (Maddox 9): ignora acentos e caixa e acha por pedaço da palavra", async () => {
        const id = await campaign()
        await run("save_memory", id, { kind: "local", title: "Tavérna do Javali", text: "À beira da estrada." })
        for (const query of ["taverna", "TAVÉRNA", "javal", "a beira"]) expect(await run("search_memories", id, { query }), query).toMatchObject({ memories: [{ title: "Tavérna do Javali" }] })
        expect(await run("search_memories", id, { query: ".*" })).toEqual({ memories: [] })
    })

    it("estado e condição dos personagens avisam que os jogadores os leem (Maddox 9)", async () => {
        for (const name of ["update_campaign_state", "update_character_state"]) expect(findMaddoxTool(name)!.description, name).toContain("nunca grave segredos do mestre aqui")
    })

    it("teto de proteção: no limite grava inteiro; acima corta, não invalida a chamada e avisa o modelo (`truncated`)", async () => {
        const id = await campaign()
        const atLimit = await run("save_memory", id, { kind: "fato", title: "No limite", text: "x".repeat(MADDOX_TOOL_TEXT_MAX) })
        expect(atLimit).not.toHaveProperty("truncated")
        expect((await MaddoxCampaignMemoryModel.findOne({ campaignId: id, title: "No limite" }).lean())!.text).toHaveLength(MADDOX_TOOL_TEXT_MAX)

        const over = await run("save_memory", id, { kind: "fato", title: "Acima", text: "y".repeat(MADDOX_TOOL_TEXT_MAX + 1) })
        expect(over).toMatchObject({ saved: true, truncated: ["text"], note: expect.stringContaining("Consolide") })
        const memory = await MaddoxCampaignMemoryModel.findOne({ campaignId: id, title: "Acima" }).lean()
        expect(memory!.text).toHaveLength(MADDOX_TOOL_TEXT_MAX)
        expect(memory!.text.endsWith("…")).toBe(true)

        await MaddoxCharacterModel.create({ campaignId: id, memberId: new mongoose.Types.ObjectId(), userId: "u1", name: "Lyra" })
        expect(await run("update_character_state", id, { characterName: "Lyra", currentState: "z".repeat(MADDOX_TOOL_TEXT_MAX + 10) })).toMatchObject({ truncated: ["currentState"] })
        expect(await run("save_npc", id, { name: "Ana", masterNotes: "n".repeat(MADDOX_TOOL_TEXT_MAX + 1), publicDescription: "curta" })).toMatchObject({ truncated: ["masterNotes"] })
    })

    it("update_campaign_state grava só os campos enviados e o turno; get_campaign_state traz os personagens", async () => {
        const id = await campaign()
        await MaddoxCharacterModel.create({ campaignId: id, memberId: new mongoose.Types.ObjectId(), userId: "u1", name: "Lyra", currentState: "Ferida." })
        await run("update_campaign_state", id, { scene: "Cais", location: "Porto" }, 1)
        await run("update_campaign_state", id, { location: "Farol" }, 3)
        expect(await run("get_campaign_state", id, {})).toMatchObject({ state: { scene: "Cais", location: "Farol", updatedTurn: 3 }, characters: [{ name: "Lyra", currentState: "Ferida." }] })
    })

    it("update_character_state acha o personagem pelo nome e recusa quem não está na mesa", async () => {
        const id = await campaign()
        await MaddoxCharacterModel.create({ campaignId: id, memberId: new mongoose.Types.ObjectId(), userId: "u1", name: "Doran" })
        await run("update_character_state", id, { characterName: "doran", currentState: "Mão queimada." })
        expect((await MaddoxCharacterModel.findOne({ campaignId: id }).lean())!.currentState).toBe("Mão queimada.")
        await expect(run("update_character_state", id, { characterName: "Ninguém", currentState: "x" })).rejects.toBeInstanceOf(MaddoxToolError)
    })

    it("entrada inválida vira erro em pt-BR para o modelo", async () => {
        const id = await campaign()
        await expect(run("save_memory", id, { kind: "segredo", title: "x", text: "y" })).rejects.toThrow(/Entrada inválida para save_memory/)
    })
})

describe("request_check (Maddox 5)", () => {
    /** Roda `test` dentro de um job da fila com os metadados dados (como a geração do narrador). */
    async function inJob(campaignId: mongoose.Types.ObjectId, meta: { kind: "narration" | "answer"; round: number }, test: (jobId: string) => Promise<void>) {
        let failure: unknown = null
        await enqueueMaddoxJob(
            String(campaignId),
            "teste",
            async ({ jobId }) => {
                try {
                    await test(jobId)
                } catch (error) {
                    failure = error
                }
            },
            { ...meta, turnNumber: 2 },
        )
        await waitForCampaignIdle(String(campaignId))
        if (failure) throw failure
    }

    async function faithful(rigor: "fiel-dnd" | "narrativo" = "fiel-dnd") {
        const id = (await MaddoxCampaignModel.create({ name: "Cripta", ownerId: "u1", rigor }))._id
        const member = await MaddoxCampaignMemberModel.create({ campaignId: id, userId: "u2", role: "player", status: "joined" })
        const sheetId = new mongoose.Types.ObjectId()
        await MaddoxCharacterModel.create({ campaignId: id, memberId: member._id, userId: "u2", name: "Lyra", sheetId, interview: { status: "done", scriptVersion: 0 } })
        const other = await MaddoxCampaignMemberModel.create({ campaignId: id, userId: "u3", role: "player", status: "joined" })
        await MaddoxCharacterModel.create({ campaignId: id, memberId: other._id, userId: "u3", name: "Doran", sheetId: null, interview: { status: "done", scriptVersion: 0 } })
        return { id, memberId: String(member._id), sheetId: String(sheetId) }
    }

    const stealth = { personagem: "lyra", tipo: "pericia", pericia: "Furtividade", cd: 15, modo: "vantagem", motivo: "Passar pelos guardas" }
    const call = (id: mongoose.Types.ObjectId, jobId: string, input: unknown) => runMaddoxTool(findMaddoxTool("request_check")!, { campaignId: id, turnNumber: 2, jobId }, input)

    it("guarda o teste no job (nome sem caixa, atributo da perícia, modo e CD) e recusa um segundo para o mesmo personagem", async () => {
        const table = await faithful()
        await inJob(table.id, { kind: "narration", round: 0 }, async (jobId) => {
            const result = await call(table.id, jobId, stealth)
            expect(result).toMatchObject({ requested: true, check: "Furtividade (Destreza) para Lyra, CD 15, com vantagem" })
            expect(jobDraftChecks(String(table.id), jobId)).toEqual([
                expect.objectContaining({ memberId: table.memberId, characterName: "Lyra", sheetId: table.sheetId, kind: "skill", ability: "dexterity", skill: "Furtividade", dc: 15, mode: "advantage", reason: "Passar pelos guardas" }),
            ])
            await expect(call(table.id, jobId, stealth)).rejects.toThrow(/um teste por personagem/)
            await expect(call(table.id, jobId, { personagem: "Lyra", tipo: "resistencia", atributo: "Constituição", cd: 12, motivo: "Veneno" })).rejects.toThrow(/um teste por personagem/)
        })
    })

    it("motivo longo é gravado inteiro; só o teto de proteção corta, avisando o modelo (`truncated`)", async () => {
        const table = await faithful()
        const long = `Lyra tenta ${"esgueirar-se entre as colunas da cripta sem ser vista ".repeat(5)}`.trim()
        expect(long.length).toBeGreaterThan(200)
        await inJob(table.id, { kind: "narration", round: 0 }, async (jobId) => {
            const result = await call(table.id, jobId, { ...stealth, motivo: long })
            expect(result).not.toHaveProperty("truncated")
            expect(jobDraftChecks(String(table.id), jobId)[0]!.reason).toBe(long)
        })
        await inJob(table.id, { kind: "narration", round: 0 }, async (jobId) => {
            const result = await call(table.id, jobId, { ...stealth, motivo: "x".repeat(MADDOX_TOOL_TEXT_MAX + 50) })
            expect(result).toMatchObject({ truncated: ["motivo"] })
            expect(jobDraftChecks(String(table.id), jobId)[0]!.reason.length).toBeLessThanOrEqual(MADDOX_TOOL_TEXT_MAX)
        })
    })

    it("recusa campanha narrativa, resposta a pergunta, a última rodada, personagem sem ficha, desconhecido e perícia ausente", async () => {
        const narrative = await faithful("narrativo")
        await inJob(narrative.id, { kind: "narration", round: 0 }, async (jobId) => {
            await expect(call(narrative.id, jobId, stealth)).rejects.toThrow(/campanha é narrativa/)
        })
        const table = await faithful()
        await inJob(table.id, { kind: "answer", round: 0 }, async (jobId) => {
            await expect(call(table.id, jobId, stealth)).rejects.toThrow(/só são pedidos na narração/)
        })
        await inJob(table.id, { kind: "narration", round: 2 }, async (jobId) => {
            await expect(call(table.id, jobId, stealth)).rejects.toThrow(/Limite de testes/)
        })
        await inJob(table.id, { kind: "narration", round: 1 }, async (jobId) => {
            await expect(call(table.id, jobId, { ...stealth, personagem: "Doran" })).rejects.toThrow(/não tem ficha/)
            await expect(call(table.id, jobId, { ...stealth, personagem: "Ninguém" })).rejects.toThrow(/Nenhum personagem jogador chamado "Ninguém"/)
            await expect(call(table.id, jobId, { personagem: "Lyra", tipo: "pericia", cd: 10, motivo: "x" })).rejects.toThrow(/Informe a perícia/)
            await expect(call(table.id, jobId, { personagem: "Lyra", tipo: "atributo", cd: 10, motivo: "x" })).rejects.toThrow(/Informe o atributo/)
            await expect(call(table.id, jobId, { ...stealth, cd: 40 })).rejects.toThrow(/Entrada inválida/)
            expect(jobDraftChecks(String(table.id), jobId)).toHaveLength(0)
        })
    })
})
