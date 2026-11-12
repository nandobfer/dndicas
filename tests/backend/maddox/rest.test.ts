import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose, { Types } from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { MaddoxAnswerContext, MaddoxMasterSink, MaddoxNarrationContext, MaddoxRestExchangeContext } from "@/features/maddox/server/game-master"
import type { DiceRollRequest } from "@/features/dice-roller/types"

/**
 * DND-58: descanso curto e longo conduzidos pelo Maddox. O narrador (falso) chama `start_rest` de verdade; o servidor
 * grava o balão, prepara as fichas (Maddox do catálogo mockado), abre os dados de vida (curto, rolados pelo jogador, um
 * por vez) e as trocas (mestre falso aplica pela lista fechada). A mesa espera todos; offline conclui sem a parte dele.
 */

const recordAudit = vi.fn<(entry: Record<string, unknown>) => Promise<undefined>>(async () => undefined)
const publishToChannels = vi.fn(async () => undefined)
const presence: { online: Set<string> | null } = { online: null }
const dice: number[] = []

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
vi.mock("@/core/database/db", () => ({ default: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: { enabled: true, avatar: { url: null } }, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => (presence.online ? new Set(presence.online) : null)) }))
vi.mock("@/features/maddox/server/check-hints", () => ({ withCheckHints: vi.fn(async (_campaign: unknown, declarations: unknown) => declarations) }))
vi.mock("@/features/maddox/server/combat-hints", () => ({ combatBoundaryHint: vi.fn(async () => null) }))
vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)
const sheetPusher = vi.hoisted(() => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({ CharacterSheetPusherService: { getInstance: () => sheetPusher } }))
vi.mock("@/features/dice-roller/server/dice-target", () => ({ resolveGeneralDiceTarget: vi.fn(() => ({ scope: "user", userId: "x" })) }))
vi.mock("@/features/dice-roller/server/dice-roll-service", () => ({
    rollGeneralDice: vi.fn(async (input: DiceRollRequest) => {
        const value = dice.shift() ?? 1
        return { rollId: `r-${Math.random()}`, label: input.label, terms: [{ dice: input.terms[0]!.dice, quantity: 1, results: [value] }], mode: "normal", diceTotal: value, modifier: input.modifier ?? 0, modifierParts: input.modifierParts, total: value + (input.modifier ?? 0), createdAt: new Date().toISOString() }
    }),
}))

/** Recuperação decidida pelo "Maddox" (catálogo): cada caso registra a leitura que cita. */
const prepAi = vi.hoisted(() => ({ review: vi.fn<(input: { reads: unknown; restType: string }) => Promise<unknown>>(async () => ({ cargas: [], espacosNoCurto: null })) }))
vi.mock("@/features/maddox/server/rest-prep-ai", () => ({ reviewRestRecovery: prepAi.review }))

const opexAi = vi.hoisted(() => ({ decide: vi.fn<(input: { prompt: string }) => Promise<unknown>>() }))
vi.mock("@/features/maddox/server/opex-player", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/maddox/server/opex-player")>()),
    loadOpexModel: vi.fn(async () => ({ settings: {}, model: { provider: "fake" } })),
    opexPromptContext: vi.fn(async () => ({ instructions: "", ownerGuidance: "", memories: "", table: [], basePrompt: "", campaign: { name: "x", rigor: "equilibrado", setting: "", openingSituation: "", state: { scene: "", location: "", situation: "", pendingDecision: "" } }, character: null })),
    decideOpex: opexAi.decide,
}))
vi.mock("@/features/engramind/server/opex-characters", () => ({ saveOpexCharacterMemories: vi.fn(async () => undefined) }))

const script: { rest: Record<string, unknown> | null; exchange: ((context: MaddoxRestExchangeContext) => Promise<string>) | null; toolResult: unknown } = { rest: null, exchange: null, toolResult: null }
const fakeMaster = {
    narrate: vi.fn(async (context: MaddoxNarrationContext, sink: MaddoxMasterSink) => {
        if (script.rest && context.declarations.length) {
            const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")
            script.toolResult = await runMaddoxTool(findMaddoxTool("start_rest")!, { campaignId: new Types.ObjectId(context.campaignId), turnNumber: context.turnNumber, jobId: context.jobId }, script.rest).catch((error: Error) => ({ error: error.message }))
            script.rest = null
        }
        const text = "O Maddox narra a cena."
        sink.delta(text)
        return text
    }),
    answer: vi.fn(async (_context: MaddoxAnswerContext, sink: MaddoxMasterSink) => {
        sink.delta("Resposta.")
        return "Resposta."
    }),
    restExchange: vi.fn(async (context: MaddoxRestExchangeContext, sink: MaddoxMasterSink) => {
        const text = script.exchange ? await script.exchange(context) : "Nada a mudar."
        sink.delta(text)
        return text
    }),
}
vi.mock("@/features/maddox/server/game-master", () => ({ getMaddoxMaster: vi.fn(async () => fakeMaster) }))

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCombatModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterSpell } = await import("@/features/character-sheets/models/character-spell")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const rest = await import("@/features/maddox/server/rest")
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { waitForOpexIdle } = await import("@/features/maddox/server/opex-runtime")
const { recordCatalogRead } = await import("@/features/maddox/server/catalog-reads")
const { questionRun } = await import("@/features/maddox/server/question-runs")
const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")
const { campaignMemoriesStore } = await import("../../helpers/campaign-memories-mock")

