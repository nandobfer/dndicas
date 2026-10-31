import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

const { MaddoxCampaignMemoryModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel } = await import("@/features/maddox/models")
const { findMaddoxTool, runMaddoxTool, MaddoxToolError } = await import("@/features/maddox/server/master-tools")

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
    it("save_npc grava pelo nome sem acento e sem caixa, sem duplicar; get_npc traz as notas do mestre", async () => {
        const id = await campaign()
        expect(await run("save_npc", id, { name: "Ângela", publicDescription: "Taverneira.", masterNotes: "Espiã." })).toMatchObject({ created: true })
        expect(await run("save_npc", id, { name: "angela", status: "dead" })).toMatchObject({ created: false })
        const npcs = await MaddoxNpcModel.find({ campaignId: id }).lean()
        expect(npcs).toHaveLength(1)
        expect(npcs[0]).toMatchObject({ name: "angela", publicDescription: "Taverneira.", masterNotes: "Espiã.", status: "dead" })
        expect(await run("get_npc", id, { name: "ANGELA" })).toMatchObject({ found: true, npc: { masterNotes: "Espiã." } })
        expect(await run("list_npcs", id, {})).toMatchObject({ npcs: [{ name: "angela" }] })
        expect((await run("list_npcs", id, {})) as { npcs: Record<string, unknown>[] }).not.toHaveProperty("npcs.0.masterNotes")
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

    it("texto longo é cortado (não invalida a chamada)", async () => {
        const id = await campaign()
        await run("save_memory", id, { kind: "fato", title: "Longo", text: "x".repeat(20_000) })
        const memory = await MaddoxCampaignMemoryModel.findOne({ campaignId: id }).lean()
        expect(memory!.text.length).toBe(8_000)
        expect(memory!.text.endsWith("…")).toBe(true)
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
