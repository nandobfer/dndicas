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

// DND-41: a IA da preparação da mesa de combate (padrão: sem mudanças).
vi.mock("@/features/maddox/server/combat-prep-ai", async () => (await import("../../helpers/combat-prep-mock")).combatPrepAiModule)
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
const script: { tools?: ToolCall[]; text?: string; fail?: boolean }[][] = []
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
                    if (step.fail) {
                        yield { type: "error", error: new Error("provedor fora do ar") }
                        return
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
const { waitForCampaignIdle, subscribeGameLive } = await import("@/features/maddox/server/game-live")
const { freshEconomy } = await import("@/features/maddox/combat-rules")
const { settleCampaign, shortenCombatTiming } = await import("../../helpers/maddox-sequence")
await shortenCombatTiming()
const { monsterStatsFromCustom } = await import("@/features/maddox/server/combat-monsters")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const { CharacterTrait } = await import("@/features/character-sheets/models/character-trait")
const { ItemModel } = await import("@/features/items/database/item")
const { MaddoxCombatPrepModel } = await import("@/features/maddox/models")
const combatPrep = await import("@/features/maddox/server/combat-prep")
const adjustments = await import("@/features/maddox/server/combat-adjustments")
const { combatPrepAi, readCatalog } = await import("../../helpers/combat-prep-mock")
/** DND-49: a regra lida no catálogo nesta execução e a fonte que a cita. */
const RULE = { ref: "Regra:r1", quote: "regra do catálogo" }
const readRule = (input: Parameters<typeof readCatalog>[0]) => readCatalog(input, "Regra", "r1", { name: "Regra", description: "Esta é a regra do catálogo do DnDicas." })
const { recordAudit } = await import("@/lib/db")
const { opexUserIdFor } = await import("@/features/maddox/server/opex-members")
const { waitForOpexIdle } = await import("@/features/maddox/server/opex-runtime")

/** Transforma a Lyra em Personagem Opex do Kael (dono da campanha). Devolve o userId sintético. */
async function makeLyraOpex(id: string, lyra: { memberId: string; characterId: string }, ownerUserId: string) {
    const opexUserId = opexUserIdFor(new mongoose.Types.ObjectId(lyra.memberId))
    await MaddoxCampaignMemberModel.updateOne({ _id: lyra.memberId }, { $set: { kind: "opex", userId: opexUserId, opex: { ownerUserId, prompt: "", interviewMode: "autonomous", addedAt: new Date(), run: null, engramind: null } } })
    await MaddoxCharacterModel.updateOne({ _id: lyra.characterId }, { $set: { userId: opexUserId } })
    await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.characters.$[pc].userId": opexUserId } }, { arrayFilters: [{ "pc.memberId": lyra.memberId }] })
    return opexUserId
}

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
    combatPrepAi.reset()
    vi.mocked(recordAudit).mockClear()
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

    it("DND-47: magia de acerto automático grava a rolagem em cada passo de dano por alvo (tooltip do total)", async () => {
        const { id, kael } = await scene()
        hooks.patchOptions = (options) => {
            ;(options as unknown as { action: unknown[] }).action.unshift({ id: "spell:dardos", category: "spells", economy: "action", label: "Dardos", detail: "", target: "enemy", multiTarget: true, resolution: "auto", attack: { bonus: 0, damage: "3d4+3", damageType: "força", ranged: true, light: false }, spell: { circle: 0, levels: [], concentration: false } })
        }
        await actions.submitCombatAction(id, { economy: "action", optionId: "spell:dardos", targets: ["npc:gob"] }, kael.userId)
        const card = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action" }).lean())!
        dice.players.set(kael.userId, [[1, 1, 1]])
        await actions.rollCombatAction(id, String(card._id), kael.userId)
        const steps = (await MaddoxCampaignMessageModel.findById(card._id).lean())!.combatAction!.steps
        // O primeiro passo é o dano rolado; os seguintes são os passos por alvo, criados pelo servidor.
        const perTarget = steps.slice(1).filter((step) => step.kind === "damage" && step.targetKey === "npc:gob")
        expect(perTarget).toHaveLength(1)
        expect(perTarget[0]!.total).toBe(6)
        expect(perTarget[0]!.roll).toMatchObject({ total: 6, modifier: 3 })
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
        // DND-25: primeiro a narração da vez de Kael (efeitos adjudicados, sem adversários); depois o bloco do goblin.
        script.push([
            {
                tools: [
                    { name: "offer_reaction", input: { personagens: ["Lyra"], gatilho: "saiu-do-alcance", descricao: "O goblin recua." } },
                    { name: "apply_effect", input: { alvo: "Lyra", condicao: "Envenenado", duracaoRodadas: 2, descricao: "Dardo envenenado" } },
                    { name: "apply_effect", input: { alvo: "Goblin", dano: "1d6", tipoDano: "fogo", descricao: "A tocha cai no goblin" } },
                    { name: "request_damage_roll", input: { personagem: "Kael", dados: "1d4", tipoDano: "concussão", alvo: "Goblin", motivo: "A estante que Kael derrubou" } },
                    { name: "monster_action", input: { combatente: "Goblin", acao: "Bafo", alvos: ["Lyra"] } },
                ],
                text: "Kael derruba a estante.",
            },
        ])
        await actions.endCombatTurn(id, {}, kael.userId)
        await settleCampaign(id)
        expect(toolLog.find((item) => item.name === "offer_reaction")!.error).toMatch(/informe em `fonte` o adversário/)
        // Na narração da vez de Kael nenhum adversário age.
        expect(toolLog.find((item) => item.name === "monster_action")!.error).toMatch(/nenhum adversário age/)
        expect(toolLog.filter((item) => item.name !== "offer_reaction" && item.name !== "monster_action").every((item) => !item.error)).toBe(true)
        // Gravado depois da narração: 3 de fogo (1d6 do servidor) no goblin, Lyra envenenada por 2 rodadas.
        expect((await goblinOf(id)).stats.hp).toBe(4)
        expect((await stateOf(id, lyra.actorKey)).conditions).toEqual([expect.objectContaining({ key: "poisoned", untilRound: 3 })])
        expect((await MaddoxCampaignModel.findById(id).lean())!.turn).toMatchObject({ phase: "master", awaitingChecks: true })
        toolLog.length = 0
        // Continuação da vez de Kael (resultado do dano) e, depois da pausa, o bloco do goblin.
        script.push([{ text: "A estante esmaga o goblin." }], [{ tools: [{ name: "monster_action", input: { combatente: "Goblin", acao: "Bafo", alvos: ["Lyra"] } }], text: "O goblin sopra uma névoa verde." }])

        const damageCard = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "damage" }).lean())!
        expect(String(damageCard.memberId)).toBe(kael.memberId)
        dice.players.set(kael.userId, [[2]])
        await actions.rollCombatRoll(id, String(damageCard._id), kael.userId)
        await settleCampaign(id)
        expect((await goblinOf(id)).stats.hp).toBe(2)
        expect(toolLog.every((item) => !item.error)).toBe(true)
        // O card do Bafo (o dado) vem antes da narração do goblin.
        const bafo = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action", "combatAction.label": "Bafo" }).lean())!
        const goblinNarration = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "narration", content: /névoa verde/ }).lean())!
        expect(String(bafo._id) < String(goblinNarration._id)).toBe(true)

        // Salvaguarda da Lyra: falha (3 contra CD 13) = os 6 de dano rolados pelo servidor; ela concentrava → card de concentração.
        const saveCard = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "save" }).lean())!
        expect(String(saveCard.memberId)).toBe(lyra.memberId)
        dice.players.set(lyra.userId, [[2], [3]])
        await actions.rollCombatRoll(id, String(saveCard._id), lyra.userId)
        expect((await CharacterSheet.findById(lyra.sheetId).lean())!.hpCurrent).toBe(14)
        const concentration = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "concentration" }).lean())!
        expect(concentration.combatRoll).toMatchObject({ dc: 10, status: "pending" })
        await actions.rollCombatRoll(id, String(concentration._id), lyra.userId)
        await settleCampaign(id)
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

/** Segundo goblin na ordem, entre o primeiro e a Lyra (Kael → Goblin → Goblin 2 → Lyra). */
async function addSecondGoblin(id: string, options: { defeated?: boolean } = {}) {
    const second = tactical.combatantState("npc:gob2", "goblin", monsterStatsFromCustom({ ca: 12, pv: 7, acoes: [{ nome: "Faca", tipo: "ataque", bonus: 4, dano: "1d4+2", tipoDano: "perfurante" }] }))
    if (options.defeated) Object.assign(second, { defeated: true, stats: { ...second.stats, hp: 0 } })
    const combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
    const order = [...combat.tactical!.order]
    order.splice(2, 0, { actorKey: "npc:gob2", kind: "combatant", name: "Goblin 2", total: 9, d20: 7, modifier: 2, dexterity: 14, joinIndex: 3, groupKey: "goblin" })
    await MaddoxCombatModel.updateOne(
        { campaignId: id },
        { $push: { combatants: { name: "Goblin 2", nameKey: "goblin 2", side: "inimigo", quantity: 1, description: "", condition: "", npcId: null, outcome: null, tactical: second } }, $set: { "tactical.order": order } },
    )
}

/** Combate que começa agora (fase de iniciativa) com 2 goblins e 1 lobo; a mesa espera as rolagens no turno 3 do mestre. */
async function initiativeScene(surprise: "adversarios" | null = null, options: { waitPreps?: boolean; beforeCombat?: (context: { id: string; lyra: Awaited<ReturnType<typeof scene>>["lyra"] }) => unknown } = {}) {
    const { id, kael, lyra } = await scene()
    await options.beforeCombat?.({ id, lyra })
    await MaddoxCombatModel.deleteMany({ campaignId: id })
    const campaignId = new mongoose.Types.ObjectId(id)
    const draft = (name: string, quantity: number, iniciativa: number) => ({ name, side: "inimigo" as const, quantity, description: "", condition: "", registerNpc: false, stats: monsterStatsFromCustom({ ca: 12, pv: 7, iniciativa, acoes: [{ nome: "Mordida", tipo: "ataque", bonus: 4, dano: "1d6" }] }) })
    const plan = (await tactical.createTacticalCombat({ _id: campaignId }, 3, 0, { title: "Emboscada", location: "Estrada", surprise, combatants: [draft("Goblin", 2, 2), draft("Lobo", 1, 1)] }, async () => null))!
    await MaddoxCampaignMessageModel.insertMany(plan.initiativeMessages)
    await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.number": 3, "turn.phase": "master", "turn.awaitingChecks": true, "turn.checkRound": 0, "turn.generating": null, "turn.combatActor": null, "turn.eligibleMemberIds": [] } })
    // DND-41: a mesa de cada personagem é preparada (IA mockada, sem mudanças) antes de a iniciativa seguir.
    if (options.waitPreps !== false) await (await import("@/features/maddox/server/combat-prep")).waitForCombatPreps()
    const cardOf = async (userId: string) => (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "initiative", userId }).lean())!
    const enemyCards = () => MaddoxCampaignMessageModel.find({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "enemy-initiative" }).sort({ _id: 1 }).lean()
    return { id, kael, lyra, cardOf, enemyCards }
}

