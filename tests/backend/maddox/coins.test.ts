import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose, { Types } from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * DND-65: as moedas são campo da ficha. O Maddox vê o saldo, soma e subtrai pela ficha (narração, "Pergunte ao mestre",
 * lembrete, preparação e ajuste do combate), com auditoria, linha na mesa e ficha aberta atualizada. Subtrair mais do que
 * existe é recusado com o motivo, e moeda nunca vira item do inventário.
 */

const recordAudit = vi.fn<(entry: Record<string, unknown>) => Promise<undefined>>(async () => undefined)
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR" } }))
const sheetPusher = vi.hoisted(() => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({ CharacterSheetPusherService: { getInstance: () => sheetPusher } }))
vi.mock("@/features/maddox/server/combat-classifier", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/combat-classifier")>()), resolveProfiles: vi.fn(async () => new Map()) }))

const { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const runs = await import("@/features/maddox/server/question-runs")
const tools = await import("@/features/maddox/server/question-sheet-tools")
const { applySheetChanges } = await import("@/features/maddox/server/combat-sheet-writes")
const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")
const { sheetSummary } = await import("@/features/maddox/check-modifier")

let mongo: MongoMemoryServer

interface Table {
    campaignId: Types.ObjectId
    owner: string
    player: string
    liz: { _id: Types.ObjectId; sheetId: Types.ObjectId }
    ravel: { _id: Types.ObjectId; sheetId: Types.ObjectId }
}

async function sheet(name: string, coins: Record<string, number>) {
    const _id = new Types.ObjectId()
    await CharacterSheet.collection.insertOne({ _id, slug: `ficha-${String(_id)}`, userId: "player", name, level: 1, strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 12, charisma: 10, hpMax: 9, hpCurrent: 9, spellSlots: {}, resourceCharges: [], coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...coins }, createdAt: new Date(), updatedAt: new Date() })
    return _id
}

async function table(rigor = "rigoroso"): Promise<Table> {
    const owner = "owner-1"
    const player = "player-1"
    const campaignId = new Types.ObjectId()
    await MaddoxCampaignModel.collection.insertOne({ _id: campaignId, name: "Tibia", ownerId: owner, rigor, status: "active", turn: { number: 2, phase: "players" }, createdAt: new Date(), updatedAt: new Date() })
    const liz = { _id: new Types.ObjectId(), sheetId: await sheet("Lizwan", { sp: 30, gp: 11 }) }
    const ravel = { _id: new Types.ObjectId(), sheetId: await sheet("Ravel", { gp: 3 }) }
    await MaddoxCharacterModel.collection.insertMany([
        { _id: liz._id, campaignId, memberId: new Types.ObjectId(), userId: player, name: "Lizwan", status: "active", sheetId: liz.sheetId, createdAt: new Date(), updatedAt: new Date() },
        { _id: ravel._id, campaignId, memberId: new Types.ObjectId(), userId: "player-2", name: "Ravel", status: "active", sheetId: ravel.sheetId, createdAt: new Date(), updatedAt: new Date() },
    ])
    return { campaignId, owner, player, liz, ravel }
}

let jobSeq = 0
async function ask(t: Table, question: string, asker: { userId: string; characterId: Types.ObjectId | null } = { userId: t.player, characterId: t.liz._id }) {
    const jobId = `coins-job-${++jobSeq}`
    const message = await MaddoxCampaignMessageModel.create({ campaignId: t.campaignId, turnNumber: 2, phase: "players", kind: "question", userId: asker.userId, characterId: asker.characterId, characterName: "Lizwan", content: question })
    runs.openQuestionRun({ campaignId: String(t.campaignId), jobId, turnNumber: 2, questionId: String(message._id), askerUserId: asker.userId, askerCharacterId: asker.characterId ? String(asker.characterId) : null, askerIsOwner: asker.userId === t.owner, playerTexts: [question] })
    return { jobId, questionId: message._id }
}

const coinsOf = async (sheetId: Types.ObjectId) => (await CharacterSheet.collection.findOne({ _id: sheetId }))!.coins as Record<string, number>
const coinsTool = findMaddoxTool("update_character_coins")!

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_coins" })
})
afterAll(async () => {
    await mongoose.disconnect()
    await mongo.stop()
})
beforeEach(async () => {
    await mongoose.connection.db!.dropDatabase()
    recordAudit.mockClear()
    sheetPusher.publishSheetPatched.mockClear()
    sheetPusher.publishCollectionChanged.mockClear()
})

