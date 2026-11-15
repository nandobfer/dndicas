import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { MaddoxRigorLevel } from "@/features/maddox/constants"

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: { enabled: true }, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)

const { experienceProgress, xpProgressLabel } = await import("@/features/maddox/experience-progress")
const { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const journal = await import("@/features/maddox/server/journal")

describe("DND-63 — cálculo da barra de XP", () => {
    it("0 XP no nível 1: barra vazia e faltam 300", () => {
        expect(experienceProgress(0, 1)).toEqual({ level: 1, value: 0, floor: 0, next: 300, missing: 300, percent: 0 })
    })

    it("XP no meio do intervalo do nível", () => {
        expect(experienceProgress(10_250, 5)).toEqual({ level: 5, value: 10_250, floor: 6_500, next: 14_000, missing: 3_750, percent: 50 })
    })

    it("XP exatamente no limiar do nível atual começa vazia; no limiar do próximo fica cheia sem faltar nada", () => {
        expect(experienceProgress(6_500, 5)).toMatchObject({ percent: 0, missing: 7_500 })
        expect(experienceProgress(14_000, 5)).toMatchObject({ percent: 100, missing: 0, next: 14_000 })
        expect(experienceProgress(20_000, 5)).toMatchObject({ percent: 100, missing: 0 })
    })

    it("nível 20: sem próximo limiar, barra cheia e 'Nível máximo'", () => {
        const progress = experienceProgress(355_000, 20)
        expect(progress).toEqual({ level: 20, value: 355_000, floor: 355_000, next: null, missing: null, percent: 100 })
        expect(xpProgressLabel(progress)).toEqual({ text: "355.000 XP · Nível máximo", detail: "355.000 XP · Nível máximo" })
    })

    it("XP abaixo do limiar do nível (nível inicial alto) não fica negativa; XP em texto antigo é normalizada", () => {
        expect(experienceProgress(0, 5)).toMatchObject({ percent: 0, missing: 14_000 })
        expect(experienceProgress("600 XP", 2)).toMatchObject({ value: 600, percent: 50 })
        expect(experienceProgress(undefined, 99)).toMatchObject({ level: 20, value: 0, percent: 100 })
    })

    it("rótulos em pt-BR", () => {
        expect(xpProgressLabel(experienceProgress(12_300, 5))).toEqual({ text: "12.300 / 14.000 XP", detail: "12.300 XP · faltam 1.700 para o nível 6" })
        expect(xpProgressLabel(experienceProgress(14_000, 5)).detail).toBe("14.000 XP · nível 6 alcançado")
    })
})

let mongo: MongoMemoryServer

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

/** Campanha com o dono e uma jogadora; o personagem da jogadora tem ficha (nível e XP dados), o do dono não. */
async function table(rigor: MaddoxRigorLevel, mode: "marco" | "experiencia", sheet = { level: 5, experience: 12_300 }) {
    const owner = await seedUser("dono")
    const ana = await seedUser("ana")
    const created = await campaigns.createCampaign({ name: "Brumas", rigor }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", progression: { mode, declared: [], pendingMilestone: null } } })
    await campaigns.joinByInvite((await campaigns.getInviteLink(created.id, owner)).token, ana)
    const sheetId = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("charactersheets").insertOne({ _id: sheetId, slug: "lyra", name: "Lyra", level: sheet.level, experience: sheet.experience, hpCurrent: 31, notes: "segredo da ficha" })
    const characters: Record<string, string> = {}
    for (const [userId, name, sheetRef] of [[owner, "Sem Ficha", null], [ana, "Lyra", sheetId]] as const) {
        const member = await MaddoxCampaignMemberModel.findOne({ campaignId: created.id, userId }).lean()
        const character = await MaddoxCharacterModel.create({ campaignId: created.id, memberId: member!._id, userId, name, sheetId: sheetRef, interview: { status: "done", scriptVersion: 0 } })
        await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
        characters[name] = String(character._id)
    }
    return { id: created.id, owner, ana, sheetId, characters }
}

const expected = { level: 5, value: 12_300, floor: 6_500, next: 14_000, missing: 1_700, percent: 77 }

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_xp_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all([mongoose.connection.collection("users").deleteMany({}), mongoose.connection.collection("charactersheets").deleteMany({}), MaddoxCampaignModel.deleteMany({}), MaddoxCampaignMemberModel.deleteMany({}), MaddoxCharacterModel.deleteMany({})])
    const { campaignMemoriesStore } = await import("../../helpers/campaign-memories-mock")
    campaignMemoriesStore.reset()
})