describe("DND-25 — iniciativa dos inimigos depois dos personagens", () => {
    it("os inimigos só rolam depois do último personagem, um dado por grupo, e a ordem só fecha quando os dados param", async () => {
        const { id, kael, lyra, cardOf, enemyCards } = await initiativeScene()
        const rolled: string[] = []
        const unsubscribe = subscribeGameLive(id, (line) => {
            if (line.type === "combat-rolled") rolled.push(line.messageId)
        })
        // Um card por grupo, visível para toda a mesa e fora da lista "aguardando" dos jogadores.
        let enemies = await enemyCards()
        expect(enemies.map((card) => [card.combatRoll!.groupName, card.combatRoll!.dice, card.combatRoll!.status])).toEqual([
            ["Goblin", "1d20+2", "pending"],
            ["Lobo", "1d20+1", "pending"],
        ])
        const lyraView = await game.getGameState(id, lyra.userId)
        expect(lyraView.messages.filter((message) => message.combatRoll?.kind === "enemy-initiative")).toHaveLength(2)
        expect((lyraView.turn.pendingCombat ?? []).map((item) => item.characterName).sort()).toEqual(["Kael", "Lyra"])

        dice.players.set(kael.userId, [[14]])
        await actions.rollCombatRoll(id, String((await cardOf(kael.userId))._id), kael.userId)
        expect((await enemyCards()).every((card) => card.combatRoll!.status === "pending")).toBe(true)
        expect(rolled).toHaveLength(1)

        tactical.combatTiming.enemyRevealMs = 400
        dice.server.push([11], [6])
        dice.players.set(lyra.userId, [[9]])
        await actions.rollCombatRoll(id, String((await cardOf(lyra.userId))._id), lyra.userId)
        enemies = await enemyCards()
        expect(enemies.map((card) => [card.combatRoll!.status, card.combatRoll!.total, card.combatRoll!.outcome])).toEqual([
            ["rolled", 13, "d20 11 + 2 = 13"],
            ["rolled", 7, "d20 6 + 1 = 7"],
        ])
        // DND-47: a iniciativa dos inimigos chega com a parcela nomeada (tooltip do total).
        expect(enemies.map((card) => card.combatRoll!.roll!.modifierParts)).toEqual([[{ label: "Iniciativa", value: 2, color: "dexterity" }], [{ label: "Iniciativa", value: 1, color: "dexterity" }]])
        expect(rolled).toEqual(expect.arrayContaining(enemies.map((card) => String(card._id))))
        // Os dados ainda estão na tela: a ordem não fechou e o Maddox não narrou.
        let combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat.tactical!.phase).toBe("initiative")
        expect(combat.tactical!.order.filter((slot) => slot.kind === "combatant").map((slot) => `${slot.name}:${slot.total}`)).toEqual(["Goblin 1:13", "Goblin 2:13", "Lobo:7"])
        expect(await MaddoxCampaignMessageModel.exists({ campaignId: id, kind: "combat", "combat.event": "order" })).toBeNull()
        await game.checkTurn(id, kael.userId)
        expect((await MaddoxCampaignModel.findById(id).lean())!.turn.awaitingChecks).toBe(true)

        await settleCampaign(id)
        unsubscribe()
        tactical.combatTiming.enemyRevealMs = 20
        combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat.tactical!.phase).toBe("running")
        expect(combat.tactical!.order.map((slot) => slot.name)).toEqual(["Kael", "Goblin 1", "Goblin 2", "Lyra", "Lobo"])
        expect(await MaddoxCampaignMessageModel.exists({ campaignId: id, kind: "combat", "combat.event": "order" })).toBeTruthy()
        expect(await MaddoxCampaignMessageModel.exists({ campaignId: id, kind: "narration", turnNumber: 3 })).toBeTruthy()
    })

    it("o card dos inimigos não pode ser rolado pela rota de rolagem avulsa, nem pelo dono", async () => {
        const { id, kael, enemyCards } = await initiativeScene()
        const [goblins] = await enemyCards()
        await expect(actions.rollCombatRoll(id, String(goblins!._id), kael.userId)).rejects.toMatchObject({ status: 409, code: "ENEMY_ROLL_BY_SERVER" })
        expect((await MaddoxCampaignMessageModel.findById(goblins!._id).lean())!.combatRoll).toMatchObject({ status: "pending", roll: null, rolledBy: null })
        const combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat.tactical!.order.filter((slot) => slot.kind === "combatant").every((slot) => slot.total === null)).toBe(true)
    })

    it("falha depois de reivindicar os cards dos inimigos: a trava é liberada e a chamada seguinte rola; trava abandonada também é retomada", async () => {
        const { id, kael, lyra, cardOf, enemyCards } = await initiativeScene()
        dice.players.set(kael.userId, [[14]])
        await actions.rollCombatRoll(id, String((await cardOf(kael.userId))._id), kael.userId)
        // A gravação da ordem com o total dos inimigos falha uma vez (banco fora).
        const original = MaddoxCombatModel.findOneAndUpdate.bind(MaddoxCombatModel)
        let failed = false
        const spy = vi.spyOn(MaddoxCombatModel, "findOneAndUpdate").mockImplementation(((filter: never, update: { $set?: { tactical?: { phase?: string; order?: { kind: string; total: number | null }[] } } }, options: never) => {
            const tacticalSet = update?.$set?.tactical
            if (!failed && tacticalSet?.phase === "initiative" && tacticalSet.order?.some((slot) => slot.kind === "combatant" && slot.total !== null)) {
                failed = true
                throw new Error("banco indisponível")
            }
            return original(filter, update as never, options)
        }) as never)
        // O card da Lyra fecha sem disparar nada (o teste chama a rolagem dos inimigos direto).
        await MaddoxCampaignMessageModel.updateOne({ _id: (await cardOf(lyra.userId))._id }, { $set: { "combatRoll.status": "cancelled" } })
        const campaignId = new mongoose.Types.ObjectId(id)
        expect(await tactical.rollEnemyInitiativeIfReady(campaignId, 3, 0)).toBe(0)
        spy.mockRestore()
        expect(failed).toBe(true)
        expect((await enemyCards()).map((card) => [card.combatRoll!.status, card.combatRoll!.rolling])).toEqual([
            ["pending", false],
            ["pending", false],
        ])
        // Trava abandonada (processo que caiu depois da reivindicação): mais velha que o prazo, é retomada.
        const [goblins] = await enemyCards()
        await MaddoxCampaignMessageModel.updateOne({ _id: goblins!._id }, { $set: { "combatRoll.rolling": true, "combatRoll.rollingAt": new Date(Date.now() - 60_000) } })
        expect(await tactical.rollEnemyInitiativeIfReady(campaignId, 3, 0)).toBe(2)
        expect((await enemyCards()).every((card) => card.combatRoll!.status === "rolled" && !card.combatRoll!.rolling)).toBe(true)
        await game.checkTurn(id, kael.userId)
        await settleCampaign(id)
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("running")
    })

    it("surpresa dos inimigos: dois d20 da desvantagem e vale o menor", async () => {
        const { id, kael, lyra, cardOf, enemyCards } = await initiativeScene("adversarios")
        expect((await enemyCards()).every((card) => card.combatRoll!.mode === "disadvantage")).toBe(true)
        dice.players.set(kael.userId, [[14]])
        dice.players.set(lyra.userId, [[9]])
        dice.server.push([4, 17], [3, 15])
        await actions.rollCombatRoll(id, String((await cardOf(kael.userId))._id), kael.userId)
        await actions.rollCombatRoll(id, String((await cardOf(lyra.userId))._id), lyra.userId)
        const [goblins, wolf] = await enemyCards()
        expect(goblins!.combatRoll!.roll).toMatchObject({ mode: "disadvantage", selectedD20: { kept: 4, discarded: 17 } })
        expect(goblins!.combatRoll!.total).toBe(6)
        expect(wolf!.combatRoll!.total).toBe(4)
        await settleCampaign(id)
    })

    it("o personagem que sai durante a iniciativa tem o card cancelado e, sendo o último pendente, os inimigos rolam", async () => {
        const { id, kael, lyra, cardOf, enemyCards } = await initiativeScene()
        dice.players.set(kael.userId, [[14]])
        await actions.rollCombatRoll(id, String((await cardOf(kael.userId))._id), kael.userId)
        await MaddoxCampaignMemberModel.updateOne({ _id: lyra.memberId }, { $set: { status: "left" } })
        await game.onMemberLeftGame(new mongoose.Types.ObjectId(id), new mongoose.Types.ObjectId(lyra.memberId))
        expect((await cardOf(lyra.userId)).combatRoll!.status).toBe("cancelled")
        expect((await enemyCards()).every((card) => card.combatRoll!.status === "rolled")).toBe(true)
        await settleCampaign(id)
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("running")
    })
})

describe("DND-25 — um bloco por adversário", () => {
    it("narração da vez de Kael, depois o bloco de cada goblin na ordem, com os dados ao vivo antes do texto e a pausa entre eles", async () => {
        const { id, kael, lyra } = await scene()
        await addSecondGoblin(id)
        const lines: { type: string; roll?: { step: string; verdict: string | null; actorName: string; roll: import("@/features/dice-roller/types").DiceRollResponse } }[] = []
        const unsubscribe = subscribeGameLive(id, (line) => lines.push(line as never))
        dice.server.push([15], [3], [2])
        script.push(
            [{ text: "Kael recua para a parede." }],
            [{ tools: [{ name: "monster_action", input: { combatente: "Goblin", acao: "Faca", alvos: ["Kael"] } }], text: "O goblin crava a faca em Kael." }],
            [
                {
                    tools: [
                        { name: "monster_action", input: { combatente: "Goblin", acao: "Faca", alvos: ["Lyra"] } },
                        { name: "monster_action", input: { combatente: "Goblin 2", acao: "Faca", alvos: ["Lyra"] } },
                    ],
                    text: "O segundo goblin erra Lyra.",
                },
            ],
        )
        await actions.endCombatTurn(id, {}, kael.userId)
        await settleCampaign(id)
        unsubscribe()
        expect(toolLog.map((item) => [item.name, item.error ?? "ok"])).toEqual([
            ["monster_action", "ok"],
            ["monster_action", expect.stringMatching(/Não é a vez de Goblin: neste bloco age só Goblin 2/)],
            ["monster_action", "ok"],
        ])
        // Mensagens do turno do mestre: narração de Kael; card do Goblin e a narração dele; card do Goblin 2 e a narração dele.
        const master = await MaddoxCampaignMessageModel.find({ campaignId: id, turnNumber: 3 }).sort({ _id: 1 }).lean()
        expect(master.map((message) => (message.kind === "narration" ? message.content : `${message.kind}:${message.combatAction?.actorName}`))).toEqual([
            "Kael recua para a parede.",
            "combat-action:Goblin",
            "O goblin crava a faca em Kael.",
            "combat-action:Goblin 2",
            "O segundo goblin erra Lyra.",
        ])
        expect(master.filter((message) => message.kind === "narration").map((message) => message.segment)).toEqual([0, 1, 2])
        // Pausa de leitura entre os blocos (encurtada no teste).
        const [first, second] = master.filter((message) => message.kind === "narration").slice(1)
        expect(new Date(second!.createdAt).getTime() - new Date(first!.createdAt).getTime()).toBeGreaterThanOrEqual(15)
        // Os dados de cada NPC foram para a bolha ao vivo: ataque (com o veredito) e dano do Goblin; ataque do Goblin 2.
        expect(lines.filter((line) => line.type === "live-roll").map((line) => [line.roll!.actorName, line.roll!.step, line.roll!.verdict])).toEqual([
            ["Goblin", "attack", "hit"],
            ["Goblin", "damage", null],
            ["Goblin 2", "attack", "miss"],
        ])
        // DND-47: o ataque do NPC chega com "Bônus de ataque" e a soma do modificador fecha.
        const npcAttack = lines.find((line) => line.type === "live-roll" && line.roll!.step === "attack")!.roll!.roll
        expect(npcAttack.modifierParts!.map((part) => part.label)).toEqual(["Bônus de ataque"])
        expect(npcAttack.modifierParts!.reduce((sum, part) => sum + part.value, 0)).toBe(npcAttack.modifier)
        // Depois do último goblin, abre a vez da Lyra; a fila e o bloco ficam limpos.
        const campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn).toMatchObject({ phase: "players", pauseUntil: null })
        expect(campaign.turn.combatActor?.actorKey).toBe(lyra.actorKey)
        const combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat.tactical).toMatchObject({ block: null, acted: [], queue: [] })
    })

    it("adversário derrotado antes da vez não ganha bloco; NPC sem ataque ganha um bloco só com a narração", async () => {
        const { id, kael } = await scene()
        await addSecondGoblin(id, { defeated: true })
        script.push([{ text: "Kael respira." }], [{ text: "O goblin foge para o beco." }])
        await actions.endCombatTurn(id, {}, kael.userId)
        await settleCampaign(id)
        const narrations = await MaddoxCampaignMessageModel.find({ campaignId: id, turnNumber: 3, kind: "narration" }).sort({ _id: 1 }).lean()
        expect(narrations.map((message) => message.content)).toEqual(["Kael respira.", "O goblin foge para o beco."])
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, turnNumber: 3, kind: "combat-action" })).toBe(0)
        expect(script).toHaveLength(0)
    })

    it("DND-36: o resumo do \"Encerrar turno\" é marcado como combate e não fica oculto para os outros", async () => {
        const { id, kael, lyra } = await scene()
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { hidePlayerActions: true } })
        await addSecondGoblin(id, { defeated: true })
        script.push([{ text: "Kael recua." }], [{ text: "O goblin hesita." }])
        await actions.endCombatTurn(id, { movimento: "Recuo para a porta." }, kael.userId)
        await settleCampaign(id)
        const summary = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "declaration", memberId: kael.memberId }).lean())!
        expect(summary).toMatchObject({ combatTurn: true })
        expect(summary.content).toContain("Recuo para a porta.")
        const seen = (await game.getGameState(id, lyra.userId)).messages.find((message) => message.id === String(summary._id))!
        expect(seen.content).toContain("Recuo para a porta.")
        expect(seen.hiddenAction).toBeUndefined()
    })

    it("todos os personagens com 0 PV no meio da sequência: os adversários restantes não agem e o combate termina em derrota", async () => {
        const { id, kael } = await scene()
        await addSecondGoblin(id)
        script.push(
            [{ text: "Kael tropeça." }],
            [
                {
                    tools: [
                        { name: "apply_effect", input: { alvo: "Kael", dano: "1d4+20", descricao: "O teto desaba" } },
                        { name: "apply_effect", input: { alvo: "Lyra", dano: "1d4+20", descricao: "O teto desaba" } },
                    ],
                    text: "O goblin derruba a viga.",
                },
            ],
        )
        await actions.endCombatTurn(id, {}, kael.userId)
        await settleCampaign(id)
        expect(script).toHaveLength(0)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, turnNumber: 3, kind: "narration" })).toBe(2)
        const combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat).toMatchObject({ status: "ended", outcome: "derrota" })
    })

    it("falha na geração de um bloco: nada daquele NPC é aplicado e a nova tentativa rola de novo; o bloco anterior fica", async () => {
        const { id, kael } = await scene()
        await addSecondGoblin(id)
        dice.server.push([15], [3], [18], [4], [18], [1])
        script.push(
            [{ text: "Kael se abaixa." }],
            [{ tools: [{ name: "monster_action", input: { combatente: "Goblin", acao: "Faca", alvos: ["Kael"] } }], text: "A faca acerta Kael." }],
            [{ tools: [{ name: "monster_action", input: { combatente: "Goblin 2", acao: "Faca", alvos: ["Kael"] } }], fail: true }],
        )
        await actions.endCombatTurn(id, {}, kael.userId)
        await settleCampaign(id)
        const hpAfterFirst = (await CharacterSheet.findById(kael.sheetId).lean())!.hpCurrent
        expect(hpAfterFirst).toBe(15)
        let campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn.failedAt).toBeTruthy()
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, turnNumber: 3, kind: "combat-action", "combatAction.actorName": "Goblin 2" })).toBe(0)
        // Nova tentativa: o Goblin 2 rola de novo (18 + 4 = 22, dano 1 + 2 = 3).
        script.push([{ tools: [{ name: "monster_action", input: { combatente: "Goblin 2", acao: "Faca", alvos: ["Kael"] } }], text: "A segunda faca acerta Kael." }])
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.failedAt": new Date(Date.now() - 60_000) } })
        await game.checkTurn(id, kael.userId)
        await settleCampaign(id)
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.hpCurrent).toBe(12)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, turnNumber: 3, kind: "combat-action", "combatAction.actorName": "Goblin" })).toBe(1)
        campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn.phase).toBe("players")
    })
})

