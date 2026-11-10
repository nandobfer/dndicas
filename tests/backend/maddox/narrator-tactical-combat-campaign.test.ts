import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * Critério de aceite do Maddox 7 (combate fiel ao D&D): campanha Fiel ao D&D com 3 personagens e o narrador REAL
 * (`narrator.ts`, ferramentas e prompt) sobre um `streamText` roteirizado. Os dados são roteirizados por quem rola (cada
 * jogador e o servidor) sobre o motor de dados real. Confere iniciativa, Ação (com Ataque Extra), Ação bônus (outra arma
 * Leve, magia de cura), a vez dos adversários com Ataques Múltiplos, a reação Escudo e o fim do combate, com o estado
 * persistido (combate, fichas, mensagens e campanha).
 */

type ToolCall = { name: string; input: Record<string, unknown> }
type Step = { tools?: ToolCall[]; text?: string }

const calls: { instructions: string; userText: string; toolNames: string[] }[] = []
const script: Step[][] = []
const toolLog: { name: string; output?: unknown; error?: string }[] = []
const dice = { server: [] as number[][], players: new Map<string, number[][]>() }

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
vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({
    CharacterSheetPusherService: { getInstance: () => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }) },
}))
vi.mock("@/lib/ai/jev", () => ({ askJevSystemOne: vi.fn(async () => ({ answers: {} })) }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({
        settings: {
            enabled: true,
            main: { provider: "gemini", model: "gemini-test", agent: null, variant: null, temperature: null, maxOutputTokens: null },
            instructions: "Você é Maddox, o mestre.",
            avatar: { url: null },
            opencode: { deleteOnCampaignEnd: true, directory: null, mcpUrl: null },
            jev: {},
        },
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
    generateAiText: vi.fn(async () => ({ text: '{"valid": true}' })),
}))
vi.mock("ai", () => ({
    dynamicTool: (def: unknown) => def,
    stepCountIs: (count: number) => ({ count }),
    streamText: (options: { instructions: string; messages: { content: string }[]; tools: Record<string, { execute: (input: unknown, meta: unknown) => Promise<unknown> }> }) => {
        const steps = script.shift() ?? [{ text: "O mundo segue." }]
        calls.push({ instructions: options.instructions, userText: options.messages[0]!.content, toolNames: Object.keys(options.tools) })
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
                yield { type: "finish", finishReason: "stop", totalUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }
            })(),
        }
    },
}))

vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)
const { campaignMemoriesStore } = await import("../../helpers/campaign-memories-mock")
const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCombatModel, MaddoxNpcModel, MaddoxCombatOptionProfileModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const tacticalActions = await import("@/features/maddox/server/tactical-actions")
const reactions = await import("@/features/maddox/server/combat-reactions")
const { settleCampaign, shortenCombatTiming } = await import("../../helpers/maddox-sequence")
await shortenCombatTiming()
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const { CharacterSpell } = await import("@/features/character-sheets/models/character-spell")
const { CharacterTrait } = await import("@/features/character-sheets/models/character-trait")
const { CharacterFeat } = await import("@/features/character-sheets/models/character-feat")
const { ItemModel } = await import("@/features/items/database/item")
const { Spell } = await import("@/features/spells/models/spell")
const { MonsterModel } = await import("@/features/monsters/models/monster")

let mongo: MongoMemoryServer
const oid = () => new mongoose.Types.ObjectId()