let mongo: MongoMemoryServer

async function idle(id: string) {
    for (let round = 0; round < 6; round++) {
        await waitForCampaignIdle(id)
        await waitForOpexIdle()
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
    await waitForCampaignIdle(id)
}

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username, email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

type SheetSeed = Record<string, unknown>
const baseSheet = (name: string): SheetSeed => ({ name, level: 3, strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10, hpMax: 20, hpCurrent: 20, hpTemp: 0, hitDiceTotal: "d8", hitDiceUsed: 0, deathSavesSuccess: 0, deathSavesFailure: 0, exhaustion: 0, spellSlots: {}, resourceCharges: [] })

async function giveCharacter(campaignId: string, userId: string, name: string, sheet: SheetSeed, memberId?: string) {
    const member = memberId ? await MaddoxCampaignMemberModel.findById(memberId).lean() : await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const sheetId = new Types.ObjectId()
    await CharacterSheet.collection.insertOne({ _id: sheetId, slug: `ficha-${String(sheetId)}`, userId, ...sheet, createdAt: new Date(), updatedAt: new Date() })
    const character = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name, sheetId, interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
    return { memberId: String(member!._id), characterId: String(character._id), sheetId: String(sheetId) }
}

/** Campanha Equilibrada (com ficha), dono + jogadora, iniciada (turno 1 narrado, vez dos jogadores aberta). */
async function table(sheets: { owner?: SheetSeed; player?: SheetSeed } = {}, options: { opex?: SheetSeed } = {}) {
    const owner = await seedUser("dono")
    const player = await seedUser("lyra")
    const created = await campaigns.createCampaign({ name: "Brumas", rigor: "equilibrado" }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", openingSituation: "Uma estrada." } })
    await campaigns.joinByInvite((await campaigns.getInviteLink(created.id, owner)).token, player)
    const thorn = await giveCharacter(created.id, owner, "Thorn", { ...baseSheet("Thorn"), ...sheets.owner })
    const lyra = await giveCharacter(created.id, player, "Lyra", { ...baseSheet("Lyra"), ...sheets.player })
    let opex: Awaited<ReturnType<typeof giveCharacter>> | null = null
    if (options.opex) {
        const memberId = new Types.ObjectId()
        await MaddoxCampaignMemberModel.collection.insertOne({ _id: memberId, campaignId: new Types.ObjectId(created.id), userId: `opex:${String(memberId)}`, role: "player", status: "joined", kind: "opex", opex: { ownerUserId: owner, prompt: "Bardo", interviewMode: "autonomous", addedAt: new Date(), run: null }, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date() })
        opex = await giveCharacter(created.id, `opex:${String(memberId)}`, "Eco", { ...baseSheet("Eco"), ...options.opex }, String(memberId))
    }
    presence.online = new Set([owner, player])
    await game.startCampaign(created.id, owner)
    await idle(created.id)
    return { id: created.id, owner, player, thorn, lyra, opex }
}

type Table = Awaited<ReturnType<typeof table>>

/** Os dois declaram; o narrador do turno seguinte chama `start_rest` com `input`. */
async function restTurn(t: Table, input: Record<string, unknown>) {
    script.rest = input
    await game.submitGameAction(t.id, { kind: "declaration", content: "Vamos descansar." }, t.owner)
    await game.submitGameAction(t.id, { kind: "declaration", content: "Vamos descansar." }, t.player)
    await idle(t.id)
    const message = await MaddoxCampaignMessageModel.findOne({ campaignId: t.id, kind: "rest" }).sort({ _id: -1 }).lean()
    return message
}

const sheetOf = (sheetId: string) => CharacterSheet.findById(sheetId).lean<Record<string, unknown>>()
const restOf = async (t: Table) => (await MaddoxCampaignMessageModel.findOne({ campaignId: t.id, kind: "rest" }).sort({ _id: -1 }).lean())!
const entryOf = async (t: Table, characterId: string) => (await restOf(t)).rest!.characters.find((entry) => String(entry.characterId) === characterId)!
const narrations = (t: Table) => MaddoxCampaignMessageModel.countDocuments({ campaignId: t.id, kind: "narration" })
const declareAll = async (t: Table) => {
    await game.submitGameAction(t.id, { kind: "declaration", content: "Seguimos viagem." }, t.owner)
    await game.submitGameAction(t.id, { kind: "declaration", content: "Seguimos viagem." }, t.player)
    await idle(t.id)
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_rest_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init()])
}, 180_000)
afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)
beforeEach(async () => {
    await mongoose.connection.db!.dropDatabase()
    await Promise.all([MaddoxCampaignMessageModel.init(), MaddoxCharacterModel.init()])
    campaignMemoriesStore.reset()
    recordAudit.mockClear()
    prepAi.review.mockReset()
    prepAi.review.mockImplementation(async () => ({ cargas: [], espacosNoCurto: null }))
    opexAi.decide.mockReset()
    fakeMaster.restExchange.mockClear()
    script.rest = null
    script.exchange = null
    script.toolResult = null
    dice.length = 0
    presence.online = null
})

