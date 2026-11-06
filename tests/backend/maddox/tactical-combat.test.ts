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
/** Ganchos para simular a ficha mudando entre a lista de opções e o gasto (outra aba) e uma opção sem os dados. */
const hooks = { beforeSpend: null as null | (() => Promise<void>), patchOptions: null as null | ((options: { bonus: { id: string; heal?: unknown }[] }) => void) }
vi.mock("@/features/maddox/server/combat-sheet", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/features/maddox/server/combat-sheet")>()
    const before = async () => {
        const hook = hooks.beforeSpend
        hooks.beforeSpend = null
        if (hook) await hook()
    }
    return {
        ...actual,
        spendSpellSlot: async (...args: Parameters<typeof actual.spendSpellSlot>) => (await before(), actual.spendSpellSlot(...args)),
        spendResourceCharge: async (...args: Parameters<typeof actual.spendResourceCharge>) => (await before(), actual.spendResourceCharge(...args)),
        consumeSheetItem: async (...args: Parameters<typeof actual.consumeSheetItem>) => (await before(), actual.consumeSheetItem(...args)),
    }
})
vi.mock("@/features/maddox/server/tactical-options", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/features/maddox/server/tactical-options")>()
    return {
        ...actual,
        loadCharacterOptions: async (...args: Parameters<typeof actual.loadCharacterOptions>) => {
            const views = await actual.loadCharacterOptions(...args)
            if (hooks.patchOptions) for (const view of views.values()) hooks.patchOptions(view.options)
            return views
        },
    }
})
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({
        settings: { enabled: true, main: { provider: "gemini", model: "m", agent: null, variant: null, temperature: null, maxOutputTokens: null }, instructions: "Maddox.", avatar: { url: null }, opencode: {}, jev: { ...jev } },
        isDefault: false,
        updatedAt: null,
    })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/features/ai/server/memory-block", () => ({ memoryBlock: vi.fn(async () => "") }))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: vi.fn(async () => undefined) }))