async function seedUser(username: string) {
    const _id = oid()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

const catalog = { shortsword: oid(), mace: oid(), shield: oid(), firebolt: oid(), healingWord: oid(), fireball: oid(), goblin: oid() }

async function seedCatalog() {
    await ItemModel.collection.insertMany([
        { _id: catalog.shortsword, name: "Espada Curta", type: "arma", status: "active", damageDice: { quantidade: 1, tipo: "d6" }, damageType: "perfurante", properties: [{ name: "Acuidade" }, { name: "Leve" }] },
        { _id: catalog.mace, name: "Maça", type: "arma", status: "active", damageDice: { quantidade: 1, tipo: "d6" }, damageType: "concussão", properties: [] },
    ])
    await Spell.collection.insertMany([
        { _id: catalog.shield, name: "Escudo", circle: 1, castingTime: "Reação", status: "active", description: "<p>Reação, que você usa quando for atingido por uma jogada de ataque: +5 na CA até o início do seu próximo turno.</p>" },
        { _id: catalog.firebolt, name: "Raio de Fogo", circle: 0, castingTime: "Ação", status: "active", baseDice: { quantidade: 1, tipo: "d10" }, description: "<p>Faça um ataque à distância com magia contra o alvo.</p>" },
        { _id: catalog.healingWord, name: "Palavra Curativa", circle: 1, castingTime: "Ação Bônus", status: "active", baseDice: { quantidade: 2, tipo: "d4" }, description: "<p>Uma criatura que você possa ver recupera pontos de vida iguais a 2d4 mais o seu modificador.</p>" },
        { _id: catalog.fireball, name: "Bola de Fogo", circle: 3, castingTime: "Ação", status: "active", saveAttribute: "dexterity", baseDice: { quantidade: 8, tipo: "d6" }, description: "<p>Salvaguarda de Destreza; metade do dano no sucesso.</p>" },
    ])
    await MonsterModel.collection.insertOne({
        _id: catalog.goblin,
        name: "Goblin",
        status: "active",
        armorClass: "15",
        hitPointsFormula: "7",
        attributes: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
        savingThrows: {},
        challengeRating: "1/4",
        actions: [
            { label: "Ataques Múltiplos", description: "<p>O goblin realiza dois ataques de Cimitarra.</p>" },
            { label: "Cimitarra", description: "<p>Ataque corpo a corpo: +4 para acertar, alcance 1,5 m. Acerto: 5 (1d6 + 2) de dano cortante.</p>", attackRoll: 4, hitRoll: "1d6 + 2 cortante" },
        ],
        bonusActions: [],
        reactions: [],
        damageResistances: [],
        damageImmunities: [],
        damageVulnerabilities: [],
        conditionImmunities: [],
    })
}

interface Hero {
    name: string
    level: number
    abilities: [number, number, number, number, number, number]
    hp: number
    spellAttribute?: string
    slots?: Record<string, { total: number; used: number }>
    weapons?: { catalogId: mongoose.Types.ObjectId; name: string }[]
    spells?: { catalogId: mongoose.Types.ObjectId; name: string; circle: number; prepared: boolean; castingTime: string }[]
    traits?: { name: string; description: string }[]
}

async function giveCharacter(campaignId: string, userId: string, hero: Hero) {
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const sheetId = oid()
    const [str, dex, con, int, wis, cha] = hero.abilities
    await CharacterSheet.collection.insertOne({
        _id: sheetId,
        slug: `${hero.name.toLowerCase()}-${String(sheetId)}`,
        userId,
        name: hero.name,
        level: hero.level,
        strength: str,
        dexterity: dex,
        constitution: con,
        intelligence: int,
        wisdom: wis,
        charisma: cha,
        proficiencyBonusOverride: null,
        savingThrows: {},
        skills: {},
        hpMax: hero.hp,
        hpCurrent: hero.hp,
        hpTemp: 0,
        deathSavesSuccess: 0,
        deathSavesFailure: 0,
        spellcastingAttribute: hero.spellAttribute ?? null,
        spellSaveDCOverride: null,
        spellAttackBonusOverride: null,
        spellSlots: hero.slots ?? {},
        resourceCharges: [],
        coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        initiativeOverride: null,
        initiativeProficiency: false,
    })
    const itemIds: string[] = []
    for (const weapon of hero.weapons ?? []) {
        const _id = oid()
        itemIds.push(String(_id))
        await CharacterItem.collection.insertOne({ _id, sheetId, catalogItemId: weapon.catalogId, name: `<p>${weapon.name}</p>`, quantity: 1, equipped: true, catalogItemType: "arma", notes: "" })
    }
    const spellIds: string[] = []
    for (const spell of hero.spells ?? []) {
        const _id = oid()
        spellIds.push(String(_id))
        await CharacterSpell.collection.insertOne({ _id, sheetId, catalogSpellId: spell.catalogId, name: spell.name, circle: spell.circle, prepared: spell.prepared, castingTime: spell.castingTime, concentration: false })
    }
    for (const trait of hero.traits ?? []) await CharacterTrait.collection.insertOne({ sheetId, catalogTraitId: null, name: trait.name, description: trait.description, origin: "class" })
    const character = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name: hero.name, profile: { capacidades: `${hero.name} luta bem.` }, interview: { status: "done", scriptVersion: 0 }, sheetId })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
    return { userId, sheetId: String(sheetId), characterId: String(character._id), itemIds, spellIds }
}