describe("DND-58 — descanso curto: dados de vida na tela e a mesa esperando todos", () => {
    it("balão no chat, um dado por vez (Constituição somada), turno travado até todos concluírem", { timeout: 30_000 }, async () => {
        const t = await table({ player: { hpCurrent: 2 } })
        const message = await restTurn(t, { tipo: "curto", desfecho: "concluido", descricao: "Uma fogueira à beira da estrada." })
        expect(message?.rest).toMatchObject({ type: "short", status: "running", description: "Uma fogueira à beira da estrada." })
        expect(script.toolResult).toMatchObject({ saved: true, personagens: ["Thorn", "Lyra"] })
        // Thorn está com PV cheio: não rola; Lyra rola.
        expect((await entryOf(t, t.thorn.characterId)).hitDice.status).toBe("none")
        expect((await entryOf(t, t.lyra.characterId)).hitDice).toMatchObject({ status: "open", die: "d8" })
        expect((await entryOf(t, t.lyra.characterId)).prep.status).toBe("ready")

        const state = await game.getGameState(t.id, t.player)
        const dto = state.messages.find((item) => item.kind === "rest")!.rest!
        expect(dto.characters.find((entry) => entry.name === "Lyra")!.can).toMatchObject({ roll: true, exchange: true })
        expect(dto.characters.find((entry) => entry.name === "Thorn")!.can).toMatchObject({ roll: false, exchange: false })
        expect(state.turn.restWaiting).toEqual(expect.arrayContaining([{ characterName: "Lyra", parts: ["hit-dice", "exchange"] }]))

        // Os dois declaram no turno aberto: o turno NÃO fecha com o descanso pendente.
        const before = await narrations(t)
        await declareAll(t)
        expect(await narrations(t)).toBe(before)

        dice.push(6, 1)
        const first = await rest.rollRestHitDie(t.id, String(message!._id), t.lyra.characterId, t.player)
        expect(first.roll.total).toBe(8)
        expect(await sheetOf(t.lyra.sheetId)).toMatchObject({ hpCurrent: 10, hitDiceUsed: 1 })
        await rest.rollRestHitDie(t.id, String(message!._id), t.lyra.characterId, t.player)
        expect(await sheetOf(t.lyra.sheetId)).toMatchObject({ hpCurrent: 13, hitDiceUsed: 2 })
        await rest.declineRestHitDice(t.id, String(message!._id), t.lyra.characterId, t.player)
        expect((await entryOf(t, t.lyra.characterId)).hitDice).toMatchObject({ status: "done" })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: t.id, kind: "hit-points" })).toBe(2)

        await rest.finishRestExchange(t.id, String(message!._id), t.lyra.characterId, true, t.player)
        await idle(t.id)
        expect(await narrations(t)).toBe(before)
        await rest.finishRestExchange(t.id, String(message!._id), t.thorn.characterId, true, t.owner)
        await idle(t.id)
        expect((await restOf(t)).rest!.status).toBe("closed")
        expect(await narrations(t)).toBe(before + 1)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "CampanhaMaddox", depois: expect.objectContaining({ rest: expect.objectContaining({ status: "closed" }) }) }))
    })

    it("Constituição negativa cura no mínimo 0; dados esgotados fecham a parte; outro jogador não rola", { timeout: 30_000 }, async () => {
        const t = await table({ player: { hpCurrent: 3, level: 1, constitution: 6, hitDiceTotal: "d4" } })
        const message = (await restTurn(t, { tipo: "curto", desfecho: "concluido", descricao: "Pausa." }))!
        await expect(rest.rollRestHitDie(t.id, String(message._id), t.lyra.characterId, t.owner)).rejects.toMatchObject({ status: 403, code: "NOT_REST_TARGET" })
        dice.push(1)
        const result = await rest.rollRestHitDie(t.id, String(message._id), t.lyra.characterId, t.player)
        expect(result.roll.total).toBe(-1)
        expect(await sheetOf(t.lyra.sheetId)).toMatchObject({ hpCurrent: 3, hitDiceUsed: 1 })
        expect((await entryOf(t, t.lyra.characterId)).hitDice.status).toBe("done")
        await expect(rest.rollRestHitDie(t.id, String(message._id), t.lyra.characterId, t.player)).rejects.toMatchObject({ code: "REST_PART_CLOSED" })
    })

    it("PV no limite: o dado de vida nunca passa do máximo e fecha a parte", { timeout: 30_000 }, async () => {
        const t = await table({ player: { hpCurrent: 18 } })
        const message = (await restTurn(t, { tipo: "curto", desfecho: "concluido", descricao: "Pausa." }))!
        dice.push(8)
        await rest.rollRestHitDie(t.id, String(message._id), t.lyra.characterId, t.player)
        expect(await sheetOf(t.lyra.sheetId)).toMatchObject({ hpCurrent: 20, hitDiceUsed: 1 })
        expect((await entryOf(t, t.lyra.characterId)).hitDice.status).toBe("done")
    })

    it("jogador offline conclui sem rolar e sem trocar", { timeout: 30_000 }, async () => {
        const t = await table({ player: { hpCurrent: 2 } })
        await restTurn(t, { tipo: "curto", desfecho: "concluido", descricao: "Pausa." })
        presence.online = new Set([t.owner])
        await rest.finishRestExchange(t.id, String((await restOf(t))._id), t.thorn.characterId, true, t.owner)
        await idle(t.id)
        const lyra = await entryOf(t, t.lyra.characterId)
        expect(lyra).toMatchObject({ doneReason: "offline", hitDice: { status: "skipped" }, exchange: { status: "skipped" } })
        expect((await restOf(t)).rest!.status).toBe("closed")
        expect((await sheetOf(t.lyra.sheetId))!.hpCurrent).toBe(2)
    })
})