void freshEconomy

// ── DND-41: preparação da mesa de combate ─────────────────────────────────────

const deferred = () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    return { gate, release }
}

const prepsOf = (id: string) => MaddoxCombatPrepModel.find({ campaignId: id }).sort({ _id: 1 }).lean()

/** Rola a iniciativa dos dois personagens da `initiativeScene` (a dos inimigos sai sozinha depois). */
async function rollInitiatives(id: string, who: { kael: { userId: string }; lyra: { userId: string } }, cardOf: (userId: string) => Promise<{ _id: unknown }>) {
    dice.players.set(who.kael.userId, [[14]])
    dice.players.set(who.lyra.userId, [[9]])
    await actions.rollCombatRoll(id, String((await cardOf(who.kael.userId))._id), who.kael.userId)
    await actions.rollCombatRoll(id, String((await cardOf(who.lyra.userId))._id), who.lyra.userId)
}

/** Preparação pronta para um personagem da `scene` (a vez já está aberta). */
async function readyPrep(id: string, combatId: mongoose.Types.ObjectId, who: { actorKey: string; characterId: string; memberId: string; userId: string; sheetId: string }, patch: Record<string, unknown> = {}) {
    return MaddoxCombatPrepModel.create({ campaignId: id, combatId, actorKey: who.actorKey, characterId: who.characterId, memberId: who.memberId, userId: who.userId, sheetId: who.sheetId, characterName: "Kael", turnNumber: 1, waitRound: 0, status: "ready", overlay: { modify: [], remove: [], add: [], suppress: [] }, riders: [], changes: [], adjustments: [], ...patch })
}

const mention = (label: string) => ({ description: `<span data-type="mention" data-id="x" data-entity-type="Regra" class="mention">Propriedade: ${label}</span>`, level: 1 })

describe("DND-41 — a ordem de iniciativa espera a preparação da mesa", () => {
    it("prepara um personagem por vez, mostra os selos e só fecha a ordem com todas as fichas prontas", async () => {
        const hold = deferred()
        combatPrepAi.review.mockImplementation(async () => {
            await hold.gate
            return { sheetChanges: [], modify: [], remove: [], add: [] }
        })
        const { id, kael, lyra, cardOf } = await initiativeScene(null, { waitPreps: false })
        await rollInitiatives(id, { kael, lyra }, cardOf)
        await new Promise((resolve) => setTimeout(resolve, 60))
        // Os dados pararam, mas a mesa de ninguém está pronta: a ordem não fecha.
        expect(await tactical.finishInitiativeIfReady(new mongoose.Types.ObjectId(id), 3, 1)).toBe(false)
        expect((await prepsOf(id)).map((prep) => prep.status)).toEqual(["running", "pending"])
        const state = await game.getGameState(id, lyra.userId)
        const tracker = state.combat!.tactical!
        expect(tracker.preparation).toMatchObject({ active: true, blocked: false, failures: [] })
        expect(tracker.order.filter((slot) => slot.kind === "character").map((slot) => slot.prep?.status)).toEqual(["preparing", "waiting"])
        hold.release()
        await combatPrep.waitForCombatPreps()
        await settleCampaign(id)
        expect(combatPrepAi.review).toHaveBeenCalledTimes(2)
        expect((await prepsOf(id)).map((prep) => prep.status)).toEqual(["ready", "ready"])
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("running")
        expect((await game.getGameState(id, lyra.userId)).combat!.tactical!.preparation ?? null).toBeNull()
    })

    it("falha trava o combate: só o dono vê o motivo e decide; os demais veem só o selo", async () => {
        combatPrepAi.review.mockImplementation(async (input) => {
            if (input.characterName === "Lyra") throw new Error("PROVEDOR-SECRETO-123")
            return { sheetChanges: [], modify: [], remove: [], add: [] }
        })
        const { id, kael, lyra, cardOf } = await initiativeScene()
        await rollInitiatives(id, { kael, lyra }, cardOf)
        await settleCampaign(id)
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("initiative")
        const failed = (await prepsOf(id)).find((prep) => prep.characterName === "Lyra")!
        expect(failed.status).toBe("failed")
        const owner = await game.getGameState(id, kael.userId)
        expect(owner.combat!.tactical!.preparation).toMatchObject({ blocked: true, failures: [{ prepId: String(failed._id), characterName: "Lyra", error: "PROVEDOR-SECRETO-123" }] })
        const player = await game.getGameState(id, lyra.userId)
        expect(player.combat!.tactical!.preparation).toMatchObject({ blocked: true, failures: [] })
        expect(JSON.stringify(player)).not.toContain("PROVEDOR-SECRETO-123")
        expect(player.combat!.tactical!.order.find((slot) => slot.name === "Lyra")!.prep).toEqual({ status: "failed" })
        // Só o dono decide.
        await expect(combatPrep.retryCombatPrep(id, String(failed._id), lyra.userId)).rejects.toMatchObject({ code: "OWNER_ONLY" })
        await expect(combatPrep.skipCombatPrep(id, String(failed._id), lyra.userId)).rejects.toMatchObject({ code: "OWNER_ONLY" })
        // "Tentar de novo": a IA volta e a ordem fecha.
        combatPrepAi.review.mockImplementation(async () => ({ sheetChanges: [], modify: [], remove: [], add: [] }))
        await combatPrep.retryCombatPrep(id, String(failed._id), kael.userId)
        await combatPrep.waitForCombatPreps()
        await settleCampaign(id)
        expect((await MaddoxCombatPrepModel.findById(failed._id).lean())!.status).toBe("ready")
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("running")
        expect(vi.mocked(recordAudit).mock.calls.some(([input]) => (input.depois as { decision?: string } | undefined)?.decision === "retry")).toBe(true)
    })

    it('"Seguir sem preparação": a ficha usa a lista base corrigida e o combate segue', async () => {
        combatPrepAi.review.mockImplementation(async (input) => {
            if (input.characterName === "Kael") throw new Error("fora do ar")
            return { sheetChanges: [], modify: [], remove: [], add: [] }
        })
        const { id, kael, lyra, cardOf } = await initiativeScene()
        await rollInitiatives(id, { kael, lyra }, cardOf)
        await settleCampaign(id)
        const failed = (await prepsOf(id)).find((prep) => prep.characterName === "Kael")!
        await combatPrep.skipCombatPrep(id, String(failed._id), kael.userId)
        await settleCampaign(id)
        expect((await MaddoxCombatPrepModel.findById(failed._id).lean())!.status).toBe("skipped")
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("running")
        await expect(combatPrep.skipCombatPrep(id, String(failed._id), kael.userId)).rejects.toMatchObject({ code: "PREP_NOT_FAILED" })
    })

    it("a revisão grava na ficha (com auditoria) e o dono recebe o card privado com o que era, o que ficou e o motivo", async () => {
        combatPrepAi.review.mockImplementation(async (input) => {
            if (input.characterName !== "Kael") return { sheetChanges: [], modify: [], remove: [], add: [] }
            const weapon = /id="(weapon:[^"]+)"/.exec(input.optionsText)![1]
            readRule(input)
            return {
                sheetChanges: [{ type: "ability", attribute: "dexterity", value: 16, reason: "A rolagem da entrevista deu 16.", source: RULE }],
                modify: [{ optionId: weapon, attack: { bonus: 7, damage: "1d8+3", damageType: "cortante" }, reason: "Estilo de luta Duelismo.", source: RULE }],
                add: [{ id: "segundo-folego", category: "abilities", economy: "bonus", label: "Retomar o Fôlego", resolution: "heal", heal: { dice: "1d10+3" }, target: "self", reason: "Guerreiro de nível 3.", source: RULE }],
            }
        })
        const { id, kael, lyra, cardOf } = await initiativeScene()
        expect((await CharacterSheet.findById(kael.sheetId).lean<{ dexterity: number }>())!.dexterity).toBe(16)
        expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FichaPersonagem", entidadeId: kael.sheetId, depois: expect.objectContaining({ by: "maddox", reason: "A rolagem da entrevista deu 16." }) }))
        const prep = (await prepsOf(id)).find((item) => item.characterName === "Kael")!
        expect(prep.changes.map((change) => [change.label, change.before, change.after])).toEqual([
            ["Destreza", "12", "16"],
            ["Espada", "+4 para acertar · 1d8+2 cortante", "+7 para acertar · 1d8+3 cortante"],
            ["Retomar o Fôlego", "não existia", "Ação bônus"],
        ])
        // Card privado: o dono do personagem vê, a outra jogadora não.
        const mine = (await game.getGameState(id, kael.userId)).messages.filter((message) => message.kind === "combat-prep")
        expect(mine.map((message) => message.combatPrep!.characterName)).toEqual(["Kael"])
        expect(mine[0]!.combatPrep!.changes).toHaveLength(3)
        const hers = (await game.getGameState(id, lyra.userId)).messages.filter((message) => message.kind === "combat-prep")
        expect(hers.map((message) => [message.combatPrep!.characterName, message.combatPrep!.changes.length])).toEqual([["Lyra", 0]])
        // Na vez dele, a opção ajustada mostra o motivo e a nova ação bônus aparece.
        await rollInitiatives(id, { kael, lyra }, cardOf)
        await settleCampaign(id)
        const options = (await import("@/features/maddox/server/tactical-options")).loadCharacterOptions
        const combat = (await tactical.findActiveTactical(new mongoose.Types.ObjectId(id)))!
        const view = (await options(combat.tactical.characters.filter((state) => state.name === "Kael"), undefined, combat._id)).get(kael.actorKey)!
        const sword = view.options.action.find((option) => option.category === "weapons" && option.id !== "unarmed")!
        expect([sword.attack!.bonus, sword.attack!.damage, sword.adjusted?.reason]).toEqual([7, "1d8+3", "Estilo de luta Duelismo."])
        expect(view.options.bonus.map((option) => option.label)).toEqual(["Retomar o Fôlego", "Outra ação"])
    })

    it("o jogador alterou a ficha durante a preparação: o Maddox revisa de novo sobre o dado mais recente", async () => {
        let calls = 0
        combatPrepAi.review.mockImplementation(async (input) => {
            if (input.characterName !== "Kael") return { sheetChanges: [], modify: [], remove: [], add: [] }
            calls += 1
            if (calls === 1) await CharacterSheet.collection.updateOne({ characterName: { $exists: false }, name: "Kael" }, { $set: { strength: 18, updatedAt: new Date() } })
            readRule(input)
            return { sheetChanges: [{ type: "ability", attribute: "wisdom", value: 13, reason: "Corrigido.", source: RULE }] }
        })
        const { id, kael } = await initiativeScene()
        expect(calls).toBe(2)
        const reviewed = vi.mocked(combatPrepAi.review).mock.calls.filter(([input]) => input.characterName === "Kael").map(([input]) => input.sheetText)
        expect(reviewed[1]).toContain("Força 18")
        const sheet = (await CharacterSheet.findById(kael.sheetId).lean<{ strength: number; wisdom: number }>())!
        expect([sheet.strength, sheet.wisdom]).toEqual([18, 13])
        expect((await prepsOf(id)).every((prep) => prep.status === "ready")).toBe(true)
    })

    it("combate encerrado durante a preparação: ela é descartada sem gravar na ficha", async () => {
        const hold = deferred()
        combatPrepAi.review.mockImplementation(async () => {
            await hold.gate
            return { sheetChanges: [{ type: "ability", attribute: "wisdom", value: 18, reason: "x" }] }
        })
        const { id, kael } = await initiativeScene(null, { waitPreps: false })
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { status: "ended" } })
        await combatPrep.discardCombatPreps((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!._id)
        hold.release()
        await combatPrep.waitForCombatPreps()
        expect((await prepsOf(id)).map((prep) => prep.status)).toEqual(["discarded", "discarded"])
        expect((await CharacterSheet.findById(kael.sheetId).lean<{ wisdom: number }>())!.wisdom).toBe(10)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "combat-prep" })).toBe(0)
    })

    it("IA não configurada: a preparação falha com o motivo em pt-BR para o dono", async () => {
        const { maddoxAvailability } = await import("@/features/maddox/server/settings")
        const { id, kael } = await initiativeScene(null, { beforeCombat: () => vi.mocked(maddoxAvailability).mockResolvedValueOnce({ available: false, reason: 'O "Agente Maddox" não está configurado.' } as never) })
        const failures = (await game.getGameState(id, kael.userId)).combat!.tactical!.preparation!.failures
        expect(failures[0]).toMatchObject({ characterName: "Kael", error: 'O "Agente Maddox" não está configurado.' })
    })
})

