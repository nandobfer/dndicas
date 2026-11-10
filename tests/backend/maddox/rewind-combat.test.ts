import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * Voltar a um turno do combate tático (DND-44): o retrato da vez de um personagem guarda a vez, a iniciativa, os PV e as
 * condições dos adversários e a ficha inteira (PV, espaços de magia, itens); voltar a ela restaura tudo e a vez daquele
 * personagem. Voltar a um turno anterior ao combate o desfaz. Os prazos do combate da campanha são cancelados.
 */

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: { enabled: true, avatar: { url: null } }, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)
vi.mock("@/features/maddox/server/combat-prep-ai", async () => (await import("../../helpers/combat-prep-mock")).combatPrepAiModule)
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({ CharacterSheetPusherService: { getInstance: () => ({ publishSheetPatched: vi.fn(async () => undefined) }) } }))
vi.mock("@/features/engramind/server/campaign-rewind", () => ({
    MEMORY_REWIND_UNAVAILABLE: "x",
    MemoryRewindUnavailableError: class extends Error {},
    npcTokenBoxesOf: vi.fn(async () => new Map()),
    resolveRewindChannels: vi.fn(async () => null),
    planMemoryRewinds: vi.fn(async () => []),
    applyMemoryRewinds: vi.fn(async () => 0),
    purgeDiscardedMemories: vi.fn(async () => ({ deleted: 0, failed: [] })),
    purgeMemoryNow: vi.fn(async () => true),
    stashPendingWrites: vi.fn(async () => []),
    restorePendingWrites: vi.fn(async () => undefined),
}))

const { MaddoxCampaignModel, MaddoxCampaignMemberModel, MaddoxCharacterModel, MaddoxCombatModel, MaddoxCampaignMessageModel, MaddoxCampaignSnapshotModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const campaigns = await import("@/features/maddox/server/campaigns")
const { captureTurnSnapshot } = await import("@/features/maddox/server/turn-snapshots")
const rewind = await import("@/features/maddox/server/rewind")
const tactical = await import("@/features/maddox/server/tactical-combat")
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")

vi.setConfig({ testTimeout: 30_000 })

let mongo: MongoMemoryServer

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_rewind_combat_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCombatModel.init(), MaddoxCampaignSnapshotModel.init(), CharacterSheet.init()])
}, 180_000)
afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)
beforeEach(async () => {
    const db = mongoose.connection.db!
    for (const collection of await db.collections()) await collection.deleteMany({})
})

const tacticalState = (activeIndex: number, round: number, conditions: string[]) => ({
    phase: "running",
    round,
    activeIndex,
    order: [
        { actorKey: "c:kael", total: 18 },
        { actorKey: "c:lyra", total: 12 },
        { actorKey: "e:goblin", total: 8 },
    ],
    characters: [
        { actorKey: "c:kael", conditions, economy: { action: activeIndex === 0 } },
        { actorKey: "c:lyra", conditions: [], economy: {} },
    ],
})

async function setup() {
    const owner = String(new mongoose.Types.ObjectId())
    const created = await campaigns.createCampaign({ name: "Brumas", rigor: "fiel-dnd" }, owner)
    const id = created.id
    const member = (await MaddoxCampaignMemberModel.findOne({ campaignId: id, userId: owner }).lean())!
    const sheet = await CharacterSheet.create({ slug: `kael-${id}`, userId: owner, name: "Kael", hpCurrent: 20, spellSlots: { "1": { total: 2, used: 0 } } })
    await CharacterItem.create({ sheetId: sheet._id, name: "Poção de cura", quantity: 3 })
    const character = await MaddoxCharacterModel.create({ campaignId: id, memberId: member._id, userId: owner, name: "Kael", sheetId: sheet._id, interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: member._id }, { $set: { characterId: character._id } })
    const at = async (number: number, combatActor: Record<string, unknown> | null) => {
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { status: "active", turn: { number, phase: "players", startedAt: new Date(), eligibleMemberIds: [member._id], declaredMemberIds: [], generating: null, failedAt: null, checkRound: 0, awaitingChecks: false, combatActor, pauseUntil: null, opexActor: null } } })
        await MaddoxCampaignMessageModel.create({ campaignId: id, turnNumber: number, phase: "master", kind: "narration", content: `Narração ${number}` })
        await captureTurnSnapshot(new mongoose.Types.ObjectId(id), number)
    }
    return { id, owner, memberId: member._id, sheetId: sheet._id, at }
}