describe("DND-58 — descanso longo: recuperação pela tabela e pelo catálogo, uma vez só", () => {
    const mage = { level: 5, hpCurrent: 4, hpTemp: 3, hitDiceTotal: "d6", hitDiceUsed: 5, deathSavesSuccess: 1, deathSavesFailure: 2, exhaustion: 2, spellSlots: { "1": { total: 4, used: 4 }, "2": { total: 3, used: 2 } }, resourceCharges: [{ id: "arcane", name: "Recuperação Arcana", total: 1, used: 1, source: { kind: "class-feature", entityType: "Habilidade", entityId: "hab-arcane" } }, { id: "luck", name: "Sorte", total: 3, used: 2, source: { kind: "feat", entityType: "Talento", entityId: "tal-luck" } }, { id: "cook", name: "Caldo", total: 1, used: 1, source: null }] }

    it("PV máximos, metade dos dados, espaços, testes, exaustão −1; carga sem descrição e manual não voltam; reaplicar não soma", { timeout: 30_000 }, async () => {
        prepAi.review.mockImplementation(async (input) => {
            recordCatalogRead(input.reads as never, "Habilidade", "hab-arcane", { nome: "Recuperação Arcana", descricao: "Uma vez por dia, quando terminar um Descanso Longo, você recupera esta característica." })
            return { cargas: [{ chargeId: "arcane", recupera: "todas", source: { ref: "Habilidade:hab-arcane", quote: "quando terminar um Descanso Longo, você recupera esta característica" } }, { chargeId: "luck", recupera: "nenhuma", motivo: "o catálogo não diz como os pontos voltam" }] }
        })
        const t = await table({ player: mage })
        const message = (await restTurn(t, { tipo: "longo", desfecho: "concluido", descricao: "Noite na estalagem." }))!
        expect(prepAi.review).toHaveBeenCalledTimes(1)
        const sheet = (await sheetOf(t.lyra.sheetId))!
        expect(sheet).toMatchObject({ hpCurrent: 20, hpTemp: 0, hitDiceUsed: 3, deathSavesSuccess: 0, deathSavesFailure: 0, exhaustion: 1 })
        expect(sheet.spellSlots).toMatchObject({ "1": { total: 4, used: 0 }, "2": { total: 3, used: 0 } })
        const charges = sheet.resourceCharges as { id: string; used: number }[]
        expect(charges.find((charge) => charge.id === "arcane")!.used).toBe(0)
        expect(charges.find((charge) => charge.id === "luck")!.used).toBe(2)
        expect(charges.find((charge) => charge.id === "cook")!.used).toBe(1)
        const lyra = await entryOf(t, t.lyra.characterId)
        expect(lyra.hitDice.status).toBe("none")
        expect(lyra.prep.notRecovered).toEqual(expect.arrayContaining([{ label: "Sorte", reason: "o catálogo não diz como os pontos voltam" }, { label: "Caldo", reason: "carga manual, sem origem no catálogo" }]))
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FichaPersonagem", entidadeId: t.lyra.sheetId, depois: expect.objectContaining({ origin: "rest-recovery" }) }))

        // Repetir a preparação (retomada, nova leitura da mesa) não aplica de novo.
        await rest.scheduleRestPreps(new Types.ObjectId(t.id))
        await game.getGameState(t.id, t.player)
        await idle(t.id)
        expect(await sheetOf(t.lyra.sheetId)).toMatchObject({ exhaustion: 1, hitDiceUsed: 3 })
        expect(prepAi.review).toHaveBeenCalledTimes(1)
        expect(String(message._id)).toBeTruthy()
    })

    it("preparação que falha duas vezes vai para o dono: 'Tentar de novo' refaz; 'Seguir sem' aplica sem o catálogo", { timeout: 30_000 }, async () => {
        prepAi.review.mockRejectedValue(new Error("provedor fora"))
        const t = await table({ player: mage })
        const message = (await restTurn(t, { tipo: "longo", desfecho: "concluido", descricao: "Noite." }))!
        const failed = await entryOf(t, t.lyra.characterId)
        expect(failed.prep).toMatchObject({ status: "failed", attempts: 2 })
        expect((await sheetOf(t.lyra.sheetId))!.hpCurrent).toBe(4)
        // O motivo bruto só vai ao dono.
        const playerView = (await game.getGameState(t.id, t.player)).messages.find((item) => item.kind === "rest")!.rest!
        expect(playerView.characters.find((entry) => entry.name === "Lyra")!.prep.error).toBeNull()
        const ownerView = (await game.getGameState(t.id, t.owner)).messages.find((item) => item.kind === "rest")!.rest!
        expect(ownerView.characters.find((entry) => entry.name === "Lyra")!.prep.error).toContain("provedor fora")
        await expect(rest.retryRestPrep(t.id, String(message._id), t.lyra.characterId, t.player)).rejects.toMatchObject({ status: 403 })

        await rest.retryRestPrep(t.id, String(message._id), t.lyra.characterId, t.owner)
        await idle(t.id)
        expect((await entryOf(t, t.lyra.characterId)).prep.status).toBe("failed")

        await rest.skipRestPrep(t.id, String(message._id), t.lyra.characterId, t.owner)
        const skipped = await entryOf(t, t.lyra.characterId)
        expect(skipped.prep).toMatchObject({ status: "ready", skippedCatalog: true })
        expect(skipped.prep.notRecovered).toEqual(expect.arrayContaining([{ label: "Recuperação Arcana", reason: "não foi possível consultar o catálogo agora" }]))
        expect(await sheetOf(t.lyra.sheetId)).toMatchObject({ hpCurrent: 20, exhaustion: 1 })
    })

    it("interrompido: nenhuma ficha muda e o balão diz por quê", { timeout: 30_000 }, async () => {
        const t = await table({ player: mage })
        const message = (await restTurn(t, { tipo: "longo", desfecho: "interrompido", interrupcao: "Lobos uivam perto do acampamento.", descricao: "Montam o acampamento." }))!
        expect(message.rest).toMatchObject({ status: "interrupted", interruption: "Lobos uivam perto do acampamento." })
        expect(await sheetOf(t.lyra.sheetId)).toMatchObject({ hpCurrent: 4, exhaustion: 2, hitDiceUsed: 5 })
        expect(prepAi.review).not.toHaveBeenCalled()
        // Sem descanso aberto: o turno segue normalmente.
        expect((await game.getGameState(t.id, t.player)).turn.restWaiting).toEqual([])
    })

    it("um combate começado na mesma narração interrompe o descanso", async () => {
        const doc = await rest.restMessageDoc(new Types.ObjectId(), 3, 0, { type: "long", outcome: "concluded", description: "Noite.", interruption: null, characters: [{ characterId: String(new Types.ObjectId()), memberId: String(new Types.ObjectId()), userId: "u", sheetId: String(new Types.ObjectId()), name: "Lyra", opex: false }] }, true)
        expect(doc.rest).toMatchObject({ status: "interrupted", interruption: "Um combate começou." })
        expect(doc.rest.characters[0]!.prep.status).toBe("ready")
    })
})