describe("DND-51 — a preparação pergunta ao jogador quando falta uma escolha dele", () => {
    const SERPENTINA = { name: "Conjuração Serpentina", description: "Você sabe Rajada de Veneno. Inteligência, Sabedoria, ou Carisma é sua habilidade de feitiços para esses feitiços (escolha quando selecionar esta corrida)." }
    const SOURCE = { ref: "Habilidade:serpentina", quote: "Inteligência, Sabedoria, ou Carisma é sua habilidade de feitiços" }
    const reviewFor = (answerQuote: (answer: string | null) => string | null) =>
        combatPrepAi.review.mockImplementation(async (input) => {
            if (input.characterName !== "Lyra") return { sheetChanges: [], modify: [], remove: [], add: [] }
            readCatalog(input, "Habilidade", "serpentina", SERPENTINA)
            const asked = (input as { question?: { text: string; answer: string | null } }).question
            const quote = asked ? answerQuote(asked.answer) : null
            // O Maddox "decide" Carisma sozinho na primeira passada; depois, usa o que o jogador respondeu.
            return { sheetChanges: [{ type: "spellcasting-attribute", attribute: quote ? "wisdom" : "charisma", reason: "Conjuração Serpentina.", source: SOURCE, ...(quote ? { choice: { quote } } : {}) }], modify: [], remove: [], add: [] }
        })

    it("para com a pergunta (nada é gravado), segura a ordem e conclui com a resposta do jogador", async () => {
        reviewFor((answer) => answer)
        const { id, kael, lyra, cardOf } = await initiativeScene()
        await rollInitiatives(id, { kael, lyra }, cardOf)
        await settleCampaign(id)
        const prep = (await prepsOf(id)).find((item) => item.characterName === "Lyra")!
        expect(prep.status).toBe("awaiting-player")
        expect(prep.question!.text).toMatch(/escolha sua/)
        expect((await CharacterSheet.findById(lyra.sheetId).lean<{ spellcastingAttribute?: string | null }>())!.spellcastingAttribute ?? null).toBeNull()
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("initiative")
        const state = await game.getGameState(id, lyra.userId)
        expect(state.combat!.tactical!.order.find((slot) => slot.name === "Lyra")!.prep).toEqual({ status: "asking" })
        const card = state.messages.find((message) => message.kind === "combat-prep")!
        expect(card.combatPrep!.question).toMatchObject({ prepId: String(prep._id), status: "awaiting", answer: null })
        // Só o jogador do personagem responde.
        await expect(combatPrep.answerCombatPrep(id, String(prep._id), "Sabedoria", kael.userId)).rejects.toMatchObject({ code: "FORBIDDEN" })
        const answered = await combatPrep.answerCombatPrep(id, String(prep._id), "Quero Sabedoria", lyra.userId)
        // Enquanto a preparação conclui, o card mostra a resposta enviada, não "mesa pronta".
        expect(answered.messages.find((message) => message.kind === "combat-prep")!.combatPrep!.question).toMatchObject({ status: "answered", settled: false })
        await combatPrep.waitForCombatPreps()
        await settleCampaign(id)
        expect((await CharacterSheet.findById(lyra.sheetId).lean<{ spellcastingAttribute: string }>())!.spellcastingAttribute).toBe("wisdom")
        const done = (await MaddoxCombatPrepModel.findById(prep._id).lean())!
        expect(done.status).toBe("ready")
        expect(combatPrepAi.review).toHaveBeenLastCalledWith(expect.objectContaining({ characterName: "Lyra", question: expect.objectContaining({ answer: "Quero Sabedoria" }) }))
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("running")
        const after = (await game.getGameState(id, lyra.userId)).messages.find((message) => message.kind === "combat-prep" && message.combatPrep?.characterName === "Lyra")!
        expect(after.combatPrep!.question).toMatchObject({ status: "answered", answer: "Quero Sabedoria", settled: true })
        expect(after.combatPrep!.changes.some((change) => change.label === "Atributo de conjuração" && change.applied)).toBe(true)
        await expect(combatPrep.answerCombatPrep(id, String(prep._id), "de novo", lyra.userId)).rejects.toMatchObject({ code: "PREP_NOT_ASKING" })
    })

    it("F10: descartada ou com falha depois da resposta, o card fica num estado final (sem 'concluindo')", async () => {
        reviewFor((answer) => answer)
        const { id, kael, lyra, cardOf } = await initiativeScene()
        await rollInitiatives(id, { kael, lyra }, cardOf)
        await settleCampaign(id)
        const cardOfLyra = async () => (await game.getGameState(id, lyra.userId)).messages.find((message) => message.kind === "combat-prep" && message.combatPrep?.characterName === "Lyra")!.combatPrep!.question
        const prep = (await prepsOf(id)).find((item) => item.characterName === "Lyra")!
        // A nova passada falha: o card sai de "concluindo" para "com falha"; "Tentar de novo" volta a "concluindo".
        combatPrepAi.review.mockImplementation(async (input) => {
            if (input.characterName === "Lyra") throw new Error("fora do ar")
            return { sheetChanges: [], modify: [], remove: [], add: [] }
        })
        await combatPrep.answerCombatPrep(id, String(prep._id), "Sabedoria", lyra.userId)
        await combatPrep.waitForCombatPreps()
        await settleCampaign(id)
        expect(await cardOfLyra()).toMatchObject({ halted: "failed", settled: true })
        const hold = deferred()
        combatPrepAi.review.mockImplementation(async () => {
            await hold.gate
            return { sheetChanges: [], modify: [], remove: [], add: [] }
        })
        await combatPrep.retryCombatPrep(id, String(prep._id), kael.userId)
        expect(await cardOfLyra()).toMatchObject({ halted: null, settled: false })
        // O combate termina com a preparação ainda rodando: o card fica "interrompida".
        await combatPrep.discardCombatPreps(prep.combatId)
        expect(await cardOfLyra()).toMatchObject({ halted: "discarded", settled: true })
        hold.release()
        await combatPrep.waitForCombatPreps()
        await settleCampaign(id)
        expect((await MaddoxCombatPrepModel.findById(prep._id).lean())!.status).toBe("discarded")
        expect(await cardOfLyra()).toMatchObject({ halted: "discarded" })
    }, 20_000)

    it("F11: falha depois da resposta e o dono segue sem preparação — o card deixa de dizer que falhou", async () => {
        reviewFor((answer) => answer)
        const { id, kael, lyra, cardOf } = await initiativeScene()
        await rollInitiatives(id, { kael, lyra }, cardOf)
        await settleCampaign(id)
        const cardOfLyra = async () => (await game.getGameState(id, lyra.userId)).messages.find((message) => message.kind === "combat-prep" && message.combatPrep?.characterName === "Lyra")!.combatPrep!.question
        const prep = (await prepsOf(id)).find((item) => item.characterName === "Lyra")!
        combatPrepAi.review.mockImplementation(async (input) => {
            if (input.characterName === "Lyra") throw new Error("fora do ar")
            return { sheetChanges: [], modify: [], remove: [], add: [] }
        })
        await combatPrep.answerCombatPrep(id, String(prep._id), "Sabedoria", lyra.userId)
        await combatPrep.waitForCombatPreps()
        await settleCampaign(id)
        expect(await cardOfLyra()).toMatchObject({ halted: "failed" })
        await combatPrep.skipCombatPrep(id, String(prep._id), kael.userId)
        await settleCampaign(id)
        expect((await MaddoxCombatPrepModel.findById(prep._id).lean())!.status).toBe("skipped")
        expect(await cardOfLyra()).toMatchObject({ halted: null, settled: true })
    }, 20_000)

    it("sem resposta no prazo, conclui sem a escolha (o atributo fica vazio) e avisa no card", async () => {
        combatPrep.combatPrepTiming.answerMs = 40
        try {
            reviewFor(() => null)
            // A passada depois do prazo fica segura: o card já deixou de oferecer a resposta.
            const hold = deferred()
            const answerless = combatPrepAi.review.getMockImplementation()!
            combatPrepAi.review.mockImplementation(async (input) => {
                if ((input as { question?: unknown }).question) await hold.gate
                return answerless(input)
            })
            const { id, kael, lyra, cardOf } = await initiativeScene()
            await rollInitiatives(id, { kael, lyra }, cardOf)
            await vi.waitFor(async () => {
                const card = (await game.getGameState(id, lyra.userId)).messages.find((message) => message.kind === "combat-prep" && message.combatPrep?.characterName === "Lyra")!
                expect(card.combatPrep!.question).toMatchObject({ status: "expired", settled: false })
            })
            hold.release()
            await combatPrep.waitForCombatPreps()
            await settleCampaign(id)
            const prep = (await prepsOf(id)).find((item) => item.characterName === "Lyra")!
            expect(prep.status).toBe("ready")
            expect(prep.question!.expired).toBe(true)
            expect((await CharacterSheet.findById(lyra.sheetId).lean<{ spellcastingAttribute?: string | null }>())!.spellcastingAttribute ?? null).toBeNull()
            expect(prep.changes.some((change) => change.refused?.startsWith("Falta a escolha do jogador"))).toBe(true)
            expect(prep.changes[0]).toMatchObject({ area: "aviso", reason: expect.stringMatching(/Pergunte ao mestre/) })
            expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("running")
        } finally {
            combatPrep.combatPrepTiming.answerMs = 3 * 60_000
        }
    })
})

describe("DND-41 — pedido de ajuste na própria vez", () => {
    it("só o dono do personagem, só na vez dele, numa opção que existe e com a mesa preparada", async () => {
        const { id, kael, lyra, combatId } = await scene()
        await expect(adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "mais dano" }, kael.userId)).rejects.toMatchObject({ code: "PREP_NOT_READY" })
        await readyPrep(id, combatId, kael)
        await expect(adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "mais dano" }, lyra.userId)).rejects.toMatchObject({ code: "NOT_YOUR_COMBAT_TURN" })
        await expect(adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "weapon:nao-existe", text: "mais dano" }, kael.userId)).rejects.toMatchObject({ code: "OPTION_UNAVAILABLE", message: "Esta opção não existe mais. Escolha outra na lista." })
        expect(combatPrepAi.adjust).not.toHaveBeenCalled()
    })

    it("aceito: corrige a opção e a ficha (auditada), mostra o motivo e não gasta a ação", async () => {
        const { id, kael, combatId } = await scene()
        await readyPrep(id, combatId, kael)
        const before = (await game.getGameState(id, kael.userId)).me.combat!
        const sword = before.options!.action.find((option) => option.category === "weapons" && option.id !== "unarmed")!
        const hold = deferred()
        combatPrepAi.adjust.mockImplementation(async (input) => (await hold.gate, readRule(input), {
            decision: "accept",
            reason: "A espada tem acuidade nesta campanha: vale a Destreza.",
            sheetChanges: [{ type: "ability", attribute: "dexterity", value: 16, reason: "Valor da entrevista.", source: RULE }],
            modify: [{ optionId: sword.id, attack: { bonus: 6, damage: "1d8+3", damageType: "cortante", finesse: true }, reason: "A espada tem acuidade.", source: RULE }],
        }))
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: sword.id, text: "mas a espada tem acuidade, deveria ser destreza" }, kael.userId)
        expect((await game.getGameState(id, kael.userId)).me.combat!.adjustments!.at(-1)!.status).toBe("pending")
        hold.release()
        await combatPrep.waitForCombatPreps()
        const after = (await game.getGameState(id, kael.userId)).me.combat!
        expect(after.adjustments!.at(-1)).toMatchObject({ status: "accepted", reason: "A espada tem acuidade nesta campanha: vale a Destreza." })
        const fixed = after.options!.action.find((option) => option.id === sword.id)!
        expect([fixed.attack!.bonus, fixed.attack!.damage, fixed.adjusted?.reason]).toEqual([6, "1d8+3", "A espada tem acuidade."])
        expect(after.economy).toMatchObject({ action: true, bonus: true })
        expect((await CharacterSheet.findById(kael.sheetId).lean<{ dexterity: number }>())!.dexterity).toBe(16)
        expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FichaPersonagem", depois: expect.objectContaining({ origin: "combat-adjust" }) }))
    })

    it("recusado: nada muda; o segundo pedido é tratado depois e vê o primeiro", async () => {
        const { id, kael, combatId } = await scene()
        await readyPrep(id, combatId, kael)
        combatPrepAi.adjust.mockImplementation(async (input) => (readRule(input), { decision: "refuse", reason: "10d10 não existe para uma espada." }))
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "dano 10d10" }, kael.userId)
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "então 2d10" }, kael.userId)
        await combatPrep.waitForCombatPreps()
        const mine = (await game.getGameState(id, kael.userId)).me.combat!
        expect(mine.adjustments!.map((item) => [item.text, item.status, item.reason])).toEqual([
            ["dano 10d10", "refused", "10d10 não existe para uma espada."],
            ["então 2d10", "refused", "10d10 não existe para uma espada."],
        ])
        const second = vi.mocked(combatPrepAi.adjust).mock.calls[1]![0] as unknown as { previous: string }
        expect(second.previous).toContain('"dano 10d10" → recusado')
        expect(mine.options!.action.find((option) => option.id === "unarmed")!.adjusted).toBeUndefined()
    })

    it("falha da IA: o jogador recebe a mensagem genérica; o motivo técnico só vai ao dono da campanha", async () => {
        const { id, lyra, combatId } = await scene()
        await readyPrep(id, combatId, lyra, { characterName: "Lyra" })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.combatActor.actorKey": lyra.actorKey, "turn.combatActor.memberId": new mongoose.Types.ObjectId(lyra.memberId), "turn.eligibleMemberIds": [new mongoose.Types.ObjectId(lyra.memberId)] } })
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.activeIndex": 2 } })
        combatPrepAi.adjust.mockImplementation(async () => {
            throw new Error("CHAVE-VAZADA-999")
        })
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "acho que está errado" }, lyra.userId)
        await combatPrep.waitForCombatPreps()
        const hers = await game.getGameState(id, lyra.userId)
        expect(hers.me.combat!.adjustments!.at(-1)).toMatchObject({ status: "error", reason: "O Maddox não conseguiu examinar o pedido agora. Tente de novo." })
        expect(JSON.stringify(hers)).not.toContain("CHAVE-VAZADA-999")
    })

    it("o JEV recusa na hora o pedido que burla as regras (sem chamar o narrador)", async () => {
        const { id, kael, combatId } = await scene()
        await readyPrep(id, combatId, kael)
        combatPrepAi.screen.mockResolvedValueOnce(false)
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "dano 10d10" }, kael.userId)
        await combatPrep.waitForCombatPreps()
        expect((await game.getGameState(id, kael.userId)).me.combat!.adjustments!.at(-1)!.status).toBe("refused")
        expect(combatPrepAi.adjust).not.toHaveBeenCalled()
    })

    it("a revalidação usa a lista preparada: opção removida pelo Maddox é recusada ao confirmar", async () => {
        const { id, kael, combatId } = await scene()
        await readyPrep(id, combatId, kael, { overlay: { modify: [], remove: [{ optionId: "unarmed", reason: "x" }], add: [], suppress: [] } })
        await expect(actions.submitCombatAction(id, { economy: "action", optionId: "unarmed", targets: ["npc:gob"] }, kael.userId)).rejects.toMatchObject({ code: "OPTION_UNAVAILABLE" })
    })
})

