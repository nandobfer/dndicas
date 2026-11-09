import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { MaddoxAnswerContext, MaddoxMasterSink, MaddoxNarrationContext } from "@/features/maddox/server/game-master"
import type { AiStreamRequest } from "@/lib/ai/stream"

/**
 * Personagens Opex na mesa (DND-26), fora do combate tático: agem depois dos humanos, um de cada vez e na ordem de adição,
 * com até 3 perguntas ao mestre, antes da narração; "Ocultas" vale nos dois sentidos; falha do agente trava a mesa até o
 * dono escolher "Tentar de novo" ou "Pular". O mestre é falso (o narrador com IA é testado à parte); o modelo do Opex é o
 * `generateAiText` roteirizado.
 */

const recordAudit = vi.fn(async () => undefined)
const publishToChannels = vi.fn(async () => undefined)
const presence: { online: Set<string> | null } = { online: null }
const opexReplies: (string | Error)[] = []
const opexCalls: AiStreamRequest[] = []
const saveOpexCharacterMemories = vi.fn(async () => ({ saved: 1, pending: 0 }))

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
vi.mock("@/features/maddox/server/settings", async () => {
    const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
    const settings = { ...DEFAULT_MADDOX_SETTINGS, enabled: true, main: { ...DEFAULT_MADDOX_SETTINGS.main, provider: "gemini" as const, model: "gemini-pro" }, avatar: { url: "https://cdn/maddox.png", persona: "" } }
    return {
        loadMaddoxSettings: vi.fn(async () => ({ settings, isDefault: false, updatedAt: null })),
        maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
    }
})
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => (presence.online ? new Set(presence.online) : null)) }))
vi.mock("@/lib/ai/stream", () => ({
    generateAiText: vi.fn(async (request: AiStreamRequest) => {
        opexCalls.push(request)
        const next = opexReplies.shift() ?? JSON.stringify({ acao: "nada", texto: "" })
        if (next instanceof Error) throw next
        return { text: next, usage: null, durationMs: 1 }
    }),
}))
vi.mock("@/features/engramind/server/opex-characters", () => ({
    opexCharacterMemoryBlock: vi.fn(async () => "- Desconfio do mago."),
    saveOpexCharacterMemories,
    provisionOpexCharacterAgent: vi.fn(async () => true),
    retireOpexCharacterAgent: vi.fn(async () => undefined),
}))

const fakeMaster = {
    narrate: vi.fn(async (context: MaddoxNarrationContext, sink: MaddoxMasterSink) => {
        const lines = context.declarations.map((item) => (item.kind === "pass" ? `- ${item.characterName} esperou.` : `- ${item.characterName}: ${item.content}`))
        const text = context.declarations.length ? ["O Maddox narra:", ...lines].join("\n") : "Uma taverna em chamas. O que vocês fazem?"
        sink.delta(text)
        return text
    }),
    answer: vi.fn(async (context: MaddoxAnswerContext, sink: MaddoxMasterSink) => {
        const text = `Resposta para ${context.characterName}: ${context.question}`
        sink.delta(text)
        return text
    }),
}
vi.mock("@/features/maddox/server/game-master", () => ({ getMaddoxMaster: vi.fn(async () => fakeMaster) }))
const validateDeclaration = vi.fn<(input: { content: string }) => Promise<{ valid: boolean; reason: string }>>(async () => ({ valid: true, reason: "" }))
vi.mock("@/features/maddox/server/action-validation", () => ({ validateDeclaration }))

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const opex = await import("@/features/maddox/server/opex")
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { waitForOpexIdle } = await import("@/features/maddox/server/opex-runtime")
const { opexUserIdFor } = await import("@/features/maddox/server/opex-members")

let mongo: MongoMemoryServer

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** Espera a fila da campanha e as execuções dos Opex (o motor roda depois de cada mudança da mesa). */
async function settle(id: string) {
    for (let round = 0; round < 8; round++) {
        await waitForCampaignIdle(id)
        await waitForOpexIdle()
        await sleep(15)
    }
}

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