vi.mock("@/lib/ai/stream", () => ({
    prepareModel: vi.fn(async () => ({ model: {}, dispose: async () => undefined })),
    samplingOptions: () => ({}),
    describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    generateAiText: vi.fn(async () => ({ text: validation.verdict })),
}))
type ToolCall = { name: string; input: Record<string, unknown> }
const script: { tools?: ToolCall[]; text?: string }[][] = []
const toolLog: { name: string; output?: unknown; error?: string }[] = []
vi.mock("ai", () => ({
    dynamicTool: (def: unknown) => def,
    stepCountIs: (count: number) => ({ count }),
    // Narração roteirizada: cada geração consome um roteiro (ferramentas reais + texto); sem roteiro, só narra.
    streamText: (options: { tools: Record<string, { execute: (input: unknown, meta: unknown) => Promise<unknown> }> }) => {
        const steps = script.shift() ?? [{ text: "O Maddox narra." }]
        return {
            fullStream: (async function* () {
                let index = 0
                for (const step of steps) {
                    yield { type: "start-step" }
                    for (const call of step.tools ?? []) {
                        const toolCallId = `call-${index++}`
                        yield { type: "tool-call", toolCallId, toolName: call.name, input: call.input }
                        try {
                            const output = await options.tools[call.name]!.execute(call.input, { toolCallId })
                            toolLog.push({ name: call.name, output })
                            yield { type: "tool-result", toolCallId, toolName: call.name, output }
                        } catch (error) {
                            toolLog.push({ name: call.name, error: error instanceof Error ? error.message : String(error) })
                            yield { type: "tool-error", toolCallId, toolName: call.name, error }
                        }
                    }
                    if (step.text) yield { type: "text-delta", text: step.text }
                }
                yield { type: "finish", finishReason: "stop", totalUsage: {} }
            })(),
        }
    },
}))

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCombatModel, MaddoxCombatOptionProfileModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const actions = await import("@/features/maddox/server/tactical-actions")
const tactical = await import("@/features/maddox/server/tactical-combat")
const reactions = await import("@/features/maddox/server/combat-reactions")
const { resolveProfiles, profileKey, resetClassifierAttempts } = await import("@/features/maddox/server/combat-classifier")
const { loadMaddoxSettings } = await import("@/features/maddox/server/settings")
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { freshEconomy } = await import("@/features/maddox/combat-rules")
const { monsterStatsFromCustom } = await import("@/features/maddox/server/combat-monsters")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const { CharacterTrait } = await import("@/features/character-sheets/models/character-trait")
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
async function scene(options: { kaelHp?: number; goblinActions?: Parameters<typeof monsterStatsFromCustom>[0]["acoes"] } = {}) {
    const owner = await seedUser("kael")
    const created = await campaigns.createCampaign({ name: "Mesa", rigor: "fiel-dnd" }, owner)
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const lyraUser = await seedUser("lyra")
    await campaigns.joinByInvite(token, lyraUser)
    const kael = await character(created.id, owner, "Kael", options.kaelHp ?? 20)
    const lyra = await character(created.id, lyraUser, "Lyra", 20)
    const characters = await tactical.combatCharacters(new mongoose.Types.ObjectId(created.id))
    const goblin = tactical.combatantState("npc:gob", "goblin", monsterStatsFromCustom({ ca: 12, pv: 7, acoes: options.goblinActions ?? [{ nome: "Faca", tipo: "ataque", bonus: 4, dano: "1d4+2", tipoDano: "perfurante" }] }))
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

/** Traço na ficha (com carga de recurso pelo nome, como a ficha liga as cargas). */
async function giveTrait(sheetId: string, name: string, description: string, charges?: number) {
    await CharacterTrait.collection.insertOne({ sheetId: new mongoose.Types.ObjectId(sheetId), catalogTraitId: null, name, description, origin: "class" })
    if (charges) await CharacterSheet.collection.updateOne({ _id: new mongoose.Types.ObjectId(sheetId) }, { $push: { resourceCharges: { id: `c-${name}`, name, total: charges, used: 0 } } as never })
}

const goblinOf = async (id: string) => (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.combatants[0]!.tactical!
const codeOf = (result: PromiseSettledResult<unknown>) => (result.status === "rejected" ? (result.reason as { code?: string }).code : null)

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
    vi.mocked(loadMaddoxSettings).mockClear()
    resetClassifierAttempts()
    script.length = 0
    toolLog.length = 0
    hooks.beforeSpend = null
    hooks.patchOptions = null
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
        expect(loadMaddoxSettings).toHaveBeenCalledTimes(1)
        // Cache negativo: leituras seguintes da mesa não releem a configuração nem chamam o JEV antes do prazo.
        jev["combat-option-cost"] = true
        await resolveProfiles(entries)
        await resolveProfiles(entries)
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(loadMaddoxSettings).toHaveBeenCalledTimes(1)
        expect(askJevSystemOne).not.toHaveBeenCalled()
        // Passado o prazo (`MADDOX_COMBAT_CLASSIFY_RETRY_MS`), tenta de novo.
        resetClassifierAttempts()
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

describe("Maddox 7 — revisão: recursos, concorrência e efeitos", () => {
    it("habilidade de cura da ficha: a confirmação dupla gasta a carga UMA vez e a cura entra pela rolagem; ataque sem números vai para o Maddox", async () => {
        const { id, kael } = await scene({ kaelHp: 10 })
        await giveTrait(kael.sheetId, "Retomar o Fôlego", "Você pode usar uma Ação Bônus para recuperar Pontos de Vida iguais a 1d10 mais seu nível de Guerreiro.", 2)
        await giveTrait(kael.sheetId, "Golpe Sombrio", "Como uma Ação Bônus, faça um ataque com arma contra uma criatura que você possa ver.")
        const bonus = (await game.getGameState(id, kael.userId)).me.combat!.options!.bonus
        const heal = bonus.find((option) => option.label === "Retomar o Fôlego")!
        expect(heal).toMatchObject({ resolution: "heal", heal: { dice: "1d10" }, charges: { used: 0, total: 2 } })
        expect(bonus.find((option) => option.label === "Golpe Sombrio")).toMatchObject({ resolution: "utility" })
        const input = { economy: "bonus" as const, optionId: heal.id, targets: [kael.actorKey] }
        const results = await Promise.allSettled([actions.submitCombatAction(id, input, kael.userId), actions.submitCombatAction(id, input, kael.userId)])
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
        expect(["ACTION_ALREADY_USED", "ACTION_PENDING", "OPTION_UNAVAILABLE", "COMBAT_CHANGED"]).toContain(codeOf(results.find((result) => result.status === "rejected")!))
        const sheet = (await CharacterSheet.findById(kael.sheetId).lean())!
        expect(sheet.resourceCharges!.find((charge) => charge.name === "Retomar o Fôlego")!.used).toBe(1)
        const card = (await MaddoxCampaignMessageModel.find({ campaignId: id, kind: "combat-action" }).lean())
        expect(card).toHaveLength(1)
        dice.players.set(kael.userId, [[6]])
        await actions.rollCombatAction(id, String(card[0]!._id), kael.userId)
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.hpCurrent).toBe(16)
        expect((await MaddoxCampaignMessageModel.findById(card[0]!._id).lean())!.combatAction).toMatchObject({ status: "resolved", steps: [{ kind: "heal", amount: 6 }] })
    })

    it("carga esgotada entre a lista e a confirmação: 409 NO_CHARGES, a Ação bônus volta e nada é gravado", async () => {
        const { id, kael } = await scene({ kaelHp: 10 })
        await giveTrait(kael.sheetId, "Retomar o Fôlego", "Você pode usar uma Ação Bônus para recuperar Pontos de Vida iguais a 1d10 mais seu nível de Guerreiro.", 1)
        const heal = (await game.getGameState(id, kael.userId)).me.combat!.options!.bonus.find((option) => option.label === "Retomar o Fôlego")!
        // Outra aba usa a carga depois da reserva da Ação bônus e antes do gasto.
        hooks.beforeSpend = async () => {
            await CharacterSheet.collection.updateOne({ _id: new mongoose.Types.ObjectId(kael.sheetId) }, { $set: { "resourceCharges.0.used": 1 } })
        }
        await expect(actions.submitCombatAction(id, { economy: "bonus", optionId: heal.id, targets: [kael.actorKey] }, kael.userId)).rejects.toMatchObject({ code: "NO_CHARGES" })
        expect((await stateOf(id, kael.actorKey)).economy).toMatchObject({ action: true, bonus: true })
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.resourceCharges![0]!.used).toBe(1)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "combat-action" })).toBe(0)
    })

    it("opção sem os dados para resolver: 409 OPTION_UNRESOLVABLE antes de reservar ou gastar", async () => {
        const { id, kael } = await scene({ kaelHp: 10 })
        await giveTrait(kael.sheetId, "Retomar o Fôlego", "Você pode usar uma Ação Bônus para recuperar Pontos de Vida iguais a 1d10 mais seu nível de Guerreiro.", 1)
        hooks.patchOptions = (options) => {
            for (const option of options.bonus) if (option.heal) delete option.heal
        }
        const heal = (await game.getGameState(id, kael.userId)).me.combat!.options!.bonus.find((option) => option.label === "Retomar o Fôlego")!
        await expect(actions.submitCombatAction(id, { economy: "bonus", optionId: heal.id, targets: [kael.actorKey] }, kael.userId)).rejects.toMatchObject({ code: "OPTION_UNRESOLVABLE" })
        expect((await stateOf(id, kael.actorKey)).economy).toMatchObject({ action: true, bonus: true })
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.resourceCharges![0]!.used).toBe(0)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "combat-action" })).toBe(0)
    })

    it("trava de rolagem abandonada (processo morto no meio) expira; a recente ainda bloqueia", async () => {
        const { id, kael } = await scene()
        const sword = (await game.getGameState(id, kael.userId)).me.combat!.options!.action.find((option) => option.label === "Espada")!
        await actions.submitCombatAction(id, { economy: "action", optionId: sword.id, targets: ["npc:gob"] }, kael.userId)
        const card = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action" }).lean())!
        await MaddoxCampaignMessageModel.updateOne({ _id: card._id }, { $set: { "combatAction.rollingStep": 0, "combatAction.rollingAt": new Date() } })
        await expect(actions.rollCombatAction(id, String(card._id), kael.userId)).rejects.toMatchObject({ code: "ACTION_RESOLVED" })
        await MaddoxCampaignMessageModel.updateOne({ _id: card._id }, { $set: { "combatAction.rollingAt": new Date(Date.now() - 60_000) } })
        dice.players.set(kael.userId, [[15]])
        await actions.rollCombatAction(id, String(card._id), kael.userId)
        expect((await MaddoxCampaignMessageModel.findById(card._id).lean())!.combatAction).toMatchObject({ rollingStep: null, rollingAt: null, steps: [{ kind: "attack", status: "done", hit: true }, { kind: "damage", status: "pending" }] })
        // Rolagem avulsa presa do mesmo jeito.
        const roll = await MaddoxCampaignMessageModel.create({
            campaignId: id,
            turnNumber: 2,
            phase: "players",
            kind: "combat-roll",
            memberId: kael.memberId,
            userId: kael.userId,
            characterId: kael.characterId,
            characterName: "Kael",
            content: "",
            combatRoll: { combatId: "x", kind: "damage", reason: "Estante", dice: "1d4", mode: "normal", dc: null, status: "pending", targetKey: "npc:gob", effect: { damageType: "concussão" }, waitRound: null, roll: null, total: null, success: null, outcome: null, rolledBy: null, rolling: true, rollingAt: new Date() },
        })
        await expect(actions.rollCombatRoll(id, String(roll._id), kael.userId)).rejects.toMatchObject({ code: "ROLL_NOT_PENDING" })
        await MaddoxCampaignMessageModel.updateOne({ _id: roll._id }, { $set: { "combatRoll.rollingAt": new Date(Date.now() - 60_000) } })
        dice.players.set(kael.userId, [[2]])
        await actions.rollCombatRoll(id, String(roll._id), kael.userId)
        expect((await MaddoxCampaignMessageModel.findById(roll._id).lean())!.combatRoll).toMatchObject({ status: "rolled", rolling: false, rollingAt: null, total: 2 })
        expect((await goblinOf(id)).stats.hp).toBe(5)
    })

    it("duas rolagens do mesmo passo ao mesmo tempo: só uma vence e o dano entra uma vez", async () => {
        const { id, kael } = await scene()
        const sword = (await game.getGameState(id, kael.userId)).me.combat!.options!.action.find((option) => option.label === "Espada")!
        await actions.submitCombatAction(id, { economy: "action", optionId: sword.id, targets: ["npc:gob"] }, kael.userId)
        const cardId = String((await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action" }).lean())!._id)
        dice.players.set(kael.userId, [[15]])
        await actions.rollCombatAction(id, cardId, kael.userId)
        dice.players.set(kael.userId, [[3], [3]])
        const results = await Promise.allSettled([actions.rollCombatAction(id, cardId, kael.userId), actions.rollCombatAction(id, cardId, kael.userId)])
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
        expect(codeOf(results.find((result) => result.status === "rejected")!)).toBe("ACTION_RESOLVED")
        expect((await goblinOf(id)).stats.hp).toBe(2)
        const action = (await MaddoxCampaignMessageModel.findById(cardId).lean())!.combatAction!
        expect(action).toMatchObject({ status: "resolved", rollingStep: null })
        expect(action.steps.map((item) => [item.kind, item.status, item.amount])).toEqual([["attack", "done", null], ["damage", "done", 5]])
    })

    it("teste contra a morte rolado duas vezes ao mesmo tempo conta uma vez só", async () => {
        const { id, kael } = await scene({ kaelHp: 0 })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "master", "turn.combatActor": null } })
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.activeIndex": 2, "tactical.nextKey": kael.actorKey } })
        await tactical.advanceToNextCharacter(new mongoose.Types.ObjectId(id), 2)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "players", "turn.eligibleMemberIds": [new mongoose.Types.ObjectId(kael.memberId)], "turn.combatActor": { combatId: (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!._id, actorKey: kael.actorKey, memberId: new mongoose.Types.ObjectId(kael.memberId), offlineSince: null } } })
        const roll = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "death-save" }).lean())!
        dice.players.set(kael.userId, [[1], [1]])
        const results = await Promise.allSettled([actions.rollCombatRoll(id, String(roll._id), kael.userId), actions.rollCombatRoll(id, String(roll._id), kael.userId)])
        await waitForCampaignIdle(id)
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
        expect(codeOf(results.find((result) => result.status === "rejected")!)).toBe("ROLL_NOT_PENDING")
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.deathSavesFailure).toBe(2)
        expect((await MaddoxCampaignMessageModel.findById(roll._id).lean())!.combatRoll).toMatchObject({ status: "rolled", rolling: false })
    })

    async function reactionWindow(id: string, who: { userId: string; memberId: string; characterId: string }, combatId: mongoose.Types.ObjectId, sourceKey: string | null) {
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.number": 3, "turn.phase": "master", "turn.awaitingChecks": true, "turn.checkRound": 0, "turn.generating": null, "turn.combatActor": null } })
        return MaddoxCampaignMessageModel.create({
            campaignId: id,
            turnNumber: 3,
            phase: "master",
            kind: "combat-reaction",
            memberId: who.memberId,
            userId: who.userId,
            characterId: who.characterId,
            characterName: "Kael",
            content: "",
            combatReaction: {
                combatId: String(combatId),
                waitRound: 0,
                trigger: "leave-reach",
                description: "O goblin recua",
                status: "pending",
                options: [{ id: "opportunity", category: "weapons", economy: "reaction", label: "Ataque de oportunidade (Espada)", detail: "", target: "enemy", multiTarget: false, resolution: "attack", attack: { bonus: 4, damage: "1d8+2", damageType: "cortante", ranged: false, light: false }, trigger: "leave-reach" }],
                choice: null,
                deadline: new Date(Date.now() + 45_000),
                pendingAttack: null,
                sourceKey,
                outcome: null,
                decidedBy: null,
            },
        })
    }

    it("ataque de oportunidade: escolher, rolar o ataque e o dano; o dano entra no adversário e a reação é gasta", async () => {
        const { id, kael, combatId } = await scene()
        const window = await reactionWindow(id, kael, combatId, "npc:gob")
        await reactions.decideReaction(id, String(window._id), "opportunity", kael.userId)
        const spawned = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action", "combatAction.economy": "reaction" }).lean())!
        expect(spawned.combatAction!.steps.map((item) => [item.kind, item.dice])).toEqual([["attack", "1d20+4"], ["damage", "1d8+2"]])
        expect((await stateOf(id, kael.actorKey)).economy.reaction).toBe(false)
        dice.players.set(kael.userId, [[15], [3]])
        await actions.rollCombatAction(id, String(spawned._id), kael.userId)
        await actions.rollCombatAction(id, String(spawned._id), kael.userId)
        await waitForCampaignIdle(id)
        expect((await goblinOf(id)).stats.hp).toBe(2)
        expect((await MaddoxCampaignMessageModel.findById(spawned._id).lean())!.combatAction!.status).toBe("resolved")
        // A espera fechou: a continuação do Maddox narrou.
        expect(await MaddoxCampaignMessageModel.exists({ campaignId: id, kind: "narration", turnNumber: 3 })).toBeTruthy()
    })

    it("ataque de oportunidade sem o adversário (janela sem fonte): não sai e a reação não é gasta", async () => {
        const { id, kael, combatId } = await scene()
        const window = await reactionWindow(id, kael, combatId, null)
        await reactions.decideReaction(id, String(window._id), "opportunity", kael.userId)
        await waitForCampaignIdle(id)
        expect(await MaddoxCampaignMessageModel.exists({ campaignId: id, kind: "combat-action", "combatAction.economy": "reaction" })).toBeNull()
        expect((await stateOf(id, kael.actorKey)).economy.reaction).toBe(true)
        expect((await MaddoxCampaignMessageModel.findById(window._id).lean())!.combatReaction!.outcome).toMatch(/não saiu \(a reação não foi gasta\)/)
    })

    it("vez dos adversários: condição e dano pelo apply_effect, dano pedido ao jogador, salvaguarda com dano e concentração; reação sem fonte recusada", async () => {
        const { id, kael, lyra } = await scene({ goblinActions: [{ nome: "Bafo", tipo: "salvaguarda", cd: 13, atributo: "Destreza", dano: "2d6", tipoDano: "veneno", metadeNoSucesso: true }] })
        await MaddoxCombatModel.updateOne({ campaignId: id, "tactical.characters.actorKey": lyra.actorKey }, { $set: { "tactical.characters.$.concentration": { spell: "Bênção", sinceRound: 1 } } })
        script.push([
            {
                tools: [
                    { name: "offer_reaction", input: { personagens: ["Lyra"], gatilho: "saiu-do-alcance", descricao: "O goblin recua." } },
                    { name: "apply_effect", input: { alvo: "Lyra", condicao: "Envenenado", duracaoRodadas: 2, descricao: "Dardo envenenado" } },
                    { name: "apply_effect", input: { alvo: "Goblin", dano: "1d6", tipoDano: "fogo", descricao: "A tocha cai no goblin" } },
                    { name: "request_damage_roll", input: { personagem: "Kael", dados: "1d4", tipoDano: "concussão", alvo: "Goblin", motivo: "A estante que Kael derrubou" } },
                    { name: "monster_action", input: { combatente: "Goblin", acao: "Bafo", alvos: ["Lyra"] } },
                ],
                text: "O goblin sopra uma névoa verde.",
            },
        ])
        await actions.endCombatTurn(id, {}, kael.userId)
        await waitForCampaignIdle(id)
        expect(toolLog.find((item) => item.name === "offer_reaction")!.error).toMatch(/informe em `fonte` o adversário/)
        expect(toolLog.filter((item) => item.name !== "offer_reaction").every((item) => !item.error)).toBe(true)
        // Gravado depois da narração: 3 de fogo (1d6 do servidor) no goblin, Lyra envenenada por 2 rodadas.
        expect((await goblinOf(id)).stats.hp).toBe(4)
        expect((await stateOf(id, lyra.actorKey)).conditions).toEqual([expect.objectContaining({ key: "poisoned", untilRound: 3 })])
        expect((await MaddoxCampaignModel.findById(id).lean())!.turn).toMatchObject({ phase: "master", awaitingChecks: true })

        const damageCard = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "damage" }).lean())!
        expect(String(damageCard.memberId)).toBe(kael.memberId)
        dice.players.set(kael.userId, [[2]])
        await actions.rollCombatRoll(id, String(damageCard._id), kael.userId)
        expect((await goblinOf(id)).stats.hp).toBe(2)

        // Salvaguarda da Lyra: falha (3 contra CD 13) = os 6 de dano rolados pelo servidor; ela concentrava → card de concentração.
        const saveCard = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "save" }).lean())!
        expect(String(saveCard.memberId)).toBe(lyra.memberId)
        dice.players.set(lyra.userId, [[2], [3]])
        await actions.rollCombatRoll(id, String(saveCard._id), lyra.userId)
        expect((await CharacterSheet.findById(lyra.sheetId).lean())!.hpCurrent).toBe(14)
        const concentration = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "concentration" }).lean())!
        expect(concentration.combatRoll).toMatchObject({ dc: 10, status: "pending" })
        await actions.rollCombatRoll(id, String(concentration._id), lyra.userId)
        await waitForCampaignIdle(id)
        expect((await stateOf(id, lyra.actorKey)).concentration).toBeNull()
        expect((await MaddoxCampaignMessageModel.findById(concentration._id).lean())!.combatRoll!.outcome).toMatch(/perdeu a concentração em Bênção/)
        // As esperas fecharam: a continuação narrou.
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "narration" })).toBeGreaterThanOrEqual(2)
    })

    it("dano até 0 PV deixa o personagem Inconsciente; dano massivo mata na hora (ficha, combate e personagem)", async () => {
        const { id, kael, lyra } = await scene({ kaelHp: 5 })
        script.push([
            {
                tools: [
                    { name: "apply_effect", input: { alvo: "Kael", dano: "1d4+4", descricao: "O teto desaba" } },
                    { name: "apply_effect", input: { alvo: "Lyra", dano: "1d4+40", descricao: "A lança do gigante" } },
                ],
                text: "A cripta treme.",
            },
        ])
        await actions.endCombatTurn(id, {}, kael.userId)
        await waitForCampaignIdle(id)
        expect(toolLog.every((item) => !item.error)).toBe(true)
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.hpCurrent).toBe(0)
        expect(await stateOf(id, kael.actorKey)).toMatchObject({ hpZero: true, dead: false, conditions: [expect.objectContaining({ key: "unconscious" })] })
        expect((await CharacterSheet.findById(lyra.sheetId).lean())!.hpCurrent).toBe(0)
        expect(await stateOf(id, lyra.actorKey)).toMatchObject({ dead: true })
        expect((await MaddoxCharacterModel.findById(lyra.characterId).lean())!.status).toBe("dead")
        expect((await MaddoxCharacterModel.findById(kael.characterId).lean())!.status).not.toBe("dead")
    })
})

void freshEconomy