const goto = async (id: string, owner: string, turnNumber: number) => {
    const state = await rewind.rewindToTurn(id, { turnNumber }, owner)
    await waitForCampaignIdle(id)
    return state
}

describe("volta a um turno do combate tático", () => {
    it("a vez do personagem, a iniciativa, PV e condições dos adversários e a ficha voltam como estavam", async () => {
        const { id, owner, memberId, sheetId, at } = await setup()
        await at(3, null)
        const combat = { _id: new mongoose.Types.ObjectId() }
        await mongoose.connection.collection("maddox_combats").insertOne({
            _id: combat._id,
            campaignId: new mongoose.Types.ObjectId(id),
            title: "Emboscada",
            startedTurn: 4,
            mode: "tactical",
            status: "active",
            combatants: [{ name: "Goblin", nameKey: "goblin", side: "inimigo", quantity: 1, tactical: { actorKey: "e:goblin", stats: { hp: 7, hpMax: 7 }, conditions: [] } }],
            tactical: tacticalState(0, 1, []),
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        await at(5, { combatId: combat._id, actorKey: "c:kael", memberId, offlineSince: null })

        // A vez seguinte: o goblin apanhou e ficou caído, o Kael gastou uma magia e uma poção e levou dano.
        await MaddoxCombatModel.updateOne({ _id: combat._id }, { $set: { tactical: tacticalState(1, 2, ["envenenado"]), "combatants.0.tactical.stats.hp": 2, "combatants.0.tactical.conditions": ["caído"] } })
        await CharacterSheet.updateOne({ _id: sheetId }, { $set: { hpCurrent: 6, "spellSlots.1.used": 1 } })
        await CharacterItem.updateOne({ sheetId }, { $set: { quantity: 2 } })
        await at(6, { combatId: combat._id, actorKey: "c:lyra", memberId, offlineSince: null })
        let fired = false
        tactical.scheduleTimer(`npc-block:${id}`, 60_000, async () => {
            fired = true
        })

        const view = await goto(id, owner, 5)
        expect(view.turn).toMatchObject({ number: 5, phase: "players", combatActor: { actorKey: "c:kael", memberId: String(memberId) } })
        const restored = (await MaddoxCombatModel.findById(combat._id).lean())!
        expect(restored.tactical).toMatchObject({ round: 1, activeIndex: 0, order: tacticalState(0, 1, []).order })
        expect((restored.tactical as unknown as { characters: { conditions: string[] }[] }).characters[0]!.conditions).toEqual([])
        expect(restored.combatants[0]!.tactical).toMatchObject({ stats: { hp: 7 }, conditions: [] })
        const sheet = (await CharacterSheet.findById(sheetId).lean())!
        expect(sheet.hpCurrent).toBe(20)
        expect((sheet.spellSlots as unknown as Record<string, { used: number }>)["1"]!.used).toBe(0)
        expect((await CharacterItem.findOne({ sheetId }).lean())!.quantity).toBe(3)
        expect(tactical.hasSequenceTimer(id)).toBe(false)
        expect(fired).toBe(false)

        // Voltar a um turno anterior ao início do combate desfaz o combate.
        await goto(id, owner, 3)
        expect(await MaddoxCombatModel.countDocuments({ campaignId: id })).toBe(0)
        expect((await MaddoxCampaignModel.findById(id).lean())!.turn).toMatchObject({ number: 3, combatActor: null })

        // Retomar a origem (turno 6) devolve o combate e a ficha da vez seguinte.
        await rewind.resumeCurrentTurn(id, owner)
        await waitForCampaignIdle(id)
        const back = (await MaddoxCombatModel.findById(combat._id).lean())!
        expect(back.tactical).toMatchObject({ round: 2, activeIndex: 1 })
        expect((await CharacterSheet.findById(sheetId).lean())!.hpCurrent).toBe(6)
        expect((await CharacterItem.findOne({ sheetId }).lean())!.quantity).toBe(2)
        expect((await MaddoxCampaignModel.findById(id).lean())!.turn).toMatchObject({ number: 6, combatActor: { actorKey: "c:lyra" } })
    })
})