describe("DND-41 — ataque furtivo", () => {
    async function rogueScene() {
        await ItemModel.collection.insertOne({ name: "Adaga", type: "arma", status: "active", damageDice: { quantidade: 1, tipo: "d4" }, damageType: "perfurante", properties: [mention("Acuidade / Finesse"), mention("Leve")] })
        const built = await scene()
        const dagger = await ItemModel.collection.findOne({ name: "Adaga" })
        await CharacterItem.collection.updateOne({ sheetId: new mongoose.Types.ObjectId(built.kael.sheetId) }, { $set: { catalogItemId: dagger!._id, name: "<p>Adaga</p>" } })
        await CharacterSheet.collection.updateOne({ _id: new mongoose.Types.ObjectId(built.kael.sheetId) }, { $set: { dexterity: 17 } })
        await readyPrep(built.id, built.combatId, built.kael, { riders: [{ key: "sneak-attack", dice: "2d6", source: "server", reason: null }] })
        const options = (await game.getGameState(built.id, built.kael.userId)).me.combat!.options!
        return { ...built, dagger: options.action.find((option) => option.id.startsWith("weapon:") && !option.id.endsWith(":thrown"))! }
    }

    const actionOf = async (id: string) => (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action" }).sort({ _id: -1 }).lean())!

    it("DND-49: o furtivo só aparece na arma elegível e é perguntado depois do acerto; 'Somar' entra no dano e vale uma vez por turno", async () => {
        const { id, kael, dagger } = await rogueScene()
        expect(dagger.attack).toMatchObject({ bonus: 5, damage: "1d4+3", finesse: true, riders: [{ key: "sneak-attack", label: "Ataque furtivo (+2d6)", dice: "2d6" }] })
        const options = (await game.getGameState(id, kael.userId)).me.combat!.options!
        expect(options.action.find((option) => option.id === "unarmed")!.attack!.riders).toBeUndefined()
        await actions.submitCombatAction(id, { economy: "action", optionId: dagger.id, targets: ["npc:gob"] }, kael.userId)
        let message = await actionOf(id)
        // Antes do ataque nada é perguntado nem somado.
        expect(message.combatAction!.steps.map((step) => step.kind)).toEqual(["attack", "damage"])
        expect(message.combatAction!.steps[1]).toMatchObject({ dice: "1d4+3" })
        dice.players.set(kael.userId, [[15], [3, 4, 5]])
        await actions.rollCombatAction(id, String(message._id), kael.userId)
        expect(combatPrepAi.sneak).toHaveBeenCalledTimes(1)
        message = await actionOf(id)
        expect(message.combatAction!.steps.map((step) => [step.kind, step.status])).toEqual([["attack", "done"], ["sneak-choice", "pending"], ["damage", "pending"]])
        // O dano só rola depois da resposta.
        await expect(actions.rollCombatAction(id, String(message._id), kael.userId)).rejects.toMatchObject({ code: "SNEAK_CHOICE_PENDING" })
        await actions.chooseSneakAttack(id, String(message._id), true, kael.userId)
        message = await actionOf(id)
        expect(message.combatAction!.steps[2]).toMatchObject({ kind: "damage", dice: "1d4+3+2d6", note: "ataque furtivo +2d6" })
        expect(message.combatAction!.summary).toContain("Ataque furtivo (+2d6)")
        expect((await stateOf(id, kael.actorKey)).economy.sneakAttackUsed).toBeFalsy()
        await actions.rollCombatAction(id, String(message._id), kael.userId)
        expect((await stateOf(id, kael.actorKey)).economy.sneakAttackUsed).toBe(true)
        // Segundo acerto no mesmo turno: não pergunta de novo.
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.characters.$[me].economy.action": true, "combatants.0.tactical.defeated": false, "combatants.0.tactical.stats.hp": 7 } }, { arrayFilters: [{ "me.actorKey": kael.actorKey }] })
        await actions.submitCombatAction(id, { economy: "action", optionId: dagger.id, targets: ["npc:gob"] }, kael.userId)
        message = await actionOf(id)
        dice.players.set(kael.userId, [[15]])
        await actions.rollCombatAction(id, String(message._id), kael.userId)
        expect((await actionOf(id)).combatAction!.steps.map((step) => step.kind)).toEqual(["attack", "damage"])
    })

    it("DND-49: 'Não somar' segue o dano sem os dados extras e não gasta o furtivo", async () => {
        const { id, kael, dagger } = await rogueScene()
        await actions.submitCombatAction(id, { economy: "action", optionId: dagger.id, targets: ["npc:gob"] }, kael.userId)
        const message = await actionOf(id)
        dice.players.set(kael.userId, [[15], [3]])
        await actions.rollCombatAction(id, String(message._id), kael.userId)
        await actions.chooseSneakAttack(id, String(message._id), false, kael.userId)
        const after = await actionOf(id)
        expect(after.combatAction!.steps[1]).toMatchObject({ kind: "sneak-choice", status: "done", success: false })
        expect(after.combatAction!.steps[2]).toMatchObject({ kind: "damage", dice: "1d4+3" })
        await actions.rollCombatAction(id, String(message._id), kael.userId)
        expect((await stateOf(id, kael.actorKey)).economy.sneakAttackUsed).toBeFalsy()
        // Só o dono da ação responde.
        await expect(actions.chooseSneakAttack(id, String(message._id), true, kael.userId)).rejects.toMatchObject({ code: "SNEAK_CHOICE_UNAVAILABLE" })
    })

    it("o ataque que erra não pergunta nem gasta o ataque furtivo", async () => {
        const { id, kael, dagger } = await rogueScene()
        await actions.submitCombatAction(id, { economy: "action", optionId: dagger.id, targets: ["npc:gob"] }, kael.userId)
        const message = await actionOf(id)
        dice.players.set(kael.userId, [[2]])
        await actions.rollCombatAction(id, String(message._id), kael.userId)
        expect((await actionOf(id)).combatAction!.steps.map((step) => [step.kind, step.status])).toEqual([["attack", "done"], ["damage", "skipped"]])
        expect(combatPrepAi.sneak).not.toHaveBeenCalled()
        expect((await stateOf(id, kael.actorKey)).economy.sneakAttackUsed).toBeFalsy()
    })

    it("com desvantagem não pergunta (sem IA); sem vantagem, o Maddox confere o aliado e pode negar", async () => {
        const { id, kael, dagger } = await rogueScene()
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.characters.$[me].conditions": [{ key: "poisoned", untilRound: null, source: "veneno" }] } }, { arrayFilters: [{ "me.actorKey": kael.actorKey }] })
        await actions.submitCombatAction(id, { economy: "action", optionId: dagger.id, targets: ["npc:gob"] }, kael.userId)
        dice.players.set(kael.userId, [[18, 17]])
        await actions.rollCombatAction(id, String((await actionOf(id))._id), kael.userId)
        expect(combatPrepAi.sneak).not.toHaveBeenCalled()
        expect((await actionOf(id)).combatAction!.steps.map((step) => step.kind)).toEqual(["attack", "damage"])
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.characters.$[me].conditions": [], "tactical.characters.$[me].economy.action": true } }, { arrayFilters: [{ "me.actorKey": kael.actorKey }] })
        await MaddoxCampaignMessageModel.updateMany({ campaignId: id, kind: "combat-action" }, { $set: { "combatAction.status": "resolved" } })
        combatPrepAi.sneak.mockResolvedValueOnce({ ok: false, reason: "Lyra está longe do goblin." })
        await actions.submitCombatAction(id, { economy: "action", optionId: dagger.id, targets: ["npc:gob"] }, kael.userId)
        dice.players.set(kael.userId, [[15]])
        await actions.rollCombatAction(id, String((await actionOf(id))._id), kael.userId)
        expect(combatPrepAi.sneak.mock.calls[0]![0]).toMatchObject({ targetName: "Goblin", allies: ["Lyra"] })
        expect((await actionOf(id)).combatAction!.steps.map((step) => step.kind)).toEqual(["attack", "damage"])
    })

    it("o alvo caído dá vantagem corpo a corpo: pergunta sem consultar a IA, com o motivo gravado no passo", async () => {
        const { id, kael, dagger } = await rogueScene()
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "combatants.0.tactical.conditions": [{ key: "prone", untilRound: null, source: "queda" }] } })
        await actions.submitCombatAction(id, { economy: "action", optionId: dagger.id, targets: ["npc:gob"] }, kael.userId)
        expect((await actionOf(id)).combatAction!.steps[0]).toMatchObject({ mode: "advantage", modeReasons: ["alvo caído"] })
        dice.players.set(kael.userId, [[15, 3]])
        await actions.rollCombatAction(id, String((await actionOf(id))._id), kael.userId)
        expect(combatPrepAi.sneak).not.toHaveBeenCalled()
        expect((await actionOf(id)).combatAction!.steps.map((step) => step.kind)).toEqual(["attack", "sneak-choice", "damage"])
    })
})