describe("DND-65 — moedas visíveis para o Maddox", () => {
    it("o texto da ficha (preparação e get_character_sheet) e o resumo da narração mostram as moedas", async () => {
        const t = await table()
        const { jobId } = await ask(t, "quanto dinheiro eu tenho?")
        const read = await tools.readCharacterSheet(jobId, "Lizwan")
        expect(read.ficha).toContain("- Moedas: 11 po, 30 pp")
        const stored = await CharacterSheet.findById(t.liz.sheetId).lean()
        expect(sheetSummary(stored as never)).toContain("Moedas: 11 po, 30 pp")
    })
})

describe("DND-65 — update_character_coins na narração", () => {
    it("(a) 30 pp e 'gastei 5 pp' ⇒ coins.sp = 25, nenhum item criado, auditoria, linha na mesa e ficha em tempo real", async () => {
        const t = await table()
        const output = (await runMaddoxTool(coinsTool, { campaignId: t.campaignId, turnNumber: 2 }, { personagem: "lizwan", subtrair: { pp: 5 }, motivo: "pagou o quarto da estalagem" })) as Record<string, unknown>
        expect(output).toMatchObject({ saved: true, personagem: "Lizwan", antes: "11 po, 30 pp", moedas: "11 po, 25 pp" })
        expect(await coinsOf(t.liz.sheetId)).toMatchObject({ sp: 25, gp: 11, pp: 0 })
        expect(await CharacterItem.countDocuments({})).toBe(0)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FichaPersonagem", entidadeId: String(t.liz.sheetId), depois: expect.objectContaining({ by: "maddox", origin: "narrator", reason: "pagou o quarto da estalagem" }) }))
        expect(sheetPusher.publishSheetPatched).toHaveBeenCalledTimes(1)
        const line = await MaddoxCampaignMessageModel.findOne({ campaignId: t.campaignId, kind: "sheet-change" }).lean()
        expect(line).toMatchObject({ phase: "master", characterName: "Lizwan", content: "Moedas de Lizwan: 11 po, 30 pp → 11 po, 25 pp (pagou o quarto da estalagem)" })
    })

    it("somar e subtrair valores válidos deixa o saldo exato (com troco explícito)", async () => {
        const t = await table()
        await runMaddoxTool(coinsTool, { campaignId: t.campaignId, turnNumber: 2 }, { personagem: "Ravel", somar: { po: 2 }, motivo: "recompensa do padeiro" })
        await runMaddoxTool(coinsTool, { campaignId: t.campaignId, turnNumber: 2 }, { personagem: "Ravel", subtrair: { po: 1 }, somar: { pp: 10 }, motivo: "troco na feira" })
        expect(await coinsOf(t.ravel.sheetId)).toMatchObject({ gp: 4, sp: 10 })
    })

    it("(c) gastar mais do que existe ⇒ recusa com o motivo e saldo intacto", async () => {
        const t = await table()
        await expect(runMaddoxTool(coinsTool, { campaignId: t.campaignId, turnNumber: 2 }, { personagem: "Ravel", subtrair: { pp: 5 }, motivo: "compra" })).rejects.toThrow(/Ravel não tem moedas suficientes: tem 0 pp e precisa tirar 5 pp \(saldo: 3 po\)/)
        expect(await coinsOf(t.ravel.sheetId)).toMatchObject({ gp: 3, sp: 0 })
        expect(recordAudit).not.toHaveBeenCalled()
        expect(await MaddoxCampaignMessageModel.countDocuments({ kind: "sheet-change" })).toBe(0)
    })

    it("valor negativo, não numérico ou vazio é recusado", async () => {
        const t = await table()
        const run = (input: Record<string, unknown>) => runMaddoxTool(coinsTool, { campaignId: t.campaignId, turnNumber: 2 }, { personagem: "Lizwan", motivo: "x", ...input })
        await expect(run({ subtrair: { pp: -5 } })).rejects.toThrow(/Entrada inválida/)
        await expect(run({ somar: { pp: "5" } })).rejects.toThrow(/Entrada inválida/)
        await expect(run({})).rejects.toThrow(/ao menos uma moeda/)
        expect(await coinsOf(t.liz.sheetId)).toMatchObject({ sp: 30, gp: 11 })
    })

    it("campanha narrativa não tem moedas na ficha", async () => {
        const t = await table("narrativo")
        await expect(runMaddoxTool(coinsTool, { campaignId: t.campaignId, turnNumber: 2 }, { personagem: "Lizwan", somar: { po: 1 }, motivo: "x" })).rejects.toThrow(/narrativa/)
    })
})