describe("DND-58 — recusas do start_rest", () => {
    it("combate tático em andamento, descanso já aberto, personagem desconhecido e grau sem ficha", { timeout: 30_000 }, async () => {
        const t = await table({ player: { hpCurrent: 2 } })
        await restTurn(t, { tipo: "curto", desfecho: "concluido", descricao: "Pausa." })
        // Outro descanso com o primeiro aberto: recusado (a mesa não avança enquanto ele espera, então testamos a ferramenta direto).
        const { enqueueMaddoxJob } = await import("@/features/maddox/server/game-live")
        const call = (input: Record<string, unknown>) => {
            let result: unknown = null
            return enqueueMaddoxJob(t.id, "teste", async ({ jobId }) => {
                result = await runMaddoxTool(findMaddoxTool("start_rest")!, { campaignId: new Types.ObjectId(t.id), turnNumber: 2, jobId }, input).catch((error: Error) => ({ error: error.message }))
            }, { kind: "narration", turnNumber: 2, round: 0 }).then(() => result)
        }
        expect(await call({ tipo: "curto", desfecho: "concluido", descricao: "x" })).toEqual({ error: expect.stringContaining("Já existe um descanso aberto") })
        await MaddoxCampaignMessageModel.updateMany({ campaignId: t.id, kind: "rest" }, { $set: { "rest.status": "closed" } })
        expect(await call({ tipo: "curto", desfecho: "concluido", descricao: "x", personagens: ["Ninguém"] })).toEqual({ error: expect.stringContaining('Nenhum personagem jogador chamado "Ninguém"') })
        expect(await call({ tipo: "longo", desfecho: "interrompido", descricao: "x" })).toEqual({ error: expect.stringContaining("interrupcao") })
        await MaddoxCombatModel.collection.insertOne({ campaignId: new Types.ObjectId(t.id), title: "Emboscada", location: "", status: "active", mode: "tactical", combatants: [], tactical: { mode: "tactical", phase: "initiative", round: 1, activeIndex: 0, order: [], characters: [], queue: [], acted: [] }, createdAt: new Date(), updatedAt: new Date() })
        expect(await call({ tipo: "curto", desfecho: "concluido", descricao: "x" })).toEqual({ error: expect.stringContaining("combate tático em andamento") })
        await MaddoxCombatModel.deleteMany({})
        await MaddoxCharacterModel.updateOne({ _id: t.lyra.characterId }, { $set: { status: "dead" } })
        expect(await call({ tipo: "curto", desfecho: "concluido", descricao: "x", personagens: ["Lyra"] })).toEqual({ error: expect.stringContaining("Lyra está morto") })
        await MaddoxCampaignModel.updateOne({ _id: t.id }, { $set: { rigor: "narrativo" } })
        expect(await call({ tipo: "curto", desfecho: "concluido", descricao: "x" })).toEqual({ error: expect.stringContaining("campanha é narrativa") })
        // Fora da narração (resposta a uma pergunta): recusado.
        let answer: unknown = null
        await enqueueMaddoxJob(t.id, "resposta", async ({ jobId }) => {
            answer = await runMaddoxTool(findMaddoxTool("start_rest")!, { campaignId: new Types.ObjectId(t.id), turnNumber: 2, jobId }, { tipo: "curto", desfecho: "concluido", descricao: "x" }).catch((error: Error) => error.message)
        }, { kind: "answer", turnNumber: 2, round: 0 })
        expect(String(answer)).toMatch(/narrativa|narração/)
    })
})