describe("DND-49 — maestrias de arma e Esconder-se", () => {
    const MASTERY_NAMES = { nick: "Ágil / Nick", vex: "Afligir / Vex", sap: "Drenar / Sap", topple: "Derrubar / Topple", graze: "Garantido / Graze", push: "Empurrar / Push", slow: "Lentidão / Slow", cleave: "Trespassar / Cleave" } as const
    const actionOf = async (id: string) => (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action" }).sort({ _id: -1 }).lean())!
    const resetAction = (id: string, actorKey: string) => MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.characters.$[me].economy": { ...freshEconomy() } } }, { arrayFilters: [{ "me.actorKey": actorKey }] })

    /** Kael com Adagas (Acuidade, Leve) cuja maestria do catálogo é `key`, registrada em `weaponMasteries` (ou não). */
    async function masteryScene(key: keyof typeof MASTERY_NAMES, options: { quantity?: number; mastered?: boolean; dexterity?: number } = {}) {
        await ItemModel.collection.insertOne({ name: "Adaga", type: "arma", status: "active", damageDice: { quantidade: 1, tipo: "d4" }, damageType: "perfurante", properties: [mention("Acuidade / Finesse"), mention("Leve")], mastery: `<span data-type="mention" data-id="r-${key}" data-entity-type="Regra" class="mention">Maestria: ${MASTERY_NAMES[key]}</span>` })
        const built = await scene()
        const dagger = await ItemModel.collection.findOne({ name: "Adaga" })
        await CharacterItem.collection.updateOne({ sheetId: new mongoose.Types.ObjectId(built.kael.sheetId) }, { $set: { catalogItemId: dagger!._id, name: "<p>Adaga</p>", quantity: options.quantity ?? 2 } })
        await CharacterSheet.collection.updateOne({ _id: new mongoose.Types.ObjectId(built.kael.sheetId) }, { $set: { dexterity: options.dexterity ?? 17, strength: 10, weaponMasteries: options.mastered === false ? [] : [{ catalogItemId: dagger!._id, mastery: key }] } })
        await readyPrep(built.id, built.combatId, built.kael)
        const optionsNow = (await game.getGameState(built.id, built.kael.userId)).me.combat!.options!
        return { ...built, dagger: optionsNow.action.find((option) => option.id.startsWith("weapon:") && !option.id.endsWith(":thrown"))! }
    }

    const attack = async (id: string, userId: string, optionId: string, rolls: number[][], economy: "action" | "bonus" = "action") => {
        await actions.submitCombatAction(id, { economy, optionId, targets: ["npc:gob"] }, userId)
        dice.players.set(userId, rolls)
        const message = await actionOf(id)
        await actions.rollCombatAction(id, String(message._id), userId)
        if ((await actionOf(id)).combatAction!.steps.some((step) => step.status === "pending")) await actions.rollCombatAction(id, String(message._id), userId)
        return actionOf(id)
    }

    it("Ágil (Nick) com 2 adagas: depois do 1º ataque (mesmo errando), o ataque Leve entra na mesma Ação, sem gastar a Ação bônus, uma vez por turno", async () => {
        const { id, kael, dagger } = await masteryScene("nick")
        expect(dagger.attack).toMatchObject({ mastery: "nick", modifier: 3 })
        await attack(id, kael.userId, dagger.id, [[2]])
        let state = (await game.getGameState(id, kael.userId)).me.combat!
        const nick = state.options!.action.find((option) => option.id.startsWith("offhand:"))!
        expect(nick).toMatchObject({ economy: "action", label: "Adaga (outra mão · Maestria Ágil)" })
        expect(state.options!.bonus.some((option) => option.id.startsWith("offhand:"))).toBe(false)
        await actions.submitCombatAction(id, { economy: "action", optionId: nick.id, targets: ["npc:gob"] }, kael.userId)
        expect((await stateOf(id, kael.actorKey)).economy).toMatchObject({ bonus: true, lightExtraUsed: true })
        dice.players.set(kael.userId, [[2]])
        await actions.rollCombatAction(id, String((await actionOf(id))._id), kael.userId)
        state = (await game.getGameState(id, kael.userId)).me.combat!
        expect([...state.options!.action, ...state.options!.bonus].some((option) => option.id.startsWith("offhand:"))).toBe(false)
    })

    it("uma só adaga (quantidade 1): sem Nick e sem ataque Leve extra; sem a maestria registrada, o ataque extra fica na Ação bônus", async () => {
        const single = await masteryScene("nick", { quantity: 1 })
        await attack(single.id, single.kael.userId, single.dagger.id, [[2]])
        const options = (await game.getGameState(single.id, single.kael.userId)).me.combat!.options!
        expect([...options.action, ...options.bonus].some((option) => option.id.startsWith("offhand:"))).toBe(false)
    })

    it("sem a maestria na ficha, a arma não tem maestria e o ataque extra da arma Leve gasta a Ação bônus", async () => {
        const { id, kael, dagger } = await masteryScene("nick", { mastered: false })
        expect(dagger.attack!.mastery).toBeNull()
        await attack(id, kael.userId, dagger.id, [[2]])
        const options = (await game.getGameState(id, kael.userId)).me.combat!.options!
        expect(options.action.some((option) => option.id.startsWith("offhand:"))).toBe(false)
        expect(options.bonus.find((option) => option.id.startsWith("offhand:"))!.label).toBe("Adaga (outra mão)")
    })

    it("Afligir (Vex): acerto com dano dá vantagem no próximo ataque contra o mesmo alvo, com o motivo; o uso gasta a vantagem", async () => {
        const { id, kael, dagger } = await masteryScene("vex")
        await attack(id, kael.userId, dagger.id, [[15], [1]])
        expect((await stateOf(id, kael.actorKey)).flags.vex).toMatchObject({ targetKey: "npc:gob" })
        await resetAction(id, kael.actorKey)
        await actions.submitCombatAction(id, { economy: "action", optionId: dagger.id, targets: ["npc:gob"] }, kael.userId)
        expect((await actionOf(id)).combatAction!.steps[0]).toMatchObject({ mode: "advantage", modeReasons: ["Maestria Afligir"] })
        dice.players.set(kael.userId, [[2, 1]])
        await actions.rollCombatAction(id, String((await actionOf(id))._id), kael.userId)
        expect((await stateOf(id, kael.actorKey)).flags.vex ?? null).toBeNull()
    })

    it("Drenar (Sap): o acerto marca o alvo, que tem desvantagem na próxima jogada de ataque", async () => {
        const { id, kael, dagger } = await masteryScene("sap")
        const done = await attack(id, kael.userId, dagger.id, [[15], [1]])
        expect((await goblinOf(id)).flags.sapped).toMatchObject({ byKey: kael.actorKey, byName: "Kael" })
        expect(done.combatAction!.summary).toContain("Maestria Drenar")
    })

    it("Derrubar (Topple): salvaguarda de Constituição com CD 8 + modificador + proficiência; falha = Caído; contra quem já está Caído, nada", async () => {
        const { id, kael, dagger } = await masteryScene("topple")
        dice.server.push([3])
        const done = await attack(id, kael.userId, dagger.id, [[15], [1]])
        expect(done.combatAction!.steps.find((step) => step.kind === "save")).toMatchObject({ roller: "server", success: false, note: "Maestria Derrubar · Constituição CD 13" })
        expect((await goblinOf(id)).conditions.map((condition) => condition.key)).toContain("prone")
        await resetAction(id, kael.actorKey)
        const again = await attack(id, kael.userId, dagger.id, [[15, 2], [1]])
        expect(again.combatAction!.steps.some((step) => step.kind === "save")).toBe(false)
    })

    it("Garantido (Graze): no erro, dano igual ao modificador usado; com modificador ≤ 0, nada", async () => {
        const { id, kael, dagger } = await masteryScene("graze")
        const done = await attack(id, kael.userId, dagger.id, [[2]])
        expect(done.combatAction!.steps[1]).toMatchObject({ kind: "damage", status: "done", total: 3, amount: 3, note: expect.stringContaining("Maestria Garantido") })
        expect((await goblinOf(id)).stats.hp).toBe(4)
    })

    it("Garantido com modificador 0: o erro não causa dano", async () => {
        const { id, kael, dagger } = await masteryScene("graze", { dexterity: 10 })
        const done = await attack(id, kael.userId, dagger.id, [[2]])
        expect(done.combatAction!.steps[1]).toMatchObject({ kind: "damage", status: "skipped" })
    })

    it("Empurrar fica registrado no resumo para o Maddox narrar", async () => {
        const push = await masteryScene("push")
        expect((await attack(push.id, push.kael.userId, push.dagger.id, [[15], [1]])).combatAction!.summary).toContain("Maestria Empurrar: Goblin pode ser empurrado até 3 m")
    })

    it("Lentidão fica registrada no alvo e no resumo (não acumula)", async () => {
        const slow = await masteryScene("slow")
        expect((await attack(slow.id, slow.kael.userId, slow.dagger.id, [[15], [1]])).combatAction!.summary).toContain("Maestria Lentidão")
        expect((await goblinOf(slow.id)).flags.slowed).toMatchObject({ byKey: slow.kael.actorKey })
        await resetAction(slow.id, slow.kael.actorKey)
        expect((await attack(slow.id, slow.kael.userId, slow.dagger.id, [[15], [1]])).combatAction!.summary).not.toContain("Maestria Lentidão")
    })

    it("Trespassar (Cleave): o acerto corpo a corpo libera o 2º ataque contra OUTRO inimigo, uma vez por turno", async () => {
        const { id, kael, dagger } = await masteryScene("cleave")
        await attack(id, kael.userId, dagger.id, [[15], [1]])
        expect((await stateOf(id, kael.actorKey)).economy.cleave).toMatchObject({ targetKey: "npc:gob" })
        const cleave = (await game.getGameState(id, kael.userId)).me.combat!.options!.action.find((option) => option.id.startsWith("cleave:"))!
        expect(cleave).toMatchObject({ label: "Adaga (Maestria Trespassar)", attack: { damage: "1d4" } })
        await expect(actions.submitCombatAction(id, { economy: "action", optionId: cleave.id, targets: ["npc:gob"] }, kael.userId)).rejects.toMatchObject({ code: "CLEAVE_SAME_TARGET" })
    })

    it("Esconder-se: o ataque escondido tem vantagem com o motivo gravado no passo e a condição Invisível sai depois do ataque", async () => {
        const { id, kael, dagger } = await masteryScene("push", { mastered: false })
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.characters.$[me].conditions": [{ key: "invisible", untilRound: null, source: "Esconder" }] } }, { arrayFilters: [{ "me.actorKey": kael.actorKey }] })
        await actions.submitCombatAction(id, { economy: "action", optionId: dagger.id, targets: ["npc:gob"] }, kael.userId)
        expect((await actionOf(id)).combatAction!.steps[0]).toMatchObject({ mode: "advantage", modeReasons: ["atacante invisível"] })
        dice.players.set(kael.userId, [[15, 3]])
        await actions.rollCombatAction(id, String((await actionOf(id))._id), kael.userId)
        const step = (await actionOf(id)).combatAction!.steps[0]!
        expect(step).toMatchObject({ mode: "advantage", modeReasons: ["atacante invisível"] })
        expect(step.roll!.selectedD20).toMatchObject({ kept: 15, discarded: 3 })
        // DND-47: o ataque leva as parcelas nomeadas (atributo e proficiência) somando exatamente o modificador.
        expect(step.modifierParts!.map((part) => part.label)).toEqual([expect.stringMatching(/^(Força|Destreza)$/), "Proficiência"])
        expect(step.roll!.modifierParts!.reduce((sum, part) => sum + part.value, 0)).toBe(step.roll!.modifier)
        expect((await stateOf(id, kael.actorKey)).conditions).toEqual([])
    })

    it("Esconder-se: Invisível de outra origem (magia) não sai com o ataque", async () => {
        const { id, kael, dagger } = await masteryScene("push", { mastered: false })
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.characters.$[me].conditions": [{ key: "invisible", untilRound: null, source: "Invisibilidade" }] } }, { arrayFilters: [{ "me.actorKey": kael.actorKey }] })
        await attack(id, kael.userId, dagger.id, [[2, 1]])
        expect((await stateOf(id, kael.actorKey)).conditions.map((condition) => condition.source)).toEqual(["Invisibilidade"])
    })
})

describe("DND-49 — PV fora do combate (ferramenta do narrador)", () => {
    const tool = async () => (await import("@/features/maddox/server/master-tools")).findMaddoxTool("update_character_hit_points")!
    const run = async (id: string, input: Record<string, unknown>) => (await import("@/features/maddox/server/master-tools")).runMaddoxTool(await tool(), { campaignId: new mongoose.Types.ObjectId(id), turnNumber: 2 }, input)
    const sheetOf = async (sheetId: string) => (await CharacterSheet.findById(sheetId).lean<{ hpCurrent: number; deathSavesSuccess: number; deathSavesFailure: number }>())!

    it("cura na ficha (limitada ao máximo), zera os testes contra a morte, audita e põe 'PV de X: 0 → N (motivo)' na mesa", async () => {
        const { id, kael } = await scene({ kaelHp: 0 })
        await MaddoxCombatModel.deleteMany({ campaignId: id })
        await CharacterSheet.collection.updateOne({ _id: new mongoose.Types.ObjectId(kael.sheetId) }, { $set: { deathSavesFailure: 2 } })
        const result = await run(id, { personagem: "kael", operacao: "curar", valor: 50, motivo: "Lyra fez os primeiros socorros e deu a poção" })
        expect(result).toMatchObject({ saved: true, personagem: "Kael", pv: "20/20", antes: 0 })
        expect(await sheetOf(kael.sheetId)).toMatchObject({ hpCurrent: 20, deathSavesFailure: 0 })
        const line = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "hit-points" }).lean())!
        expect(line.content).toBe("PV de Kael: 0 → 20 (Lyra fez os primeiros socorros e deu a poção)")
        expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FichaPersonagem", entidadeId: kael.sheetId, depois: expect.objectContaining({ origin: "narrator-hit-points", operation: "curar", hpCurrent: 20 }) }))
        const view = await game.getGameState(id, kael.userId)
        expect(view.messages.find((message) => message.kind === "hit-points")!.content).toBe(line.content)
    })

    it("estabilizar e acordar com 1 PV; o descanso não é mais operação de PV (DND-58)", async () => {
        const { id, kael } = await scene({ kaelHp: 0 })
        await MaddoxCombatModel.deleteMany({ campaignId: id })
        await run(id, { personagem: "Kael", operacao: "estabilizar", motivo: "Atadura" })
        expect(await sheetOf(kael.sheetId)).toMatchObject({ hpCurrent: 0, deathSavesSuccess: 3 })
        await run(id, { personagem: "Kael", operacao: "acordar", motivo: "Acordou depois de uma hora" })
        expect((await sheetOf(kael.sheetId)).hpCurrent).toBe(1)
        await expect(run(id, { personagem: "Kael", operacao: "descanso-longo", motivo: "Noite na estalagem" })).rejects.toThrow("Entrada inválida")
        expect((await sheetOf(kael.sheetId)).hpCurrent).toBe(1)
    })

    it("recusada no combate tático ativo (usar apply_effect), sem motivo, em campanha narrativa e para personagem morto", async () => {
        const { id, kael } = await scene({ kaelHp: 0 })
        await expect(run(id, { personagem: "Kael", operacao: "curar", valor: 3, motivo: "x" })).rejects.toThrow("combate tático em andamento")
        await MaddoxCombatModel.deleteMany({ campaignId: id })
        await expect(run(id, { personagem: "Kael", operacao: "curar", valor: 3, motivo: "" })).rejects.toThrow("Entrada inválida")
        await MaddoxCharacterModel.updateOne({ _id: kael.characterId }, { $set: { status: "dead" } })
        await expect(run(id, { personagem: "Kael", operacao: "curar", valor: 3, motivo: "milagre" })).rejects.toThrow("está morto")
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { rigor: "narrativo" } })
        await expect(run(id, { personagem: "Kael", operacao: "curar", valor: 3, motivo: "x" })).rejects.toThrow("campanha é narrativa")
        expect((await sheetOf(kael.sheetId)).hpCurrent).toBe(0)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "hit-points" })).toBe(0)
    })
})

