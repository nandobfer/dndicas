import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * Serviço do combate tático (Maddox 7) sobre o MongoDB em memória, sem o narrador: "Outra ação" validada pelo rigor,
 * cancelar a ação, pular a vez (dono e ausência), teste contra a morte, janela de reação (prazo, offline, dono no lugar)
 * e o classificador de custo com cache.
 */

const dice = { server: [] as number[][], players: new Map<string, number[][]>() }
const presence = { online: null as Set<string> | null }
const validation = { verdict: '{"valid": true}' }
const jev = { "combat-option-cost": false, "free-action-validity": false }
const askJevSystemOne = vi.fn(async (input: unknown) => {
    void input
    return { answers: { custo: { type: "choice", choice: "bonus" }, gatilho: { type: "choice", choice: "other" } } }
})
const scripted = (queue: number[][] | undefined) => {
    const values = queue?.shift() ?? []
    let index = 0
    return (min: number, max: number) => values[index++] ?? Math.floor((min + max - 1) / 2)
}

vi.mock("@/features/dice-roller/server/dice-engine", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/features/dice-roller/server/dice-engine")>()
    return { ...actual, rollDice: (input: Parameters<typeof actual.rollDice>[0], options: Parameters<typeof actual.rollDice>[1] = {}) => actual.rollDice(input, { ...options, randomInt: options.randomInt ?? scripted(dice.server) }) }
})
vi.mock("@/features/dice-roller/server/dice-roll-service", () => ({
    rollGeneralDice: async (input: never, target: { targetId: string }) => {
        const { rollDice } = await import("@/features/dice-roller/server/dice-engine")
        return rollDice(input, { randomInt: scripted(dice.players.get(target.targetId.replace("user:", ""))) })
    },
}))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => presence.online) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({
    CharacterSheetPusherService: { getInstance: () => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }) },
}))
vi.mock("@/lib/ai/jev", () => ({ askJevSystemOne }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({
        settings: { enabled: true, main: { provider: "gemini", model: "m", agent: null, variant: null, temperature: null, maxOutputTokens: null }, instructions: "Maddox.", avatar: { url: null }, opencode: {}, jev: { ...jev } },
        isDefault: false,
        updatedAt: null,
    })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/features/ai/server/agent-memory-service", () => ({ agentMemoryTexts: vi.fn(async () => []) }))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: vi.fn(async () => undefined) }))
vi.mock("@/lib/ai/stream", () => ({
    prepareModel: vi.fn(async () => ({ model: {}, dispose: async () => undefined })),
    samplingOptions: () => ({}),
    describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    generateAiText: vi.fn(async () => ({ text: validation.verdict })),
}))
vi.mock("ai", () => ({
    dynamicTool: (def: unknown) => def,
    stepCountIs: (count: number) => ({ count }),
    streamText: () => ({
        fullStream: (async function* () {
            yield { type: "start-step" }
            yield { type: "text-delta", text: "O Maddox narra." }
            yield { type: "finish", finishReason: "stop", totalUsage: {} }
        })(),
    }),
}))

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCombatModel, MaddoxCombatOptionProfileModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const actions = await import("@/features/maddox/server/tactical-actions")
const tactical = await import("@/features/maddox/server/tactical-combat")
const reactions = await import("@/features/maddox/server/combat-reactions")
const { resolveProfiles, profileKey } = await import("@/features/maddox/server/combat-classifier")
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { freshEconomy } = await import("@/features/maddox/combat-rules")
const { monsterStatsFromCustom } = await import("@/features/maddox/server/combat-monsters")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const { ItemModel } = await import("@/features/items/database/item")

let mongo: MongoMemoryServer
const oid = () => new mongoose.Types.ObjectId()

async function seedUser(username: string) {
    const _id = oid()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username, email: `${username}@x.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function character(campaignId: string, userId: string, name: string, hp: number) {
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const sheetId = oid()
    await CharacterSheet.collection.insertOne({ _id: sheetId, slug: `${name}-${String(sheetId)}`, userId, name, level: 3, strength: 14, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10, savingThrows: {}, skills: {}, hpMax: 20, hpCurrent: hp, hpTemp: 0, deathSavesSuccess: 0, deathSavesFailure: 0, spellSlots: {}, resourceCharges: [], coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } })
    const swordId = oid()
    await ItemModel.collection.updateOne({ name: "Espada" }, { $setOnInsert: { _id: swordId, name: "Espada", type: "arma", status: "active", damageDice: { quantidade: 1, tipo: "d8" }, damageType: "cortante", properties: [] } }, { upsert: true })
    const sword = await ItemModel.collection.findOne({ name: "Espada" })
    await CharacterItem.collection.insertOne({ sheetId, catalogItemId: sword!._id, name: "<p>Espada</p>", quantity: 1, equipped: true, catalogItemType: "arma", notes: "" })
    const created = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name, profile: {}, interview: { status: "done", scriptVersion: 0 }, sheetId })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: created._id } })
    return { userId, memberId: String(member!._id), characterId: String(created._id), sheetId: String(sheetId), actorKey: `pc:${String(created._id)}` }
}

/** Mesa Fiel ao D&D com combate tático em andamento e a vez do Kael aberta. */
async function scene(options: { kaelHp?: number } = {}) {
    const owner = await seedUser("kael")
    const created = await campaigns.createCampaign({ name: "Mesa", rigor: "fiel-dnd" }, owner)
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const lyraUser = await seedUser("lyra")
    await campaigns.joinByInvite(token, lyraUser)
    const kael = await character(created.id, owner, "Kael", options.kaelHp ?? 20)
    const lyra = await character(created.id, lyraUser, "Lyra", 20)
    const characters = await tactical.combatCharacters(new mongoose.Types.ObjectId(created.id))
    const goblin = tactical.combatantState("npc:gob", "goblin", monsterStatsFromCustom({ ca: 12, pv: 7, acoes: [{ nome: "Faca", tipo: "ataque", bonus: 4, dano: "1d4+2", tipoDano: "perfurante" }] }))
    const combat = await MaddoxCombatModel.create({
        campaignId: created.id,
        status: "active",
        mode: "tactical",
        title: "Beco",
        startedTurn: 1,
        combatants: [{ name: "Goblin", nameKey: "goblin", side: "inimigo", quantity: 1, description: "", condition: "", npcId: null, outcome: null, tactical: goblin }],
        tactical: {
            mode: "tactical",
            phase: "running",
            round: 1,
            activeIndex: 0,
            order: [
                { actorKey: kael.actorKey, kind: "character", name: "Kael", total: 15, d20: 14, modifier: 1, dexterity: 12, joinIndex: 0, groupKey: kael.actorKey },
                { actorKey: "npc:gob", kind: "combatant", name: "Goblin", total: 10, d20: 8, modifier: 2, dexterity: 14, joinIndex: 2, groupKey: "goblin" },
                { actorKey: lyra.actorKey, kind: "character", name: "Lyra", total: 5, d20: 4, modifier: 1, dexterity: 12, joinIndex: 1, groupKey: lyra.actorKey },
            ],
            characters: characters.map((state) => ({ ...state, hpZero: state.name === "Kael" && (options.kaelHp ?? 20) === 0 })),
            surprise: null,
            staleEndNarrations: 0,
            queue: [],
            nextKey: null,
            queueTurn: null,
        },
        rev: 0,
    })
    await MaddoxCampaignModel.updateOne(
        { _id: created.id },
        {
            $set: {
                status: "active",
                "scenarioInterview.status": "done",
                turn: { number: 2, phase: "players", startedAt: new Date(), eligibleMemberIds: [new mongoose.Types.ObjectId(kael.memberId)], declaredMemberIds: [], generating: null, failedAt: null, checkRound: 0, awaitingChecks: false, combatActor: { combatId: combat._id, actorKey: kael.actorKey, memberId: new mongoose.Types.ObjectId(kael.memberId), offlineSince: null } },
            },
        },
    )
    return { id: created.id, kael, lyra, combatId: combat._id }
}

const stateOf = async (id: string, actorKey: string) => (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.characters.find((state) => state.actorKey === actorKey)!

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_tactical_service_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxCombatModel.init(), MaddoxCombatOptionProfileModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})))
    dice.server.length = 0
    dice.players.clear()
    presence.online = null
    validation.verdict = '{"valid": true}'
    jev["combat-option-cost"] = false
    askJevSystemOne.mockClear()
})

describe("Maddox 7 — a vez do personagem", () => {
    it("Outra ação no Fiel ao D&D: inválida não grava nem gasta a Ação; válida fica para o Maddox", async () => {
        const { id, kael } = await scene()
        validation.verdict = '{"valid": false, "reason": "Você não tem magia para isso."}'
        await expect(actions.submitCombatAction(id, { economy: "action", optionId: "free", freeText: "Lanço uma bola de fogo." }, kael.userId)).rejects.toMatchObject({ code: "ACTION_INVALID", message: "Você não tem magia para isso." })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "combat-action" })).toBe(0)
        expect((await stateOf(id, kael.actorKey)).economy.action).toBe(true)
        await expect(actions.submitCombatAction(id, { economy: "action", optionId: "free" }, kael.userId)).rejects.toMatchObject({ code: "FREE_TEXT_REQUIRED" })
        validation.verdict = '{"valid": true}'
        await actions.submitCombatAction(id, { economy: "action", optionId: "free", freeText: "Derrubo a estante no goblin." }, kael.userId)
        const card = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action" }).lean())!
        expect(card.combatAction).toMatchObject({ status: "resolved", freeText: "Derrubo a estante no goblin.", economy: "action" })
        expect((await stateOf(id, kael.actorKey)).economy.action).toBe(false)
        await expect(actions.submitCombatAction(id, { economy: "action", optionId: "free", freeText: "De novo." }, kael.userId)).rejects.toMatchObject({ code: "OPTION_UNAVAILABLE" })
    })

    it("cancelar o ataque ainda não rolado devolve a Ação; ação pendente bloqueia outra e o fim da vez", async () => {
        const { id, kael } = await scene()
        const options = (await game.getGameState(id, kael.userId)).me.combat!.options!
        const sword = options.action.find((option) => option.label === "Espada")!
        await actions.submitCombatAction(id, { economy: "action", optionId: sword.id, targets: ["npc:gob"] }, kael.userId)
        await expect(actions.submitCombatAction(id, { economy: "action", optionId: "unarmed", targets: ["npc:gob"] }, kael.userId)).rejects.toMatchObject({ code: "ACTION_PENDING" })
        await expect(actions.endCombatTurn(id, {}, kael.userId)).rejects.toMatchObject({ code: "ACTION_PENDING" })
        const card = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action" }).lean())!
        expect((await game.getGameState(id, kael.userId)).messages.find((message) => message.id === String(card._id))!.combatAction!.cancellable).toBe(true)
        await actions.cancelCombatAction(id, String(card._id), kael.userId)
        expect((await stateOf(id, kael.actorKey)).economy).toMatchObject({ action: true, attackAction: false })
        expect((await MaddoxCampaignMessageModel.findById(card._id).lean())!.combatAction!.status).toBe("cancelled")
    })

    it("o dono pula a vez do personagem ativo; jogador offline perde a vez depois da carência", async () => {
        const { id, kael, lyra } = await scene()
        // Lyra não é dona: não pula.
        await expect(game.skipPlayer(id, { memberId: kael.memberId }, lyra.userId)).rejects.toMatchObject({ code: "FORBIDDEN" })
        presence.online = new Set([lyra.userId])
        await actions.evaluateCombatAbsence(new mongoose.Types.ObjectId(id))
        let campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn.combatActor?.offlineSince).toBeTruthy()
        expect(campaign.turn.phase).toBe("players")
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.combatActor.offlineSince": new Date(Date.now() - 60_000) } })
        await actions.evaluateCombatAbsence(new mongoose.Types.ObjectId(id))
        await waitForCampaignIdle(id)
        const pass = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, turnAction: true }).lean())!
        expect(pass).toMatchObject({ kind: "pass", offlineSkip: true })
        campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn.number).toBeGreaterThan(2)
        const view = await game.getGameState(id, lyra.userId)
        expect(view.messages.find((message) => message.offlineSkip)!.skippedByName).toBe("ausência (offline)")
    })

    it("com 0 PV a vez é só o teste contra a morte; o resultado vai para a ficha e a vez encerra", async () => {
        const { id, kael } = await scene({ kaelHp: 0 })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "master", "turn.combatActor": null } })
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.activeIndex": 2, "tactical.nextKey": kael.actorKey } })
        const opened = await tactical.advanceToNextCharacter(new mongoose.Types.ObjectId(id), 2)
        expect(opened).toMatchObject({ kind: "player", actorKey: kael.actorKey })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "players", "turn.eligibleMemberIds": [new mongoose.Types.ObjectId(kael.memberId)], "turn.combatActor": { combatId: (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!._id, actorKey: kael.actorKey, memberId: new mongoose.Types.ObjectId(kael.memberId), offlineSince: null } } })
        const view = await game.getGameState(id, kael.userId)
        expect(view.me.combat).toMatchObject({ myTurn: true, dying: true, options: { action: [], bonus: [] } })
        const roll = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "death-save" }).lean())!
        await expect(actions.endCombatTurn(id, {}, kael.userId)).rejects.toMatchObject({ code: "ROLL_PENDING" })
        dice.players.set(kael.userId, [[1]])
        await actions.rollCombatRoll(id, String(roll._id), kael.userId)
        await waitForCampaignIdle(id)
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.deathSavesFailure).toBe(2)
        expect((await MaddoxCampaignMessageModel.findById(roll._id).lean())!.combatRoll!.outcome).toMatch(/1 natural: duas falhas/)
        expect(await MaddoxCampaignMessageModel.exists({ campaignId: id, turnAction: true, memberId: new mongoose.Types.ObjectId(kael.memberId) })).toBeTruthy()
    })
})

describe("Maddox 7 — janela de reação", () => {
    async function pendingReaction(id: string, lyra: { userId: string; memberId: string; characterId: string }, combatId: mongoose.Types.ObjectId) {
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.number": 3, "turn.phase": "master", "turn.awaitingChecks": true, "turn.checkRound": 0, "turn.generating": null, "turn.combatActor": null } })
        const message = await MaddoxCampaignMessageModel.create({
            campaignId: id,
            turnNumber: 3,
            phase: "master",
            kind: "combat-reaction",
            memberId: lyra.memberId,
            userId: lyra.userId,
            characterId: lyra.characterId,
            characterName: "Lyra",
            content: "",
            combatReaction: {
                combatId: String(combatId),
                waitRound: 0,
                trigger: "hit",
                description: "Goblin acertou Lyra",
                status: "pending",
                options: [{ id: "spell:x", category: "spells", economy: "reaction", label: "Escudo", detail: "", target: "self", multiTarget: false, resolution: "utility", spell: { circle: 1, levels: [1], concentration: false }, trigger: "hit" }],
                choice: null,
                deadline: new Date(Date.now() + 45_000),
                pendingAttack: { attackerKey: "npc:gob", attackerName: "Goblin", actionName: "Faca", total: 14, d20: 10, damage: 5, damageType: "perfurante", critical: false },
                sourceKey: "npc:gob",
                outcome: null,
                decidedBy: null,
            },
        })
        return message
    }

    it("jogador offline recusa na hora: o golpe entra e a continuação do Maddox anda", async () => {
        const { id, kael, lyra, combatId } = await scene()
        const message = await pendingReaction(id, lyra, combatId)
        presence.online = new Set([kael.userId])
        await reactions.armReactionWindows(new mongoose.Types.ObjectId(id))
        await waitForCampaignIdle(id)
        const settled = (await MaddoxCampaignMessageModel.findById(message._id).lean())!
        expect(settled.combatReaction).toMatchObject({ status: "declined" })
        expect(settled.combatReaction!.outcome).toMatch(/Jogador offline: não reagiu\. Goblin acertou: 5 de dano perfurante/)
        expect((await CharacterSheet.findById(lyra.sheetId).lean())!.hpCurrent).toBe(15)
        expect(await MaddoxCampaignMessageModel.exists({ campaignId: id, kind: "narration", turnNumber: 3, segment: 1 })).toBeTruthy()
    })

    it("o dono só pode recusar no lugar; a opção é exclusiva de quem reage; janela fechada = 409", async () => {
        const { id, kael, lyra, combatId } = await scene()
        const message = await pendingReaction(id, lyra, combatId)
        await expect(reactions.decideReaction(id, String(message._id), "spell:x", kael.userId)).rejects.toMatchObject({ code: "NOT_REACTION_TARGET" })
        await expect(reactions.decideReaction(id, String(message._id), "spell:nao-existe", lyra.userId)).rejects.toMatchObject({ code: "OPTION_UNAVAILABLE" })
        const kaelView = await game.getGameState(id, kael.userId)
        expect(kaelView.messages.find((item) => item.kind === "combat-reaction")!.combatReaction!.options).toEqual([])
        expect(kaelView.turn.pendingCombat).toEqual([expect.objectContaining({ kind: "reaction", characterName: "Lyra" })])
        await reactions.decideReaction(id, String(message._id), "none", kael.userId)
        await waitForCampaignIdle(id)
        expect((await MaddoxCampaignMessageModel.findById(message._id).lean())!.combatReaction!.outcome).toMatch(/O dono recusou a reação no lugar do jogador/)
        await expect(reactions.decideReaction(id, String(message._id), "none", lyra.userId)).rejects.toMatchObject({ code: "REACTION_CLOSED" })
    })
})

describe("Maddox 7 — classificador do custo das habilidades", () => {
    it("texto resolve e grava no cache; sem pista, o JEV classifica em segundo plano (só com a chave ligada)", async () => {
        const entries = [
            { entityType: "trait" as const, entityId: "t1", name: "Fúria", text: "Como uma Ação Bônus, você entra em fúria." },
            { entityType: "trait" as const, entityId: "t2", name: "Grito", text: "Um grito que assusta os inimigos." },
        ]
        let profiles = await resolveProfiles(entries)
        expect(profiles.get(profileKey(entries[0]!))).toMatchObject({ cost: "bonus" })
        expect(profiles.get(profileKey(entries[1]!))).toBeNull()
        // A consulta em segundo plano da primeira leitura termina com a chave desligada.
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(askJevSystemOne).not.toHaveBeenCalled()
        jev["combat-option-cost"] = true
        const notified = vi.fn()
        await resolveProfiles(entries, notified)
        await vi.waitFor(() => expect(notified).toHaveBeenCalled(), { timeout: 5_000 })
        expect(askJevSystemOne).toHaveBeenCalledTimes(1)
        profiles = await resolveProfiles(entries)
        expect(profiles.get(profileKey(entries[1]!))).toMatchObject({ cost: "bonus" })
        expect(askJevSystemOne).toHaveBeenCalledTimes(1)
        expect(await MaddoxCombatOptionProfileModel.countDocuments({})).toBe(2)
    })
})

void freshEconomy