describe("DND-58 — trocas depois do descanso", () => {
    it("aceita pela lista fechada (magia preparada), recusa tipo fora da lista e o jogador pode pedir de novo", { timeout: 30_000 }, async () => {
        const t = await table()
        const shield = await CharacterSpell.create({ sheetId: t.lyra.sheetId, name: "Escudo Arcano", circle: 1, prepared: true })
        const missiles = await CharacterSpell.create({ sheetId: t.lyra.sheetId, name: "Mísseis Mágicos", circle: 1, prepared: false })
        const message = (await restTurn(t, { tipo: "longo", desfecho: "concluido", descricao: "Noite." }))!
        script.exchange = async (context) => {
            const run = questionRun(context.jobId)!
            recordCatalogRead(run.reads, "Classe", "mago", { nome: "Mago", descricao: "Ao terminar um Descanso Longo, você pode mudar a lista de magias preparadas." })
            const result = (await runMaddoxTool(findMaddoxTool("update_character_sheet")!, { campaignId: new Types.ObjectId(context.campaignId), turnNumber: context.turnNumber, jobId: context.jobId }, {
                personagem: "Lyra",
                alteracoes: [
                    { type: "spell-update", spellId: String(shield._id), prepared: false, reason: "Troca no descanso longo." },
                    { type: "spell-update", spellId: String(missiles._id), prepared: true, reason: "Troca no descanso longo." },
                    { type: "item-add", name: "Poção", quantity: 1, reason: "x" },
                ],
            })) as { aplicadas: string[]; recusadas: { motivo: string }[] }
            expect(result.recusadas[0]!.motivo).toContain("não é uma troca depois do descanso")
            return `Feito: ${result.aplicadas.length} troca(s).`
        }
        await rest.submitRestExchange(t.id, String(message._id), t.lyra.characterId, "Troco Escudo Arcano por Mísseis Mágicos.", t.player)
        await idle(t.id)
        expect((await CharacterSpell.findById(shield._id).lean())!.prepared).toBe(false)
        expect((await CharacterSpell.findById(missiles._id).lean())!.prepared).toBe(true)
        const entry = await entryOf(t, t.lyra.characterId)
        expect(entry.exchange).toMatchObject({ status: "open", requests: 1 })
        expect(entry.exchange.applied).toHaveLength(2)
        const line = await MaddoxCampaignMessageModel.findOne({ campaignId: t.id, kind: "sheet-change" }).lean()
        expect(line!.content).toMatch(/^Trocas de Lyra depois do descanso longo:/)
        const request = await MaddoxCampaignMessageModel.findOne({ campaignId: t.id, kind: "rest-request" }).lean()
        expect(request).toMatchObject({ content: "Troco Escudo Arcano por Mísseis Mágicos.", characterName: "Lyra" })
        const answer = await MaddoxCampaignMessageModel.findOne({ campaignId: t.id, kind: "answer", replyToId: request!._id }).lean()
        expect(answer!.content).toBe("Feito: 2 troca(s).")
        expect(fakeMaster.restExchange.mock.calls[0]![0]).toMatchObject({ restType: "long", characterName: "Lyra", requesterUserId: t.player })

        // Recusa: o Maddox explica; o jogador pede de novo e depois conclui.
        script.exchange = async () => "Não dá: a regra do Mago só troca magias preparadas."
        await rest.submitRestExchange(t.id, String(message._id), t.lyra.characterId, "Quero trocar de subclasse.", t.player)
        await idle(t.id)
        expect(fakeMaster.restExchange.mock.calls[1]![0].thread).toHaveLength(2)
        await rest.finishRestExchange(t.id, String(message._id), t.lyra.characterId, false, t.player)
        expect((await entryOf(t, t.lyra.characterId)).exchange.status).toBe("done")
        await expect(rest.submitRestExchange(t.id, String(message._id), t.lyra.characterId, "mais uma", t.player)).rejects.toMatchObject({ code: "REST_PART_CLOSED" })
        await expect(rest.submitRestExchange(t.id, String(message._id), t.lyra.characterId, "da Lyra", t.owner)).rejects.toMatchObject({ status: 403 })
    })
})