describe("DND-49 — checagem de quem está a 0 PV ao abrir o combate (decisão do dono D3: no job da preparação)", () => {
    const downAt = (hp: number) => async ({ id: campaignId }: { id: string }) => {
        const character = (await MaddoxCharacterModel.findOne({ campaignId, name: "Kael" }).lean())!
        await CharacterSheet.collection.updateOne({ _id: character.sheetId! }, { $set: { hpCurrent: hp } })
        await MaddoxCharacterModel.updateOne({ _id: character._id }, { $set: { currentState: "Acordou na caverna e cortou a corda." } })
    }

    it("a história mostra o personagem ativo: o Maddox aplica a recuperação pela regra antes da iniciativa, com a linha na mesa", async () => {
        combatPrepAi.downed.mockResolvedValue({ decisao: "aplicar", operacao: "curar", valor: 1, motivo: "Acordou na caverna e cortou a corda" })
        const { id, kael } = await initiativeScene(null, { beforeCombat: downAt(0) })
        expect(combatPrepAi.downed).toHaveBeenCalledTimes(1)
        expect(combatPrepAi.downed.mock.calls[0]![0]).toMatchObject({ characterName: "Kael", currentState: "Acordou na caverna e cortou a corda." })
        expect((await CharacterSheet.findById(kael.sheetId).lean<{ hpCurrent: number }>())!.hpCurrent).toBe(1)
        expect((await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "hit-points" }).lean())!.content).toBe("PV de Kael: 0 → 1 (Acordou na caverna e cortou a corda)")
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.characters.find((state) => state.name === "Kael")!.hpZero).toBe(false)
    })

    it("o Maddox confirma que segue caído: nada muda na ficha e a mesa vê o motivo", async () => {
        const { id, kael } = await initiativeScene(null, { beforeCombat: downAt(0) })
        expect((await CharacterSheet.findById(kael.sheetId).lean<{ hpCurrent: number }>())!.hpCurrent).toBe(0)
        expect((await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "hit-points" }).lean())!.content).toBe("Kael segue caído com 0 PV (Segue caído.)")
    })

    it("ninguém a 0 PV: não chama a IA; falha da checagem: o combate abre sem mudança e a preparação fica pronta", async () => {
        await initiativeScene()
        expect(combatPrepAi.downed).not.toHaveBeenCalled()
        await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})))
        combatPrepAi.downed.mockRejectedValue(new Error("fora do ar"))
        const { id, kael } = await initiativeScene(null, { beforeCombat: downAt(0) })
        expect((await CharacterSheet.findById(kael.sheetId).lean<{ hpCurrent: number }>())!.hpCurrent).toBe(0)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "hit-points" })).toBe(0)
        expect((await MaddoxCombatPrepModel.find({ campaignId: id }).lean()).map((prep) => prep.status)).toEqual(["ready", "ready"])
    })
})

describe("DND-49 — maestrias na consolidação da entrevista", () => {
    it("classe com 'Maestria em Arma' até o nível: as armas do equipamento com maestria no catálogo, no limite do texto da característica", async () => {
        const { Trait } = await import("@/features/traits/database/trait")
        const { initialWeaponMasteries } = await import("@/features/maddox/server/sheet-builder")
        const traitId = new mongoose.Types.ObjectId()
        await Trait.collection.insertOne({ _id: traitId, name: "Maestria em Arma (Ladino)", status: "active", description: "<p>Use as propriedades de maestria de <b>dois</b> tipos de armas com as quais você tem Proficiência.</p>" })
        const mention = (cid: mongoose.Types.ObjectId, label: string) => `<span data-type="mention" data-id="${cid}" data-entity-type="Habilidade" class="mention">${label}</span>`
        const cls = { _id: new mongoose.Types.ObjectId(), name: "Ladino", traits: [{ level: 1, description: mention(traitId, "Maestria em Arma (Ladino)") }] }
        const weapon = (name: string, mastery: string | null) => ({ _id: new mongoose.Types.ObjectId(), name, type: "arma", ...(mastery ? { mastery: `<span data-type="mention" data-id="r" data-entity-type="Regra" class="mention">Maestria: ${mastery}</span>` } : {}) })
        const adaga = weapon("Adaga", "Ágil / Nick")
        const items = [adaga, adaga, weapon("Clava", null), weapon("Arco Curto", "Afligir / Vex"), weapon("Rapieira", "Afligir / Vex")]
        const chosen = await initialWeaponMasteries({ cls: cls as never, subclass: null } as never, 1, items as never)
        expect(chosen.map((entry) => [String(entry.catalogItemId), entry.mastery])).toEqual([
            [String(adaga._id), "nick"],
            [String(items[3]!._id), "vex"],
        ])
        // Classe sem a característica: nada é inventado.
        expect(await initialWeaponMasteries({ cls: { ...cls, traits: [] } as never, subclass: null } as never, 1, items as never)).toEqual([])
    })
})

describe("DND-49 — Referências do catálogo e catálogo lido na preparação", () => {
    it("a ficha lista tipo + id + nome do que cita (sem o texto das regras); o que não está no catálogo, ou está inativo, sai como sem correspondência", async () => {
        const { id, kael } = await scene()
        const { CharacterClass } = await import("@/features/classes/models/character-class")
        const ladino = new mongoose.Types.ObjectId()
        const inativa = new mongoose.Types.ObjectId()
        await CharacterClass.collection.insertMany([
            { _id: ladino, name: "Ladino", status: "active", description: "Regra secreta do Ladino que não pode ir ao prompt." },
            { _id: inativa, name: "Classe Velha", status: "inactive" },
        ])
        const span = (cid: mongoose.Types.ObjectId, label: string, type = "Classe") => `<span data-type="mention" data-id="${cid}" data-entity-type="${type}" class="mention">${label}</span>`
        await CharacterSheet.collection.updateOne({ _id: new mongoose.Types.ObjectId(kael.sheetId) }, { $set: { class: `<p>${span(ladino, "Ladino")}</p>`, featuresNotes: `<p>${span(inativa, "Classe Velha")} ${span(new mongoose.Types.ObjectId(), "Talento Sumido", "Talento")}</p>` } })
        await CharacterItem.collection.insertOne({ sheetId: new mongoose.Types.ObjectId(kael.sheetId), catalogItemId: null, name: "<p>Faca de Osso</p>", quantity: 1, equipped: false, notes: "" })
        const state = await stateOf(id, kael.actorKey)
        const context = (await combatPrep.loadPrepSheet(state, new mongoose.Types.ObjectId(id)))!
        const section = context.sheetText.split("## Referências do catálogo")[1]!.split("\n## ")[0]!
        expect(section).toContain(`- Classe:${ladino} — Ladino`)
        expect(section).toContain('- Classe "Classe Velha" — sem correspondência no catálogo')
        expect(section).toContain('- Talento "Talento Sumido" — sem correspondência no catálogo')
        expect(section).toContain('- Item "Faca de Osso" — sem correspondência no catálogo')
        expect(section).toMatch(/- Item:[a-f0-9]{24} — Espada/)
        expect(context.sheetText).not.toContain("Regra secreta do Ladino")
    })

    it("a preparação grava as refs lidas e quantas alterações foram descartadas sem fonte; o card mostra a recusada", async () => {
        combatPrepAi.review.mockImplementation(async (input) => {
            if (input.characterName !== "Kael") return { sheetChanges: [] }
            readCatalog(input, "Item", "espada", { name: "Espada", description: "Dano 1d8 cortante." })
            return { sheetChanges: [{ type: "ability", attribute: "strength", value: 18, reason: "Inventado." }] }
        })
        const { id } = await initiativeScene()
        const prep = (await MaddoxCombatPrepModel.findOne({ campaignId: id, characterName: "Kael" }).lean())!
        expect(prep).toMatchObject({ status: "ready", catalogRefs: ["Item:espada"], droppedWithoutSource: 1 })
        expect(prep.changes).toEqual([expect.objectContaining({ label: "Força", applied: false, refused: "Não confirmada no catálogo do DnDicas: sem a fonte do catálogo." })])
    })

    it("DND-49 (F1): recusa sem consultar o catálogo não vale — nova tentativa exigindo a consulta; recusando de novo sem ler, o pedido fica não examinado", async () => {
        const { id, kael, combatId } = await scene()
        await readyPrep(id, combatId, kael)
        combatPrepAi.adjust.mockImplementation(async () => ({ decision: "refuse", reason: "De memória: não existe." }))
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "pela regra do catálogo meu soco é 1d4" }, kael.userId)
        await combatPrep.waitForCombatPreps()
        expect(combatPrepAi.adjust).toHaveBeenCalledTimes(2)
        expect((combatPrepAi.adjust.mock.calls[1]![0] as { mustConsult?: boolean }).mustConsult).toBe(true)
        const mine = (await game.getGameState(id, kael.userId)).me.combat!.adjustments!.at(-1)!
        // Kael é o dono da campanha: vê a mensagem genérica com o motivo técnico.
        expect(mine.status).toBe("error")
        expect(mine.reason).toContain("O Maddox não conseguiu examinar o pedido agora. Tente de novo.")
        expect(mine.reason).toContain("sem consultar o catálogo")
        expect((await MaddoxCombatPrepModel.findOne({ combatId }).lean())!.adjustments.at(-1)!.error).toContain("sem consultar o catálogo")
    })

    it("DND-49 (F1): na nova tentativa o Maddox consulta e a recusa passa a valer, com o motivo", async () => {
        const { id, kael, combatId } = await scene()
        await readyPrep(id, combatId, kael)
        combatPrepAi.adjust.mockImplementationOnce(async () => ({ decision: "refuse", reason: "De memória." })).mockImplementationOnce(async (input) => (readRule(input), { decision: "refuse", reason: "A regra do catálogo não dá isso." }))
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "soco 2d10" }, kael.userId)
        await combatPrep.waitForCombatPreps()
        expect((await game.getGameState(id, kael.userId)).me.combat!.adjustments!.at(-1)).toMatchObject({ status: "refused", reason: "A regra do catálogo não dá isso." })
        expect((await MaddoxCombatPrepModel.findOne({ combatId }).lean())!.adjustments.at(-1)).toMatchObject({ catalogRefs: ["Regra:r1"] })
    })

    it("DND-49 (F5): buscou a regra, não achou e recusou: vale a recusa com o motivo, sem nova geração", async () => {
        const { id, kael, combatId } = await scene()
        await readyPrep(id, combatId, kael)
        const { recordCatalogToolResult } = await import("@/features/maddox/server/catalog-reads")
        combatPrepAi.adjust.mockImplementation(async (input) => {
            recordCatalogToolResult(input.reads!, { itens: [], total: 0 })
            return { decision: "refuse", reason: "Essa regra não está no catálogo do DnDicas." }
        })
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "pela regra do soco atordoante, 2d10" }, kael.userId)
        await combatPrep.waitForCombatPreps()
        expect(combatPrepAi.adjust).toHaveBeenCalledTimes(1)
        expect((await game.getGameState(id, kael.userId)).me.combat!.adjustments!.at(-1)).toMatchObject({ status: "refused", reason: "Essa regra não está no catálogo do DnDicas." })
    })

    it("pedido de ajuste citando regra que não existe no catálogo é recusado com o motivo; a opção continua igual", async () => {
        const { id, kael, combatId } = await scene()
        await readyPrep(id, combatId, kael)
        combatPrepAi.adjust.mockImplementation(async () => ({ decision: "accept", reason: "Você tem razão.", modify: [{ optionId: "unarmed", attack: { bonus: 9, damage: "2d10" }, reason: "Regra de outra edição." }], sheetChanges: [{ type: "ability", attribute: "strength", value: 20, reason: "x" }] }))
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "meu soco dá 2d10" }, kael.userId)
        await combatPrep.waitForCombatPreps()
        const last = (await game.getGameState(id, kael.userId)).me.combat!.adjustments!.at(-1)!
        expect(last).toMatchObject({ status: "refused" })
        expect(last.reason).toContain("Não confirmada no catálogo do DnDicas")
        const prep = (await MaddoxCombatPrepModel.findOne({ combatId }).lean())!
        expect(prep.adjustments.at(-1)).toMatchObject({ droppedWithoutSource: 1 })
        expect((await CharacterSheet.findById(kael.sheetId).lean<{ strength: number }>())!.strength).toBe(14)
    })
})