describe("DND-63 — barra de XP nos participantes", () => {
    it("modo Experiência: a campanha, a mesa e o Diário levam só nível e XP da ficha", async () => {
        const { id, owner, ana, characters } = await table("equilibrado", "experiencia")
        const detail = await campaigns.getCampaignDetail(id, owner)
        const lyra = detail.members.find((member) => member.userId === ana)!.character!
        expect(lyra.xp).toEqual(expected)
        expect(Object.keys(lyra.xp!).sort()).toEqual(["floor", "level", "missing", "next", "percent", "value"])
        expect(detail.members.find((member) => member.userId === owner)!.character!.xp).toBeNull()
        expect(JSON.stringify(detail)).not.toContain("segredo da ficha")
        expect((await campaigns.getCampaignDetail(id, ana)).myCharacter?.xp).toEqual(expected)

        const state = await game.getGameState(id, ana)
        expect(state.participants.find((participant) => participant.userId === ana)?.xp).toEqual(expected)
        expect(state.participants.find((participant) => participant.userId === owner)?.xp).toBeNull()
        expect(JSON.stringify(state.participants)).not.toContain("segredo da ficha")

        const party = await journal.listJournalParty(id, owner)
        expect(party.find((member) => member.characterId === characters.Lyra)?.xp).toEqual(expected)
        expect(party.find((member) => member.characterId === characters["Sem Ficha"])?.xp).toBeNull()
    })

    it("a próxima carga reflete a XP nova da ficha (ex.: XP do combate)", async () => {
        const { id, ana, sheetId } = await table("fiel-dnd", "experiencia")
        await mongoose.connection.collection("charactersheets").updateOne({ _id: sheetId }, { $inc: { experience: 1_700 } })
        const state = await game.getGameState(id, ana)
        expect(state.participants.find((participant) => participant.userId === ana)?.xp).toMatchObject({ value: 14_000, missing: 0, percent: 100 })
    })

    it("nível 20 não quebra o cálculo", async () => {
        const { id, ana } = await table("rigoroso", "experiencia", { level: 20, experience: 400_000 })
        expect((await campaigns.getCampaignDetail(id, ana)).myCharacter?.xp).toMatchObject({ level: 20, next: null, missing: null, percent: 100 })
    })

    it("modo Marco: nenhum participante recebe a barra", async () => {
        const { id, ana } = await table("equilibrado", "marco")
        expect((await campaigns.getCampaignDetail(id, ana)).members.every((member) => member.character?.xp === null)).toBe(true)
        expect((await game.getGameState(id, ana)).participants.every((participant) => participant.xp === null)).toBe(true)
        expect((await journal.listJournalParty(id, ana)).every((member) => member.xp === null)).toBe(true)
    })

    it("grau narrativo (sem nível de personagem) não recebe a barra mesmo com ficha", async () => {
        const { id, ana } = await table("narrativo", "experiencia")
        expect((await campaigns.getCampaignDetail(id, ana)).myCharacter?.xp).toBeNull()
        expect((await game.getGameState(id, ana)).participants.every((participant) => participant.xp === null)).toBe(true)
    })

    it("personagem com entrevista em andamento fica sem a barra", async () => {
        const { id, ana, characters } = await table("equilibrado", "experiencia")
        await MaddoxCharacterModel.updateOne({ _id: characters.Lyra }, { $set: { "interview.status": "in-progress" } })
        expect((await campaigns.getCampaignDetail(id, ana)).myCharacter?.xp).toBeNull()
        expect((await game.getGameState(id, ana)).participants.find((participant) => participant.userId === ana)?.xp).toBeNull()
    })
})