async function table() {
    const owner = await seedUser("kael")
    const created = await campaigns.createCampaign({ name: "Cripta dos Goblins", rigor: "fiel-dnd" }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", setting: "## Universo\nReinos Esquecidos.", openingSituation: "Goblins na cripta." } })
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const lyraUser = await seedUser("lyra")
    const brunoUser = await seedUser("bruno")
    await campaigns.joinByInvite(token, lyraUser)
    await campaigns.joinByInvite(token, brunoUser)
    const kael = await giveCharacter(created.id, owner, {
        name: "Kael",
        level: 5,
        abilities: [14, 16, 14, 10, 12, 10],
        hp: 44,
        weapons: [
            { catalogId: catalog.shortsword, name: "Espada Curta" },
            { catalogId: catalog.shortsword, name: "Espada Curta" },
        ],
        traits: [{ name: "Ataque Extra", description: "Você pode atacar duas vezes, em vez de uma, sempre que usar a ação Atacar no seu turno." }],
    })
    const lyra = await giveCharacter(created.id, lyraUser, {
        name: "Lyra",
        level: 3,
        abilities: [8, 14, 12, 16, 12, 10],
        hp: 18,
        spellAttribute: "intelligence",
        slots: { "1": { total: 4, used: 0 }, "2": { total: 2, used: 0 } },
        spells: [
            { catalogId: catalog.shield, name: "Escudo", circle: 1, prepared: true, castingTime: "Reação" },
            { catalogId: catalog.firebolt, name: "Raio de Fogo", circle: 0, prepared: false, castingTime: "Ação" },
            { catalogId: catalog.fireball, name: "Bola de Fogo", circle: 3, prepared: false, castingTime: "Ação" },
        ],
    })
    const bruno = await giveCharacter(created.id, brunoUser, {
        name: "Bruno",
        level: 3,
        abilities: [14, 10, 14, 10, 16, 12],
        hp: 24,
        spellAttribute: "wisdom",
        slots: { "1": { total: 4, used: 0 } },
        weapons: [{ catalogId: catalog.mace, name: "Maça" }],
        spells: [{ catalogId: catalog.healingWord, name: "Palavra Curativa", circle: 1, prepared: true, castingTime: "Ação Bônus" }],
    })
    return { id: created.id, kael, lyra, bruno }
}

const playerDice = (userId: string, ...rolls: number[][]) => {
    const queue = dice.players.get(userId) ?? []
    queue.push(...rolls)
    dice.players.set(userId, queue)
}

const lastActionId = async (id: string, actorName: string) => String((await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action", "combatAction.actorName": actorName }).sort({ _id: -1 }).lean())!._id)

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_tactical_combat_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxNpcModel.init(), MaddoxCombatModel.init(), MaddoxCombatOptionProfileModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    campaignMemoriesStore.reset()
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})))
    calls.length = 0
    script.length = 0
    toolLog.length = 0
    dice.server.length = 0
    dice.players.clear()
    await seedCatalog()
})