/** Personagem Opex já pronto (entrevista concluída), adicionado `minutesAgo` antes. */
async function addReadyOpex(campaignId: string, owner: string, name: string, minutesAgo: number, ready = true) {
    const _id = new mongoose.Types.ObjectId()
    const addedAt = new Date(Date.now() - minutesAgo * 60_000)
    const character = await MaddoxCharacterModel.create({ campaignId, memberId: _id, userId: opexUserIdFor(_id), name, interview: { status: ready ? "done" : "in-progress", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.create({ _id, campaignId, userId: opexUserIdFor(_id), kind: "opex", role: "player", status: "joined", joinedAt: addedAt, characterId: character._id, opex: { ownerUserId: owner, prompt: "", interviewMode: "autonomous", addedAt, run: null, engramind: null } })
    return String(_id)
}

async function table() {
    const owner = await seedUser("dono")
    const created = await campaigns.createCampaign({ name: "Brumas", rigor: "narrativo" }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", openingSituation: "Uma taverna em chamas." } })
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId: created.id, userId: owner }).lean()
    const character = await MaddoxCharacterModel.create({ campaignId: created.id, memberId: member!._id, userId: owner, name: "Kael", interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
    return { id: created.id, owner }
}

const declare = (id: string, json: Record<string, unknown>) => JSON.stringify(json)
const messagesOf = (id: string) => MaddoxCampaignMessageModel.find({ campaignId: id }).sort({ _id: 1 }).lean()

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_opex_table_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all([mongoose.connection.collection("users").deleteMany({}), MaddoxCampaignModel.deleteMany({}), MaddoxCampaignMemberModel.deleteMany({}), MaddoxCharacterModel.deleteMany({}), MaddoxCampaignMessageModel.deleteMany({})])
    presence.online = null
    opexReplies.length = 0
    opexCalls.length = 0
    fakeMaster.narrate.mockClear()
    fakeMaster.answer.mockClear()
    validateDeclaration.mockClear()
    saveOpexCharacterMemories.mockClear()
})

describe("Personagens Opex na mesa (DND-26)", () => {
    it("agem depois dos humanos, um de cada vez e na ordem de adição, antes da narração", async () => {
        const { id, owner } = await table()
        const second = await addReadyOpex(id, owner, "Brunna", 1)
        const first = await addReadyOpex(id, owner, "Tork", 10)
        await game.startCampaign(id, owner)
        await settle(id)
        const opened = await game.getGameState(id, owner)
        expect(opened.participants.filter((item) => item.opex).every((item) => item.eligible)).toBe(true)
        expect(opened.participants.find((item) => item.memberId === first)).toMatchObject({ opex: true, name: "Personagem Opex" })

        opexReplies.push(declare(id, { acao: "declarar", texto: "Ergo o escudo.", memorias: [{ titulo: "Confiança em Kael", texto: "Kael parece corajoso." }] }), declare(id, { acao: "declarar", texto: "Sigo o Tork." }))
        await game.submitGameAction(id, { kind: "declaration", content: "Abro a porta." }, owner)
        await settle(id)

        const messages = await messagesOf(id)
        const turn1 = messages.filter((message) => message.turnNumber === 1 && message.kind === "declaration")
        expect(turn1.map((message) => message.characterName)).toEqual(["Kael", "Tork", "Brunna"])
        expect(String(turn1[1]!.memberId)).toBe(first)
        expect(String(turn1[2]!.memberId)).toBe(second)
        // A segunda decisão já viu a declaração da primeira (sem "Ocultas").
        expect(opexCalls[1]!.prompt).toContain("Ergo o escudo.")
        const narration = messages.filter((message) => message.kind === "narration").at(-1)!
        expect(narration.turnNumber).toBe(2)
        expect(narration.content).toContain("Tork: Ergo o escudo.")
        expect(narration.content.indexOf("Tork")).toBeLessThan(narration.content.indexOf("Brunna"))
        expect(saveOpexCharacterMemories).toHaveBeenCalledWith(expect.objectContaining({ memberId: first }), [{ title: "Confiança em Kael", text: "Kael parece corajoso." }])
        const state = await game.getGameState(id, owner)
        expect(state.turn).toMatchObject({ number: 2, phase: "players", opexActor: null })
        expect(state.messages.find((message) => message.memberId === first && message.kind === "declaration")).toMatchObject({ opex: true })
    })

    it("faz até três perguntas ao mestre e espera cada resposta antes de declarar", async () => {
        const { id, owner } = await table()
        const opexId = await addReadyOpex(id, owner, "Tork", 5)
        await game.startCampaign(id, owner)
        await settle(id)
        opexReplies.push(
            declare(id, { acao: "perguntar", texto: "A porta tem tranca?" }),
            declare(id, { acao: "perguntar", texto: "Há guardas?" }),
            declare(id, { acao: "perguntar", texto: "Está escuro?" }),
            declare(id, { acao: "perguntar", texto: "Mais uma?" }),
        )
        await game.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "declaration", content: "Espero." }, owner).catch(() => undefined)
        await settle(id)
        const messages = await messagesOf(id)
        const questions = messages.filter((message) => message.kind === "question" && String(message.memberId) === opexId)
        expect(questions.map((message) => message.content)).toEqual(["A porta tem tranca?", "Há guardas?", "Está escuro?"])
        expect(fakeMaster.answer).toHaveBeenCalledTimes(3)
        // Cada resposta chegou ao Opex antes da decisão seguinte.
        expect(opexCalls[1]!.prompt).toContain("Resposta para Tork: A porta tem tranca?")
        expect(opexCalls[3]!.prompt).toContain("Você já usou as suas perguntas")
        // Sem declaração depois das perguntas: "não fez nada" e o turno segue.
        expect(messages.some((message) => message.kind === "pass" && String(message.memberId) === opexId)).toBe(true)
        expect(messages.filter((message) => message.kind === "narration")).toHaveLength(2)
    })

    it("mesa sem ação humana não avança sozinha, nem com Opex", async () => {
        const { id, owner } = await table()
        await addReadyOpex(id, owner, "Tork", 5)
        await game.startCampaign(id, owner)
        await settle(id)
        presence.online = new Set()
        await game.checkTurn(id, owner)
        await settle(id)
        expect(opexCalls).toHaveLength(0)
        expect((await game.getGameState(id, owner)).turn.number).toBe(1)
    })

    it("com \"Ocultas\", os humanos não veem o texto do Opex e o Opex não recebe o texto dos outros", async () => {
        const { id, owner } = await table()
        const opexId = await addReadyOpex(id, owner, "Tork", 5)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { hidePlayerActions: true } })
        await game.startCampaign(id, owner)
        await settle(id)
        opexReplies.push(declare(id, { acao: "declarar", texto: "Roubo a bolsa do Kael em segredo." }))
        await game.submitGameAction(id, { kind: "declaration", content: "Escondo o mapa no forro do manto." }, owner)
        await settle(id)
        expect(opexCalls[0]!.prompt).not.toContain("Escondo o mapa")
        const state = await game.getGameState(id, owner)
        const hidden = state.messages.find((message) => message.memberId === opexId && message.kind === "declaration")
        expect(hidden).toMatchObject({ content: "", hiddenAction: true, opex: true })
        // O narrador continua recebendo o texto completo.
        expect(fakeMaster.narrate.mock.calls.at(-1)![0].declarations.map((item: { content: string }) => item.content)).toContain("Roubo a bolsa do Kael em segredo.")
    })

    it("valida a declaração no Rigoroso: recusada volta ao Opex com o motivo e, depois de 2 recusas, vira \"não fez nada\"", async () => {
        const { id, owner } = await table()
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { rigor: "rigoroso" } })
        const opexId = await addReadyOpex(id, owner, "Tork", 5)
        await game.startCampaign(id, owner)
        await settle(id)
        validateDeclaration.mockImplementation(async (input) => (input.content.includes("voo") ? { valid: false, reason: "Tork não sabe voar." } : { valid: true, reason: "" }))
        opexReplies.push(declare(id, { acao: "declarar", texto: "Saio em voo." }), declare(id, { acao: "declarar", texto: "Outro voo." }), declare(id, { acao: "declarar", texto: "Um voo final." }))
        await game.submitGameAction(id, { kind: "declaration", content: "Abro a porta." }, owner)
        await settle(id)
        expect(opexCalls[1]!.prompt).toContain("Tork não sabe voar.")
        const messages = await messagesOf(id)
        expect(messages.some((message) => message.kind === "pass" && String(message.memberId) === opexId)).toBe(true)
        validateDeclaration.mockImplementation(async () => ({ valid: true, reason: "" }))
    })

    it("falha do agente trava a mesa até o dono escolher; \"Tentar de novo\" age e \"Pular\" registra \"não fez nada\"", async () => {
        const { id, owner } = await table()
        const opexId = await addReadyOpex(id, owner, "Tork", 5)
        await game.startCampaign(id, owner)
        await settle(id)
        opexReplies.push(new Error("provedor fora"), new Error("provedor fora"))
        await game.submitGameAction(id, { kind: "declaration", content: "Abro a porta." }, owner)
        await settle(id)
        let state = await game.getGameState(id, owner)
        expect(state.turn).toMatchObject({ number: 1, phase: "players", opexActor: { memberId: opexId, failed: true, combat: false } })
        expect(state.turn.opexActor!.error).toContain("provedor fora")
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "narration" })).toBe(1)

        // Só o dono decide.
        const player = await seedUser("jogador")
        await campaigns.joinByInvite((await campaigns.getInviteLink(id, owner)).token, player)
        await expect(opex.retryOpexTableAction(id, opexId, player)).rejects.toMatchObject({ status: 403 })

        opexReplies.push(declare(id, { acao: "declarar", texto: "Agora vai." }))
        await opex.retryOpexTableAction(id, opexId, owner)
        await settle(id)
        state = await game.getGameState(id, owner)
        expect(state.turn.number).toBe(2)
        expect((await messagesOf(id)).some((message) => message.content === "Agora vai.")).toBe(true)

        // Turno 2: falha de novo e o dono pula.
        opexReplies.push(new Error("caiu"), new Error("caiu"))
        await game.submitGameAction(id, { kind: "declaration", content: "Sigo." }, owner)
        await settle(id)
        expect((await game.getGameState(id, owner)).turn.opexActor).toMatchObject({ failed: true })
        await opex.skipOpexTableAction(id, opexId, owner)
        await settle(id)
        state = await game.getGameState(id, owner)
        expect(state.turn.number).toBe(3)
        expect((await messagesOf(id)).some((message) => message.kind === "pass" && message.turnNumber === 2 && String(message.memberId) === opexId && message.skippedBy === owner)).toBe(true)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ personagemOpex: opexId, mesa: "pulado" }) }))
    })

    it("humano que ainda não agiu fica bloqueado enquanto os Opex agem (OPEX_TURN)", async () => {
        const { id, owner } = await table()
        const player = await seedUser("jogador")
        await campaigns.joinByInvite((await campaigns.getInviteLink(id, owner)).token, player)
        const member = await MaddoxCampaignMemberModel.findOne({ campaignId: id, userId: player }).lean()
        const character = await MaddoxCharacterModel.create({ campaignId: id, memberId: member!._id, userId: player, name: "Lyra", interview: { status: "done", scriptVersion: 0 } })
        await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
        await addReadyOpex(id, owner, "Tork", 5)
        await game.startCampaign(id, owner)
        await settle(id)
        presence.online = new Set([owner])
        opexReplies.push(new Error("parado"), new Error("parado"))
        await game.submitGameAction(id, { kind: "declaration", content: "Abro a porta." }, owner)
        await settle(id)
        await expect(game.submitGameAction(id, { kind: "declaration", content: "Cheguei!" }, player)).rejects.toMatchObject({ status: 409, code: "OPEX_TURN" })
    })

    it("Opex com a entrevista pendente não bloqueia e não joga; remover o Opex da vez libera a mesa", async () => {
        const { id, owner } = await table()
        const pending = await addReadyOpex(id, owner, "Novato", 1, false)
        const opexId = await addReadyOpex(id, owner, "Tork", 5)
        await game.startCampaign(id, owner)
        await settle(id)
        const opened = await game.getGameState(id, owner)
        expect(opened.participants.find((item) => item.memberId === pending)).toMatchObject({ eligible: false, ready: false })
        opexReplies.push(new Error("x"), new Error("x"))
        await game.submitGameAction(id, { kind: "declaration", content: "Abro a porta." }, owner)
        await settle(id)
        expect((await game.getGameState(id, owner)).turn.opexActor).toMatchObject({ memberId: opexId, failed: true })
        await campaigns.removeMember(id, opexId, owner)
        await settle(id)
        const state = await game.getGameState(id, owner)
        expect(state.turn.number).toBe(2)
        expect(state.participants.some((item) => item.memberId === opexId)).toBe(false)
    })
})