describe("DND-58 — Personagem Opex no descanso", () => {
    it("o agente decide os dados de vida e as trocas; tudo é aplicado sem clique", { timeout: 30_000 }, async () => {
        opexAi.decide.mockImplementation(async (input) => (input.prompt.includes("o seu turno") ? { acao: "nada", texto: "", memorias: [] } : input.prompt.includes("resposta do Maddox") ? { resposta: null } : { dadosDeVida: 2, trocas: "Troco uma magia preparada.", memorias: [] }))
        script.exchange = async () => "Troca aceita."
        const t = await table({}, { opex: { hpCurrent: 1 } })
        dice.push(3, 3)
        const message = (await restTurn(t, { tipo: "curto", desfecho: "concluido", descricao: "Pausa." }))!
        const eco = await entryOf(t, t.opex!.characterId)
        expect(eco).toMatchObject({ opex: true, answeredBy: "player", hitDice: { status: "done" }, exchange: { status: "done" } })
        expect(eco.hitDice.rolls).toHaveLength(2)
        expect((await sheetOf(t.opex!.sheetId))!.hpCurrent).toBe(1 + 5 + 5)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: t.id, kind: "rest-request", characterId: t.opex!.characterId })).toBe(1)
        expect(String(message._id)).toBeTruthy()
    })

    it("o agente falha: a pergunta vai ao dono, que responde por ele (e não pela ficha dos outros)", { timeout: 30_000 }, async () => {
        opexAi.decide.mockImplementation(async (input) => {
            if (input.prompt.includes("o seu turno")) return { acao: "nada", texto: "", memorias: [] }
            throw new Error("O Personagem Opex não conseguiu decidir (resposta fora do formato).")
        })
        const t = await table({}, { opex: { hpCurrent: 1 } })
        const message = (await restTurn(t, { tipo: "curto", desfecho: "concluido", descricao: "Pausa." }))!
        const eco = await entryOf(t, t.opex!.characterId)
        expect(eco).toMatchObject({ answeredBy: "owner", hitDice: { status: "open" }, exchange: { status: "open" } })
        const ownerView = (await game.getGameState(t.id, t.owner)).messages.find((item) => item.kind === "rest")!.rest!
        expect(ownerView.characters.find((entry) => entry.name === "Eco")!.can).toMatchObject({ roll: true, exchange: true })
        await expect(rest.rollRestHitDie(t.id, String(message._id), t.opex!.characterId, t.player)).rejects.toMatchObject({ status: 403 })
        dice.push(4)
        await rest.rollRestHitDie(t.id, String(message._id), t.opex!.characterId, t.owner)
        expect((await sheetOf(t.opex!.sheetId))!.hpCurrent).toBe(7)
        await rest.finishRestExchange(t.id, String(message._id), t.opex!.characterId, true, t.owner)
        expect((await entryOf(t, t.opex!.characterId)).exchange.status).toBe("nothing")
    })
})

describe("DND-58 — exaustão pela ferramenta do Maddox", () => {
    it("aumenta e diminui com motivo, linha na mesa e auditoria; nível 6 mata o personagem", { timeout: 30_000 }, async () => {
        const t = await table({ player: { exhaustion: 4 } })
        const run = (input: Record<string, unknown>) => runMaddoxTool(findMaddoxTool("update_character_exhaustion")!, { campaignId: new Types.ObjectId(t.id), turnNumber: 2 }, input)
        expect(await run({ personagem: "Lyra", variacao: -1, motivo: "Uma boa refeição" })).toMatchObject({ saved: true, exaustao: 3, antes: 4 })
        expect(await run({ personagem: "Lyra", variacao: 3, motivo: "Marcha pelo deserto" })).toMatchObject({ exaustao: 6, morreu: true })
        expect((await sheetOf(t.lyra.sheetId))!.exhaustion).toBe(6)
        expect(await MaddoxCharacterModel.findById(t.lyra.characterId).lean()).toMatchObject({ status: "dead", currentState: "Morreu de exaustão." })
        const lines = await MaddoxCampaignMessageModel.find({ campaignId: t.id, kind: "sheet-change" }).sort({ _id: 1 }).lean()
        expect(lines.map((line) => line.content)).toEqual(["Exaustão de Lyra: 4 → 3 (Uma boa refeição)", "Exaustão de Lyra: 3 → 6 (Marcha pelo deserto)"])
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FichaPersonagem", depois: expect.objectContaining({ origin: "narrator-exhaustion", exhaustion: 6 }) }))
        await expect(run({ personagem: "Lyra", variacao: 1, motivo: "x" })).rejects.toThrow("está morto")
        await expect(run({ personagem: "Thorn", variacao: 0, motivo: "x" })).rejects.toThrow("Entrada inválida")
    })
})