describe("Maddox 7 — combate fiel ao D&D de ponta a ponta", () => {
    it("3 personagens: iniciativa, Ação, Ação bônus, vez dos adversários com reação e o fim do combate, com o estado persistido", async () => {
        const { id, kael, lyra, bruno } = await table()

        // ── Turno 1: o Maddox abre o combate (o Fiel recusa bloco próprio e monstro fora do catálogo) ──
        script.push([
            {
                tools: [
                    { name: "start_combat", input: { titulo: "Cripta", adversarios: [{ nome: "Goblin", quantidade: 2, estatisticas: { ca: 12, pv: 5, acoes: [{ nome: "Faca", tipo: "ataque", bonus: 3, dano: "1d4" }] } }] } },
                    { name: "start_combat", input: { titulo: "Cripta", adversarios: [{ nome: "Goblin", quantidade: 2, monstro: "Goblim" }] } },
                    { name: "start_combat", input: { titulo: "Cripta", local: "Cripta antiga", adversarios: [{ nome: "Goblin", quantidade: 2, monstro: "Goblin", descricao: "Sonolentos: desvantagem nos ataques" }] } },
                ],
                text: "Dois goblins saltam das sombras!",
            },
        ])
        dice.server.push([8]) // iniciativa do grupo de goblins: 8 + 2 = 10
        await game.startCampaign(id, kael.userId)
        await settleCampaign(id)
        expect(toolLog[0]!.error).toMatch(/Fiel ao D&D todo adversário vem do catálogo/)
        expect(toolLog[1]!.error).toMatch(/"Goblim" não está no catálogo de Monstros\. Parecidos no catálogo: Goblin/)
        expect(toolLog[2]!.output).toMatchObject({ started: true })
        expect(await MaddoxCombatModel.countDocuments({})).toBe(1)

        let combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat).toMatchObject({ mode: "tactical", status: "active", tactical: { phase: "initiative" } })
        expect(combat.combatants.map((item) => item.name)).toEqual(["Goblin 1", "Goblin 2"])
        expect(combat.combatants[0]!.tactical!.stats).toMatchObject({ source: "catalog", ac: 15, hpMax: 7, multiattack: 2 })
        const initiativeCards = await MaddoxCampaignMessageModel.find({ campaignId: id, kind: "combat-roll", "combatRoll.kind": "initiative" }).lean()
        expect(initiativeCards).toHaveLength(3)
        let campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn).toMatchObject({ phase: "master", awaitingChecks: true })

        // A iniciativa pendente só chega a quem rola.
        const lyraView = await game.getGameState(id, lyra.userId)
        expect(lyraView.messages.filter((message) => message.combatRoll?.kind === "initiative")).toHaveLength(1)
        expect((lyraView.turn.pendingCombat ?? []).map((item) => item.characterName).sort()).toEqual(["Bruno", "Kael", "Lyra"])

        // ── Iniciativa: Kael 15+3, Lyra 10+2, Bruno 3+0; goblins 10 ──
        playerDice(kael.userId, [15])
        playerDice(lyra.userId, [10])
        playerDice(bruno.userId, [3])
        script.push([{ text: "A luta começa. Kael, é a sua vez." }])
        const rollOf = (userId: string) => initiativeCards.find((card) => card.userId === userId)!
        await tacticalActions.rollCombatRoll(id, String(rollOf(kael.userId)._id), kael.userId)
        await tacticalActions.rollCombatRoll(id, String(rollOf(lyra.userId)._id), lyra.userId)
        await tacticalActions.rollCombatRoll(id, String(rollOf(bruno.userId)._id), bruno.userId)
        await settleCampaign(id)

        combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat.tactical!.order.map((slot) => `${slot.name}:${slot.total}`)).toEqual(["Kael:18", "Lyra:12", "Goblin 1:10", "Goblin 2:10", "Bruno:3"])
        expect(combat.tactical).toMatchObject({ phase: "running", round: 1 })
        expect(await MaddoxCampaignMessageModel.exists({ campaignId: id, kind: "combat", "combat.event": "order" })).toBeTruthy()
        campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn.phase).toBe("players")
        expect(campaign.turn.combatActor?.actorKey).toBe(`pc:${kael.characterId}`)

        // Ordem visível para todos.
        const brunoView = await game.getGameState(id, bruno.userId)
        expect(brunoView.combat?.tactical?.order.map((slot) => slot.name)).toEqual(["Kael", "Lyra", "Goblin 1", "Goblin 2", "Bruno"])
        expect(brunoView.combat?.tactical?.activeKey).toBe(`pc:${kael.characterId}`)
        expect(brunoView.combat?.tactical?.order.find((slot) => slot.name === "Goblin 1")).toMatchObject({ hp: null, band: "ileso" })
        expect(brunoView.me.combat?.myTurn).toBe(false)
        await expect(tacticalActions.submitCombatAction(id, { economy: "action", optionId: "unarmed", targets: [combat.combatants[0]!.tactical!.actorKey] }, bruno.userId)).rejects.toMatchObject({ code: "NOT_YOUR_COMBAT_TURN" })

        // ── Vez do Kael: Ataque Extra (2 ataques) e a outra arma Leve na Ação bônus ──
        const kaelView = await game.getGameState(id, kael.userId)
        expect(kaelView.me.combat).toMatchObject({ myTurn: true, attacksPerAction: 2 })
        const kaelWeapons = kaelView.me.combat!.options!.action.filter((option) => option.category === "weapons").map((option) => option.label)
        expect(kaelWeapons).toEqual(["Espada Curta", "Espada Curta", "Ataque desarmado"])
        expect(kaelView.me.combat!.options!.action.find((option) => option.category === "weapons")!.attack).toMatchObject({ bonus: 6, damage: "1d6+3" })
        expect(kaelView.me.combat!.options!.bonus.some((option) => option.category === "weapons")).toBe(false)
        expect(kaelView.me.combat!.options!.action.some((option) => option.label === "Ataque Extra")).toBe(false)
        const [goblin1, goblin2] = combat.combatants.map((item) => item.tactical!.actorKey)
        playerDice(kael.userId, [12], [4], [10], [2], [2])
        await tacticalActions.submitCombatAction(id, { economy: "action", optionId: `weapon:${kael.itemIds[0]}`, targets: [goblin1!] }, kael.userId)
        await tacticalActions.rollCombatAction(id, await lastActionId(id, "Kael"), kael.userId)
        await tacticalActions.rollCombatAction(id, await lastActionId(id, "Kael"), kael.userId)
        await tacticalActions.submitCombatAction(id, { economy: "action", optionId: `weapon:${kael.itemIds[1]}`, targets: [goblin2!] }, kael.userId)
        await tacticalActions.rollCombatAction(id, await lastActionId(id, "Kael"), kael.userId)
        await tacticalActions.rollCombatAction(id, await lastActionId(id, "Kael"), kael.userId)
        await expect(tacticalActions.submitCombatAction(id, { economy: "action", optionId: "unarmed", targets: [goblin2!] }, kael.userId)).rejects.toMatchObject({ code: "OPTION_UNAVAILABLE" })
        const afterAttacks = await game.getGameState(id, kael.userId)
        const offhand = afterAttacks.me.combat!.options!.bonus.find((option) => option.id.startsWith("offhand:"))
        expect(offhand?.attack).toMatchObject({ damage: "1d6" })
        await tacticalActions.submitCombatAction(id, { economy: "bonus", optionId: offhand!.id, targets: [goblin2!] }, kael.userId)
        await tacticalActions.rollCombatAction(id, await lastActionId(id, "Kael"), kael.userId)
        combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat.combatants[0]!.tactical).toMatchObject({ defeated: true, stats: { hp: 0 } })
        expect(combat.combatants[1]!.tactical!.stats.hp).toBe(2)
        script.push([{ text: "Kael derruba um goblin e fere o outro. Lyra, sua vez." }])
        await tacticalActions.endCombatTurn(id, { movimento: "Avança até a porta da cripta." }, kael.userId)
        await settleCampaign(id)
        expect(calls.at(-1)!.userText).toContain("Kael — Ação: Espada Curta em Goblin 1 → Goblin 1: acertou (18); 7 de dano perfurante em Goblin 1 (Goblin 1 caiu)")
        expect(calls.at(-1)!.userText).toContain("Movimento e posição: Avança até a porta da cripta.")
        // DND-42: com o combate em andamento, a tarefa leva a dificuldade na versão dos reforços (padrão Equilibrado).
        expect(calls.at(-1)!.userText).toContain("Dificuldade dos combates desta campanha (**Equilibrado**): reforços só se a ficção pedir")
        campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn.combatActor?.actorKey).toBe(`pc:${lyra.characterId}`)

        // ── Vez da Lyra: só o truque (magia não preparada e sem espaço fica de fora); erra ──
        const lyraTurn = await game.getGameState(id, lyra.userId)
        const lyraSpells = lyraTurn.me.combat!.options!.action.filter((option) => option.category === "spells").map((option) => option.label)
        expect(lyraSpells).toEqual(["Raio de Fogo"])
        expect(lyraTurn.me.combat!.options!.bonus.some((option) => option.category === "spells")).toBe(false)
        playerDice(lyra.userId, [3])
        await tacticalActions.submitCombatAction(id, { economy: "action", optionId: `spell:${lyra.spellIds[1]}`, targets: [goblin2!] }, lyra.userId)
        await tacticalActions.rollCombatAction(id, await lastActionId(id, "Lyra"), lyra.userId)

        // ── Vez do Goblin 2 (Ataques Múltiplos): acerta o Kael e ataca a Lyra, que reage com Escudo ──
        dice.server.push([15], [3], [12], [4])
        // DND-25: primeiro a narração da vez da Lyra (nenhum adversário age); depois o bloco do Goblin 2 (o 1 caiu: sem bloco).
        script.push(
            [{ text: "O raio de Lyra passa longe." }],
            [
                {
                    tools: [
                        { name: "get_combat", input: {} },
                        { name: "monster_action", input: { combatente: "Goblin 1", acao: "Cimitarra", alvos: ["Kael"] } },
                        { name: "monster_action", input: { combatente: "Goblin 2", acao: "Cimitarra", alvos: ["Kael"] } },
                        { name: "monster_action", input: { combatente: "Goblin 2", acao: "Cimitarra", alvos: ["Lyra"] } },
                    ],
                    text: "O goblin acerta Kael e gira a lâmina contra Lyra…",
                },
            ],
            [{ tools: [{ name: "monster_action", input: { combatente: "Goblin 2", acao: "Cimitarra", alvos: ["Lyra"] } }], text: "A lâmina bate na barreira mágica. Bruno, sua vez." }],
        )
        await tacticalActions.endCombatTurn(id, {}, lyra.userId)
        await settleCampaign(id)
        const masterTools = toolLog.slice(-4)
        expect(masterTools[1]!.error).toMatch(/Goblin 1 está caído/)
        // DND-42: a descrição do adversário (a penalidade da ficção) volta no get_combat a cada bloco; personagens não têm.
        const view = masterTools[0]!.output as { ordem: { nome: string; descricao?: string }[] }
        expect(view.ordem.find((slot) => slot.nome === "Goblin 2")?.descricao).toBe("Sonolentos: desvantagem nos ataques")
        expect(view.ordem.find((slot) => slot.nome === "Kael")?.descricao).toBeUndefined()
        expect(masterTools[2]!.output).toMatchObject({ ataque: { total: 19, acertou: true }, dano: { total: 5, alvo: "Kael" } })
        expect(masterTools[3]!.output).toMatchObject({ status: "aguardando_reacao" })
        expect(calls.at(-1)!.toolNames).toEqual(expect.arrayContaining(["monster_action", "apply_effect", "request_damage_roll", "offer_reaction", "start_combat", "end_combat"]))
        campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn).toMatchObject({ phase: "master", awaitingChecks: true })
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.hpCurrent).toBe(39)

        const reaction = (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-reaction" }).lean())!
        expect(reaction.combatReaction).toMatchObject({ status: "pending", trigger: "hit" })
        const kaelSees = (await game.getGameState(id, kael.userId)).messages.find((message) => message.kind === "combat-reaction")!
        expect(kaelSees.combatReaction!.options).toEqual([])
        const lyraSees = (await game.getGameState(id, lyra.userId)).messages.find((message) => message.kind === "combat-reaction")!
        expect(lyraSees.combatReaction!.options.map((option) => option.label)).toEqual(["Escudo"])
        await expect(reactions.decideReaction(id, String(reaction._id), lyraSees.combatReaction!.options[0]!.id, kael.userId)).rejects.toMatchObject({ code: "NOT_REACTION_TARGET" })
        await reactions.decideReaction(id, String(reaction._id), lyraSees.combatReaction!.options[0]!.id, lyra.userId)
        await settleCampaign(id)
        const settled = (await MaddoxCampaignMessageModel.findById(reaction._id).lean())!
        expect(settled.combatReaction!.outcome).toMatch(/Com o Escudo \(CA 17\), o ataque de Goblin 2 \(16\) errou/)
        const lyraSheet = (await CharacterSheet.findById(lyra.sheetId).lean())!
        expect(lyraSheet.hpCurrent).toBe(18)
        expect((lyraSheet.spellSlots as unknown as Record<string, { used: number }>)["1"]!.used).toBe(1)
        expect(toolLog.at(-1)!.error).toMatch(/Goblin 2 já usou a Ação/)
        expect(calls.at(-1)!.userText).toContain("Com o Escudo")
        campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn.combatActor?.actorKey).toBe(`pc:${bruno.characterId}`)
        combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat.tactical!.characters.find((state) => state.name === "Lyra")!.flags.shield).toBe(true)

        // ── Vez do Bruno: Palavra Curativa (Ação bônus) no Kael e a maça no Goblin 2 ──
        const brunoTurn = await game.getGameState(id, bruno.userId)
        const healingWord = brunoTurn.me.combat!.options!.bonus.find((option) => option.label === "Palavra Curativa")!
        expect(healingWord.heal).toMatchObject({ dice: "2d4+3" })
        playerDice(bruno.userId, [2, 3], [14], [1])
        await tacticalActions.submitCombatAction(id, { economy: "bonus", optionId: healingWord.id, targets: [`pc:${kael.characterId}`] }, bruno.userId)
        await tacticalActions.rollCombatAction(id, await lastActionId(id, "Bruno"), bruno.userId)
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.hpCurrent).toBe(44)
        const mace = (await game.getGameState(id, bruno.userId)).me.combat!.options!.action.find((option) => option.label === "Maça")!
        await tacticalActions.submitCombatAction(id, { economy: "action", optionId: mace.id, targets: [goblin2!] }, bruno.userId)
        await tacticalActions.rollCombatAction(id, await lastActionId(id, "Bruno"), bruno.userId)
        await tacticalActions.rollCombatAction(id, await lastActionId(id, "Bruno"), bruno.userId)
        combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat.combatants[1]!.tactical!.defeated).toBe(true)
        expect(((await CharacterSheet.findById(bruno.sheetId).lean())!.spellSlots as unknown as Record<string, { used: number }>)["1"]!.used).toBe(1)

        // ── Fim do combate: todos os inimigos caíram ──
        // Maddox 8: no Fiel ao D&D, recompensa em item fora do catálogo é recusada sem gravar (com os parecidos).
        script.push([
            {
                tools: [
                    {
                        name: "end_combat",
                        input: { resultado: "vitoria", resumo: "x", adversarios: [{ nome: "Goblin 1", desfecho: "morto" }], recompensas: [{ tipo: "item", personagem: "Kael", item: "Espada Cursada" }], cenaFinal: "x" },
                    },
                    {
                        name: "end_combat",
                        input: {
                            resultado: "vitoria",
                            resumo: "Os goblins caíram na cripta.",
                            adversarios: [{ nome: "Goblin 1", desfecho: "morto" }, { nome: "Goblin 2", desfecho: "morto" }],
                            recompensas: [
                                { tipo: "moedas", personagem: "Kael", moedas: { po: 10 } },
                                { tipo: "item", personagem: "Kael", item: "espada curta" },
                            ],
                            cenaFinal: "A cripta silencia.",
                        },
                    },
                ],
                text: "A cripta silencia. O que vocês fazem?",
            },
        ])
        await tacticalActions.endCombatTurn(id, {}, bruno.userId)
        await settleCampaign(id)
        expect(calls.at(-1)!.userText).toContain("TODOS os inimigos estão fora de combate")
        combat = (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
        expect(combat).toMatchObject({ status: "ended", outcome: "vitoria", effectsApplied: true })
        expect(combat.rewards[0]).toMatchObject({ applied: true })
        expect(combat.rewards[1]).toMatchObject({ kind: "item", applied: true, warning: null })
        const refused = toolLog.filter((item) => item.name === "end_combat")
        expect(refused[0]!.error).toContain('No Fiel ao D&D toda recompensa em item vem do catálogo: "Espada Cursada" não está nele. Parecidos no catálogo: Espada Curta.')
        expect(refused[1]!.error).toBeUndefined()
        expect((await CharacterSheet.findById(kael.sheetId).lean())!.coins.gp).toBe(10)
        campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn.phase).toBe("players")
        expect(campaign.turn.combatActor ?? null).toBeNull()
        expect(campaign.turn.eligibleMemberIds).toHaveLength(3)
        const finalView = await game.getGameState(id, lyra.userId)
        expect(finalView.combat).toBeNull()
        expect(finalView.me.combat).toBeNull()
        const kinds = (await MaddoxCampaignMessageModel.find({ campaignId: id }).sort({ _id: 1 }).lean()).map((doc) => (doc.kind === "combat" ? `combat:${doc.combat!.event}` : doc.kind))
        expect(kinds.filter((kind) => kind.startsWith("combat:"))).toEqual(["combat:start", "combat:order", "combat:end"])
        expect(kinds.filter((kind) => kind === "combat-action").length).toBeGreaterThanOrEqual(8)
    }, 60_000)
})