describe("DND-65 — moedas pelo Pergunte ao mestre e pela lista fechada", () => {
    it("update_character_coins no Pergunte ao mestre: o jogador soma no próprio personagem; a linha responde à pergunta", async () => {
        const t = await table()
        const { jobId, questionId } = await ask(t, "recebi 2 po do Fedrin")
        const output = (await runMaddoxTool(coinsTool, { campaignId: t.campaignId, turnNumber: 2, jobId }, { personagem: "Lizwan", somar: { po: 2 }, motivo: "pagamento do Fedrin" })) as Record<string, unknown>
        expect(output).toMatchObject({ saved: true, personagem: "Lizwan" })
        expect(await coinsOf(t.liz.sheetId)).toMatchObject({ gp: 13, sp: 30 })
        const line = await MaddoxCampaignMessageModel.findOne({ kind: "sheet-change" }).lean()
        expect(String(line!.replyToId)).toBe(String(questionId))
        expect(line!.content).toContain("11 po, 30 pp → 13 po, 30 pp (pagamento do Fedrin)")
        // O personagem de outro jogador fica fora.
        await expect(runMaddoxTool(coinsTool, { campaignId: t.campaignId, turnNumber: 2, jobId }, { personagem: "Ravel", somar: { po: 2 }, motivo: "x" })).rejects.toThrow(/só pode corrigir o próprio personagem/)
    })

    it("update_character_sheet: coins grava; item com nome de moeda e saldo insuficiente vão para recusadas", async () => {
        const t = await table()
        const { jobId } = await ask(t, "gastei 5 pp")
        const result = await tools.updateCharacterSheetFromQuestion(jobId, {
            personagem: "Lizwan",
            alteracoes: [
                { type: "coins", subtract: { pp: 5 }, reason: "Você gastou 5 pp." },
                { type: "item-add", name: "Peças de prata", quantity: 30, reason: "bolsa" },
                { type: "item-add", name: "30 po", reason: "bolsa" },
                { type: "coins", subtract: { po: 50 }, reason: "compra" },
            ],
        })
        expect(result.aplicadas).toEqual(["Moedas (−5 pp): 11 po, 30 pp → 11 po, 25 pp"])
        expect(result.recusadas.map((item) => item.motivo)).toEqual([expect.stringContaining("moeda não é item"), expect.stringContaining("moeda não é item"), expect.stringContaining("Lizwan não tem moedas suficientes: tem 11 po e precisa tirar 50 po")])
        expect(result.naoAplicadas).toEqual([])
        expect(await coinsOf(t.liz.sheetId)).toMatchObject({ sp: 25, gp: 11 })
        expect(await CharacterItem.countDocuments({})).toBe(0)
    })

    it("preparação e ajuste do combate (applySheetChanges): coins grava e item de moeda fica recusado com o motivo", async () => {
        const t = await table()
        const result = await applySheetChanges(
            [
                { type: "coins", add: { pc: 12 }, reason: "achou no bolso do bandido" },
                { type: "item-add", name: "Moedas de ouro", quantity: 3, equipped: false, reason: "bolsa" },
            ],
            { sheetId: String(t.liz.sheetId), campaignId: String(t.campaignId), auditUserId: t.owner, characterName: "Lizwan", origin: "combat-prep" },
        )
        expect(result.changes).toEqual([
            expect.objectContaining({ label: "Moedas (+12 pc)", before: "11 po, 30 pp", after: "11 po, 30 pp, 12 pc", applied: true }),
            expect.objectContaining({ label: "Item Moedas de ouro", applied: false, refused: expect.stringContaining("moeda não é item") }),
        ])
        expect(await coinsOf(t.liz.sheetId)).toMatchObject({ cp: 12 })
        expect(await CharacterItem.countDocuments({})).toBe(0)
    })
})