describe("DND-58 — revisão: trocas só com a ficha preparada, falhas do Maddox e exaustão marcada na ficha", () => {
    it("trocas antes da ficha preparada: recusadas no servidor, sem botão na tela e sem a vez do Opex", { timeout: 30_000 }, async () => {
        opexAi.decide.mockImplementation(async (input) => (input.prompt.includes("o seu turno") ? { acao: "nada", texto: "", memorias: [] } : { dadosDeVida: 0, trocas: null, memorias: [] }))
        const t = await table({}, { opex: {} })
        const message = (await restTurn(t, { tipo: "longo", desfecho: "concluido", descricao: "Noite." }))!
        const collection = MaddoxCampaignMessageModel.collection
        const reopen = (characterId: string, prep: string) => collection.updateOne({ _id: message._id }, { $set: { "rest.characters.$[c].prep.status": prep, "rest.characters.$[c].exchange.status": "open" } }, { arrayFilters: [{ "c.characterId": new Types.ObjectId(characterId) }] })
        await reopen(t.lyra.characterId, "running")
        await expect(rest.submitRestExchange(t.id, String(message._id), t.lyra.characterId, "Troco uma magia.", t.player)).rejects.toMatchObject({ status: 409, code: "REST_PREP_PENDING" })
        const dto = (await game.getGameState(t.id, t.player)).messages.find((item) => item.kind === "rest")!.rest!
        expect(dto.characters.find((entry) => entry.name === "Lyra")!.can.exchange).toBe(false)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: t.id, kind: "rest-request" })).toBe(0)

        // O Opex também espera a ficha: com a preparação em curso, o agente não é chamado para o descanso.
        await reopen(t.opex!.characterId, "running")
        opexAi.decide.mockClear()
        await rest.scheduleOpexRests(new Types.ObjectId(t.id))
        await waitForCampaignIdle(t.id)
        expect(opexAi.decide.mock.calls.filter(([input]) => input.prompt.includes("descanso"))).toHaveLength(0)
        await reopen(t.opex!.characterId, "ready")
        await rest.scheduleOpexRests(new Types.ObjectId(t.id))
        await waitForCampaignIdle(t.id)
        expect(opexAi.decide).toHaveBeenCalled()
        expect((await entryOf(t, t.opex!.characterId)).exchange.status).toBe("nothing")
    })

    it("o Maddox falha ao avaliar a troca do Opex: a parte não fecha; o dono responde por ele", { timeout: 30_000 }, async () => {
        opexAi.decide.mockImplementation(async (input) => (input.prompt.includes("o seu turno") ? { acao: "nada", texto: "", memorias: [] } : { dadosDeVida: 0, trocas: "Troco Escudo por Mísseis.", memorias: [] }))
        script.exchange = async () => {
            throw new Error("tempo esgotado")
        }
        const t = await table({}, { opex: {} })
        await restTurn(t, { tipo: "longo", desfecho: "concluido", descricao: "Noite." })
        const eco = await entryOf(t, t.opex!.characterId)
        expect(eco).toMatchObject({ answeredBy: "owner", exchange: { status: "open", requests: 1 } })
        expect(eco.opexError).toContain("O Maddox não avaliou a troca")
        const ownerView = (await game.getGameState(t.id, t.owner)).messages.find((item) => item.kind === "rest")!.rest!
        expect(ownerView.characters.find((entry) => entry.name === "Eco")!.can.exchange).toBe(true)
        expect((await restOf(t)).rest!.status).toBe("running")
    })

    it("exaustão 6 marcada direto na ficha mata o personagem da campanha", { timeout: 30_000 }, async () => {
        const t = await table()
        const { patchSheetWithAccess, patchSheet } = await import("@/features/character-sheets/api/character-sheets-service")
        await patchSheet(t.lyra.sheetId, t.player, { exhaustion: 5 })
        expect((await MaddoxCharacterModel.findById(t.lyra.characterId).lean())!.status).toBe("active")
        await patchSheetWithAccess(t.lyra.sheetId, { exhaustion: 6 })
        expect(await MaddoxCharacterModel.findById(t.lyra.characterId).lean()).toMatchObject({ status: "dead", currentState: "Morreu de exaustão." })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "CampanhaMaddox", depois: expect.objectContaining({ cause: "exhaustion" }) }))
    })
})