describe("DND-41 — revisão (rodada 1 do revisor)", () => {
    it("Personagem Opex é preparado e o card dele vai ao dono da campanha; ele não pede ajuste", async () => {
        let kaelId = ""
        const { id, kael, lyra } = await initiativeScene(null, {
            beforeCombat: async ({ id: campaignId, lyra: target }) => {
                const ownerId = (await MaddoxCampaignModel.findById(campaignId).lean())!.ownerId
                kaelId = ownerId
                await makeLyraOpex(campaignId, target, ownerId)
            },
        })
        await waitForOpexIdle()
        const opexUserId = opexUserIdFor(new mongoose.Types.ObjectId(lyra.memberId))
        const prep = (await prepsOf(id)).find((item) => item.characterName === "Lyra")!
        expect([prep.status, prep.userId]).toEqual(["ready", opexUserId])
        expect(combatPrepAi.review.mock.calls.map(([input]) => input.characterName).sort()).toEqual(["Kael", "Lyra"])
        const cards = (await game.getGameState(id, kaelId)).messages.filter((message) => message.kind === "combat-prep").map((message) => message.combatPrep!.characterName)
        expect(cards.sort()).toEqual(["Kael", "Lyra"])
        expect(kael.userId).toBe(kaelId)
        // Na vez do Opex, o pedido de ajuste é recusado.
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.phase": "running", "tactical.order": [{ actorKey: lyra.actorKey, kind: "character", name: "Lyra", total: 15, d20: 14, modifier: 1, dexterity: 12, joinIndex: 0, groupKey: lyra.actorKey }], "tactical.activeIndex": 0 } })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "players", "turn.awaitingChecks": false, "turn.combatActor": { combatId: prep.combatId, actorKey: lyra.actorKey, memberId: new mongoose.Types.ObjectId(lyra.memberId), offlineSince: null }, "turn.eligibleMemberIds": [new mongoose.Types.ObjectId(lyra.memberId)] } })
        await expect(adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "acho que está errado" }, opexUserId)).rejects.toMatchObject({ code: "OPEX_NOT_ALLOWED" })
        await waitForOpexIdle()
    })

    it("quem sai durante a preparação: a preparação dele é descartada e a ordem fecha com as demais prontas", async () => {
        combatPrepAi.review.mockImplementation(async (input) => {
            if (input.characterName === "Lyra") throw new Error("fora do ar")
            return { sheetChanges: [], modify: [], remove: [], add: [] }
        })
        const { id, kael, lyra, cardOf } = await initiativeScene()
        await rollInitiatives(id, { kael, lyra }, cardOf)
        await settleCampaign(id)
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("initiative")
        await actions.onMemberLeftCombat(new mongoose.Types.ObjectId(id), new mongoose.Types.ObjectId(lyra.memberId))
        await settleCampaign(id)
        expect((await prepsOf(id)).find((prep) => prep.characterName === "Lyra")!.status).toBe("discarded")
        expect((await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.phase).toBe("running")
    })

    it("característica longa (ou com menções) não é reescrita: a correção é acrescentada e a auditoria guarda o texto completo", async () => {
        const long = `<p>${"Texto da característica. ".repeat(80)}</p><p><span data-type="mention" class="mention">Regra: Vantagem</span></p>`
        let traitId = ""
        combatPrepAi.review.mockImplementation(async (input) => {
            if (input.characterName !== "Kael") return { sheetChanges: [], modify: [], remove: [], add: [] }
            traitId = /\[id="([a-f0-9]{24})"\] Ataque Furtivo/.exec(input.sheetText)![1]!
            readRule(input)
            return { sheetChanges: [{ type: "trait-upsert", id: traitId, name: "Ataque Furtivo", description: "Uma vez por turno, +1d6.", reason: "Faltava o dano.", source: RULE }] }
        })
        const { kael } = await initiativeScene(null, {
            beforeCombat: async ({ id: campaignId }) => {
                const sheetId = (await MaddoxCharacterModel.findOne({ campaignId, name: "Kael" }).lean())!.sheetId!
                await CharacterTrait.collection.insertOne({ sheetId, catalogTraitId: null, name: "Ataque Furtivo", description: long, origin: "class" })
            },
        })
        const trait = (await CharacterTrait.findById(traitId).lean<{ description: string }>())!
        expect(trait.description.startsWith(long)).toBe(true)
        expect(trait.description.endsWith("<p>Uma vez por turno, +1d6.</p>")).toBe(true)
        const audit = vi.mocked(recordAudit).mock.calls.map(([input]) => input).find((input) => input.entidade === "FichaPersonagem" && input.entidadeId === kael.sheetId)!
        expect(audit.antes).toEqual({ "Característica Ataque Furtivo": { name: "Ataque Furtivo", description: long } })
    })

    it("ajuste aceito sem nenhuma mudança aplicável vira falha (mensagem genérica), não 'aceito'", async () => {
        const { id, kael, combatId } = await scene()
        await readyPrep(id, combatId, kael)
        combatPrepAi.adjust.mockImplementation(async () => ({ decision: "accept", reason: "Você tem razão.", modify: [{ optionId: "weapon:nao-existe", attack: { bonus: 6, damage: "1d8+3" }, reason: "x" }] }))
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "acho que está errado" }, kael.userId)
        await combatPrep.waitForCombatPreps()
        expect((await game.getGameState(id, kael.userId)).me.combat!.adjustments!.at(-1)).toMatchObject({ status: "error" })
        expect((await MaddoxCombatPrepModel.findOne({ campaignId: id }).lean())!.overlay.modify).toEqual([])
    })

    it("a auditoria do ajuste fica no nome de quem pediu (requestedBy), não do dono da campanha", async () => {
        const { id, lyra, combatId } = await scene()
        await readyPrep(id, combatId, lyra, { characterName: "Lyra" })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.combatActor.actorKey": lyra.actorKey, "turn.combatActor.memberId": new mongoose.Types.ObjectId(lyra.memberId), "turn.eligibleMemberIds": [new mongoose.Types.ObjectId(lyra.memberId)] } })
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.activeIndex": 2 } })
        combatPrepAi.adjust.mockImplementation(async (input) => (readRule(input), { decision: "accept", reason: "Corrigido.", sheetChanges: [{ type: "ability", attribute: "dexterity", value: 15, reason: "Valor da entrevista.", source: RULE }] }))
        await adjustments.requestCombatAdjustment(id, { economy: "action", optionId: "unarmed", text: "minha destreza é 15" }, lyra.userId)
        await combatPrep.waitForCombatPreps()
        expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ userId: lyra.userId, entidade: "FichaPersonagem", entidadeId: lyra.sheetId, depois: expect.objectContaining({ requestedBy: lyra.userId, origin: "combat-adjust" }) }))
    })
})

/** Aliado NPC na ordem, depois da Lyra (DND-53). */
async function addAlly(id: string) {
    const ally = tactical.combatantState("npc:guard", "guarda", monsterStatsFromCustom({ ca: 14, pv: 11, acoes: [{ nome: "Lança", tipo: "ataque", bonus: 3, dano: "1d6+1", tipoDano: "perfurante" }] }))
    Object.assign(ally, { stats: { ...ally.stats, hp: 8 } })
    const combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
    await MaddoxCombatModel.updateOne(
        { campaignId: id },
        { $push: { combatants: { name: "Guarda", nameKey: "guarda", side: "aliado", quantity: 1, description: "", condition: "", npcId: null, outcome: null, tactical: ally } }, $set: { "tactical.order": [...combat.tactical!.order, { actorKey: "npc:guard", kind: "combatant", name: "Guarda", total: 3, d20: 2, modifier: 1, dexterity: 12, joinIndex: 3, groupKey: "guarda" }] } },
    )
}

describe("DND-53 — PV dos inimigos e dos aliados NPC", () => {
    const slotsOf = async (id: string, userId: string) => {
        const order = (await game.getGameState(id, userId)).combat!.tactical!.order
        return Object.fromEntries(order.filter((slot) => slot.kind === "combatant").map((slot) => [slot.name, slot]))
    }

    it("desligado (padrão): o servidor não envia os números dos combatentes do mestre, só a faixa; nunca a CA", async () => {
        const { id, kael, lyra } = await scene()
        await addSecondGoblin(id, { defeated: true })
        await addAlly(id)
        for (const userId of [kael.userId, lyra.userId]) {
            const slots = await slotsOf(id, userId)
            expect(slots.Goblin).toMatchObject({ hp: null, band: "ileso", defeated: false })
            expect(slots["Goblin 2"]).toMatchObject({ hp: null, band: "caido", defeated: true })
            expect(slots.Guarda).toMatchObject({ side: "aliado", hp: null, band: "ferido" })
            expect(JSON.stringify(slots)).not.toMatch(/"ac"|"armorClass"|"hpMax"/)
        }
    })

    it("cada lado tem a sua escolha e vale na hora, no meio do combate, sem reiniciá-lo; 0 PV continua Caído", async () => {
        const { id, kael, lyra } = await scene()
        await addSecondGoblin(id, { defeated: true })
        await addAlly(id)
        const round = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!.tactical!.round
        await campaigns.updateCampaign(id, { showEnemyHp: true }, kael.userId)
        let slots = await slotsOf(id, lyra.userId)
        expect(slots.Goblin).toMatchObject({ hp: { current: 7, max: 7, temp: 0 }, band: "ileso" })
        expect(slots["Goblin 2"]).toMatchObject({ hp: { current: 0, max: 7, temp: 0 }, band: "caido", defeated: true })
        expect(slots.Guarda).toMatchObject({ hp: null, band: "ferido" })
        await campaigns.updateCampaign(id, { showEnemyHp: false, showAllyHp: true }, kael.userId)
        slots = await slotsOf(id, lyra.userId)
        expect(slots.Goblin).toMatchObject({ hp: null, band: "ileso" })
        expect(slots.Guarda).toMatchObject({ hp: { current: 8, max: 11, temp: 0 }, band: "ferido" })
        const combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat.tactical!.round).toBe(round)
        expect(combat.tactical!.phase).toBe("running")
    })

    it("o card da ordem de iniciativa (mensagem) nunca leva os números dos adversários", async () => {
        const { id, kael } = await scene()
        await campaigns.updateCampaign(id, { showEnemyHp: true, showAllyHp: true }, kael.userId)
        const { combatEventDto } = await import("@/features/maddox/server/combat")
        const combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        const order = combatEventDto(combat, "order").tactical!.order
        expect(order.filter((slot) => slot.kind === "combatant").every((slot) => slot.hp === null && slot.band !== null)).toBe(true)
    })

    it("1 natural do adversário: erra como sempre e o dado ao vivo chega com o veredito de falha crítica", async () => {
        const { id, kael } = await scene()
        const lines: { type: string; roll?: { step: string; verdict: string | null; actorName: string } }[] = []
        const unsubscribe = subscribeGameLive(id, (line) => lines.push(line as never))
        dice.server.push([1])
        script.push([{ text: "Kael recua." }], [{ tools: [{ name: "monster_action", input: { combatente: "Goblin", acao: "Faca", alvos: ["Kael"] } }], text: "O goblin tropeça." }])
        await actions.endCombatTurn(id, {}, kael.userId)
        await settleCampaign(id)
        unsubscribe()
        expect(lines.filter((line) => line.type === "live-roll").map((line) => [line.roll!.actorName, line.roll!.step, line.roll!.verdict])).toEqual([["Goblin", "attack", "fumble"]])
        const card = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action", "combatAction.actorName": "Goblin" }).lean())!
        expect(card.combatAction!.steps[0]).toMatchObject({ kind: "attack", hit: false, critical: false })
        expect(card.combatAction!.summary).toContain("1 natural")
    })
})

describe("DND-58 — exaustão nas rolagens do combate tático", () => {
    const exhaust = (sheetId: string, level: number) => CharacterSheet.collection.updateOne({ _id: new mongoose.Types.ObjectId(sheetId) }, { $set: { exhaustion: level } })

    it("ataque: a expressão do passo leva −2 por nível com a parcela 'Exaustão'", async () => {
        const { id, kael } = await scene()
        const sword = (await game.getGameState(id, kael.userId)).me.combat!.options!.action.find((option) => option.label === "Espada")!
        await exhaust(kael.sheetId, 2)
        await actions.submitCombatAction(id, { economy: "action", optionId: sword.id, targets: ["npc:gob"] }, kael.userId)
        const step = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action" }).lean())!.combatAction!.steps[0]!
        expect(step.dice).toBe(tactical.d20Expression(sword.attack!.bonus - 4))
        expect(step.modifierParts).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Exaustão", value: -4 })]))
    })

    it("iniciativa: o card do personagem com exaustão leva a penalidade da ficha; o sem exaustão não", async () => {
        const { kael, lyra, cardOf } = await initiativeScene(null, {
            beforeCombat: async ({ id }) => {
                const kaelDoc = (await MaddoxCharacterModel.findOne({ campaignId: id, name: "Kael" }).lean())!
                await exhaust(String(kaelDoc.sheetId), 2)
            },
        })
        // Kael e Lyra têm a mesma Destreza (12): só a exaustão separa os dois cards.
        const lyraCard = (await cardOf(lyra.userId)).combatRoll!
        const kaelCard = (await cardOf(kael.userId)).combatRoll!
        const base = Number(lyraCard.dice.replace("1d20", "") || 0)
        expect(kaelCard.dice).toBe(tactical.d20Expression(base - 4))
        expect(kaelCard.modifierParts).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Exaustão", value: -4 })]))
        expect(lyraCard.modifierParts ?? []).not.toEqual(expect.arrayContaining([expect.objectContaining({ label: "Exaustão" })]))
    })

    it("teste contra a morte: com exaustão 1, 11 no d20 (total 9) é falha — no texto, na ficha e no `success` do card", async () => {
        const { id, kael } = await scene({ kaelHp: 0 })
        await exhaust(kael.sheetId, 1)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "master", "turn.combatActor": null } })
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.activeIndex": 2, "tactical.nextKey": kael.actorKey } })
        await tactical.advanceToNextCharacter(new mongoose.Types.ObjectId(id), 2)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "players", "turn.eligibleMemberIds": [new mongoose.Types.ObjectId(kael.memberId)], "turn.combatActor": { combatId: (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!._id, actorKey: kael.actorKey, memberId: new mongoose.Types.ObjectId(kael.memberId), offlineSince: null } } })
        const roll = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "death-save" }).lean())!
        expect(roll.combatRoll!.dice).toBe("1d20-2")
        dice.players.set(kael.userId, [[11]])
        await actions.rollCombatRoll(id, String(roll._id), kael.userId)
        await waitForCampaignIdle(id)
        const done = (await MaddoxCampaignMessageModel.findById(roll._id).lean())!.combatRoll!
        expect(done).toMatchObject({ total: 9, success: false })
        expect(done.outcome).toMatch(/^falha/)
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.deathSavesFailure).toBe(1)
    })
})
