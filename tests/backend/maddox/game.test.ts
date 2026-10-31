import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import type { MaddoxAnswerContext, MaddoxMasterSink, MaddoxNarrationContext } from "@/features/maddox/server/game-master"
import { MongoMemoryServer } from "mongodb-memory-server"

const recordAudit = vi.fn(async () => undefined)
const publishToChannels = vi.fn(async () => undefined)
const presence: { online: Set<string> | null } = { online: null }

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: { enabled: true, avatar: { url: "https://cdn/maddox.png" } }, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => (presence.online ? new Set(presence.online) : null)) }))

/** Mestre falso (o narrador com IA é testado à parte): textos determinísticos a partir do banco e das declarações. */
const fakeMaster = {
    narrate: vi.fn(async (context: MaddoxNarrationContext, sink: MaddoxMasterSink) => {
        const { MaddoxCampaignModel: Campaigns } = await import("@/features/maddox/models")
        const campaign = await Campaigns.findById(context.campaignId).lean()
        const lines = context.declarations.map((item) => (item.kind === "pass" ? `- **${item.characterName}** preferiu esperar.` : `- **${item.characterName}** — “${item.content}”`))
        const text = context.declarations.length ? ["O Maddox ouve a mesa:", ...lines, "O que vocês fazem?"].join("\n") : `${campaign?.openingSituation ?? ""}\n\nO que vocês fazem?`
        sink.delta(text)
        return text
    }),
    answer: vi.fn(async (context: MaddoxAnswerContext, sink: MaddoxMasterSink) => {
        const text = `Sobre “${context.question}”: o Maddox responde.`
        sink.delta(text)
        return text
    }),
}
vi.mock("@/features/maddox/server/game-master", () => ({ getMaddoxMaster: vi.fn(async () => fakeMaster) }))
// Teto curto de duração das gerações do mestre para o teste do mestre que nunca responde.
vi.mock("@/features/maddox/constants", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/constants")>()), MADDOX_MASTER_GENERATION_TIMEOUT_MS: 300 }))
const validateDeclaration = vi.fn<(input: unknown) => Promise<{ valid: boolean; reason: string }>>(async () => ({ valid: true, reason: "" }))
vi.mock("@/features/maddox/server/action-validation", () => ({ validateDeclaration }))

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const { MADDOX_MASTER_LOCK_STALE_MS, MADDOX_MASTER_RETRY_MS } = await import("@/features/maddox/constants")
const { subscribeGameLive, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")

/** As gerações do mestre rodam em segundo plano: espera a fila da campanha e devolve o estado atualizado. */
async function settle<T>(id: string, userId: string, action: Promise<T>) {
    await action
    await waitForCampaignIdle(id)
    return game.getGameState(id, userId)
}
const g = {
    startCampaign: (id: string, userId: string) => settle(id, userId, game.startCampaign(id, userId)),
    submitGameAction: (id: string, input: Parameters<typeof game.submitGameAction>[1], userId: string) => settle(id, userId, game.submitGameAction(id, input, userId)),
    skipPlayer: (id: string, input: Parameters<typeof game.skipPlayer>[1], userId: string) => settle(id, userId, game.skipPlayer(id, input, userId)),
    checkTurn: (id: string, userId: string) => settle(id, userId, game.checkTurn(id, userId)),
    getGameState: (id: string, userId: string) => settle(id, userId, game.getGameState(id, userId)),
}

let mongo: MongoMemoryServer

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

/** Personagem com a entrevista concluída (`ready`) ou ainda pendente. */
async function giveCharacter(campaignId: string, userId: string, name: string, ready = true) {
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const character = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name, interview: { status: ready ? "done" : "pending", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
    return { memberId: String(member!._id), characterId: String(character._id) }
}

const finishInterview = (characterId: string) => MaddoxCharacterModel.updateOne({ _id: characterId }, { $set: { "interview.status": "done" } })

/** Campanha com o cenário pronto, o dono e `players - 1` jogadores prontos (todos com personagem). */
async function table(players: number) {
    const owner = await seedUser("dono")
    const created = await campaigns.createCampaign({ name: "Brumas", rigor: "narrativo" }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", openingSituation: "Uma taverna em chamas." } })
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const users = [owner]
    for (let index = 1; index < players; index++) {
        const userId = await seedUser(`jogador${index}`)
        await campaigns.joinByInvite(token, userId)
        users.push(userId)
    }
    const seats = []
    for (const [index, userId] of users.entries()) seats.push({ userId, ...(await giveCharacter(created.id, userId, `Herói ${index}`)) })
    return { id: created.id, owner, token, seats }
}

const narrations = (campaignId: string) => MaddoxCampaignMessageModel.countDocuments({ campaignId, kind: "narration" })
const declare = (id: string, userId: string, content = "Abro a porta.") => g.submitGameAction(id, { kind: "declaration", content }, userId)

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_game_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all([
        mongoose.connection.collection("users").deleteMany({}),
        MaddoxCampaignModel.deleteMany({}),
        MaddoxCampaignMemberModel.deleteMany({}),
        MaddoxCharacterModel.deleteMany({}),
        MaddoxCampaignMessageModel.deleteMany({}),
    ])
    presence.online = null
    recordAudit.mockClear()
    publishToChannels.mockClear()
    fakeMaster.narrate.mockClear()
    fakeMaster.answer.mockClear()
    validateDeclaration.mockClear()
})

describe("Maddox 3 — iniciar a campanha", () => {
    it("o dono inicia: campanha em andamento, abertura do Maddox e turno dos jogadores com todos os prontos", async () => {
        const { id, owner, seats } = await table(2)
        const state = await g.startCampaign(id, owner)
        expect(state).toMatchObject({ status: "active", turn: { number: 1, phase: "players", generating: false }, maddoxAvatarUrl: "https://cdn/maddox.png" })
        expect(state.messages).toHaveLength(1)
        expect(state.messages[0]).toMatchObject({ kind: "narration", turnNumber: 1 })
        expect(state.messages[0]!.content).toContain("Uma taverna em chamas.")
        expect(state.participants.every((participant) => participant.eligible)).toBe(true)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "CampanhaMaddox", depois: { status: "active", turn: 1 } }))
        expect(publishToChannels).toHaveBeenCalledWith(expect.arrayContaining(seats.map((seat) => `private-maddox-u-${seat.userId}`)), "maddox.game.changed", expect.objectContaining({ campaignId: id }))
        const detail = await campaigns.getCampaignDetail(id, owner)
        expect(detail).toMatchObject({ status: "active", turnNumber: 1, turnPhase: "players" })
    })

    it("só o dono inicia; exige o cenário e a própria entrevista; não inicia duas vezes", async () => {
        const { id, owner, seats } = await table(2)
        await expect(g.startCampaign(id, seats[1]!.userId)).rejects.toMatchObject({ status: 403 })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "scenarioInterview.status": "in-progress" } })
        await expect(g.startCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "SCENARIO_PENDING" })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "scenarioInterview.status": "done" } })
        await MaddoxCharacterModel.updateOne({ _id: seats[0]!.characterId }, { $set: { "interview.status": "in-progress" } })
        await expect(g.startCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "INTERVIEW_REQUIRED" })
        await finishInterview(seats[0]!.characterId)
        await g.startCampaign(id, owner)
        await expect(g.startCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_ALREADY_STARTED" })
        expect(await narrations(id)).toBe(1)
    })

    it("quem não participa recebe 404 na mesa", async () => {
        const { id, owner } = await table(1)
        await g.startCampaign(id, owner)
        const stranger = await seedUser("estranho")
        await expect(g.getGameState(id, stranger)).rejects.toMatchObject({ status: 404 })
        await expect(declare(id, stranger)).rejects.toMatchObject({ status: 404 })
    })
})

describe("Maddox 3 — troca de turno", () => {
    it.each([1, 2, 5])("com %i jogador(es), o turno só passa ao mestre quando todos declaram", async (players) => {
        const { id, owner, seats } = await table(players)
        await g.startCampaign(id, owner)
        for (const [index, seat] of seats.entries()) {
            const state = await declare(id, seat.userId, `Ação ${index}`)
            if (index < seats.length - 1) {
                expect(state.turn).toMatchObject({ number: 1, phase: "players" })
                expect(await narrations(id)).toBe(1)
            } else {
                expect(state.turn).toMatchObject({ number: 2, phase: "players" })
            }
        }
        expect(await narrations(id)).toBe(2)
        const last = await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "narration", turnNumber: 2 }).lean()
        for (const index of seats.keys()) expect(last!.content).toContain(`Ação ${index}`)
        const state = await g.getGameState(id, owner)
        expect(state.participants.every((participant) => participant.eligible && !participant.declared)).toBe(true)
    })

    it('"Não fazer nada" conta como declaração', async () => {
        const { id, owner, seats } = await table(2)
        await g.startCampaign(id, owner)
        await g.submitGameAction(id, { kind: "pass" }, seats[0]!.userId)
        const state = await g.submitGameAction(id, { kind: "pass" }, seats[1]!.userId)
        expect(state.turn).toMatchObject({ number: 2, phase: "players" })
        const narration = await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "narration", turnNumber: 2 }).lean()
        expect(narration!.content).toContain("preferiu esperar")
    })

    it("pergunta ao mestre é respondida e não encerra o turno, mesmo depois de declarar", async () => {
        const { id, owner, seats } = await table(2)
        await g.startCampaign(id, owner)
        let state = await g.submitGameAction(id, { kind: "question", content: "Há guardas na porta?" }, seats[0]!.userId)
        expect(state.turn).toMatchObject({ number: 1, phase: "players" })
        const question = state.messages.find((message) => message.kind === "question")!
        const answer = state.messages.find((message) => message.kind === "answer")!
        expect(question).toMatchObject({ content: "Há guardas na porta?", characterName: "Herói 0" })
        expect(answer.replyToId).toBe(question.id)
        expect(answer.content).toContain("Há guardas na porta?")
        await declare(id, seats[0]!.userId)
        state = await g.submitGameAction(id, { kind: "question", content: "E agora?" }, seats[0]!.userId)
        expect(state.turn.phase).toBe("players")
        expect(state.me.declared).toBe(true)
        expect(await narrations(id)).toBe(1)
    })

    it("não declara duas vezes no mesmo turno nem no turno do mestre", async () => {
        const { id, owner, seats } = await table(2)
        await g.startCampaign(id, owner)
        await declare(id, seats[0]!.userId)
        await expect(declare(id, seats[0]!.userId)).rejects.toMatchObject({ status: 409, code: "ALREADY_DECLARED" })
        await expect(g.submitGameAction(id, { kind: "pass" }, seats[0]!.userId)).rejects.toMatchObject({ code: "ALREADY_DECLARED" })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "master", "turn.generating": { token: "x", startedAt: new Date() } } })
        await expect(declare(id, seats[1]!.userId)).rejects.toMatchObject({ status: 409, code: "MASTER_TURN" })
    })

    it("as duas últimas declarações simultâneas geram uma única narração", async () => {
        const { id, owner, seats } = await table(3)
        await g.startCampaign(id, owner)
        await declare(id, seats[0]!.userId)
        await Promise.all([declare(id, seats[1]!.userId), declare(id, seats[2]!.userId), g.checkTurn(id, owner)])
        expect(await narrations(id)).toBe(2)
        const stored = await MaddoxCampaignModel.findById(id).lean()
        expect(stored!.turn).toMatchObject({ number: 2, phase: "players" })
    })

    it("membro sem a entrevista concluída não joga (assertMemberCanPlay)", async () => {
        const { id, owner, token } = await table(1)
        await g.startCampaign(id, owner)
        const late = await seedUser("atrasado")
        await campaigns.joinByInvite(token, late)
        await giveCharacter(id, late, "Novato", false)
        await expect(declare(id, late)).rejects.toMatchObject({ status: 409, code: "INTERVIEW_REQUIRED" })
        const state = await g.getGameState(id, late)
        expect(state.me).toMatchObject({ ready: false, eligible: false })
    })
})

describe("Maddox 3 — entrada no meio da campanha", () => {
    it("quem fica pronto durante o turno entra no próximo; o turno fecha sem ele", async () => {
        const { id, owner, token, seats } = await table(2)
        await g.startCampaign(id, owner)
        const late = await seedUser("atrasado")
        await campaigns.joinByInvite(token, late)
        const lateSeat = await giveCharacter(id, late, "Novato", false)
        await finishInterview(lateSeat.characterId)

        await expect(declare(id, late)).rejects.toMatchObject({ status: 409, code: "NEXT_TURN" })
        await expect(g.submitGameAction(id, { kind: "question", content: "Posso entrar?" }, late)).rejects.toMatchObject({ code: "NEXT_TURN" })
        await declare(id, seats[0]!.userId)
        const state = await declare(id, seats[1]!.userId)
        expect(state.turn).toMatchObject({ number: 2, phase: "players" })
        expect(state.participants.find((participant) => participant.userId === late)).toMatchObject({ eligible: true, declared: false })

        await declare(id, seats[0]!.userId)
        expect((await declare(id, seats[1]!.userId)).turn.number).toBe(2)
        expect((await declare(id, late, "Chego à taverna.")).turn.number).toBe(3)
    })

    it("se todos os elegíveis saíram, quem ficar pronto entra no turno atual", async () => {
        const { id, owner, seats } = await table(2)
        await g.startCampaign(id, owner)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.eligibleMemberIds": [] } })
        const state = await g.getGameState(id, seats[1]!.userId)
        expect(state.me.eligible).toBe(true)
        expect(state.participants.every((participant) => participant.eligible)).toBe(true)
    })
})

describe("Maddox 3 — presença", () => {
    it("elegível offline não trava o turno; quem volta online passa a contar", async () => {
        const { id, owner, seats } = await table(3)
        await g.startCampaign(id, owner)
        presence.online = new Set([seats[0]!.userId, seats[1]!.userId])
        await declare(id, seats[0]!.userId)
        presence.online.add(seats[2]!.userId)
        let state = await declare(id, seats[1]!.userId)
        expect(state.turn).toMatchObject({ number: 1, phase: "players" })
        presence.online.delete(seats[2]!.userId)
        state = await g.checkTurn(id, seats[0]!.userId)
        expect(state.turn).toMatchObject({ number: 2, phase: "players" })
    })

    it("todos offline e nenhuma declaração: o turno não fecha sozinho", async () => {
        const { id, owner } = await table(2)
        await g.startCampaign(id, owner)
        presence.online = new Set()
        const state = await g.checkTurn(id, owner)
        expect(state.turn).toMatchObject({ number: 1, phase: "players" })
    })

    it("presença desconhecida (Pusher indisponível) exige todos os elegíveis", async () => {
        const { id, owner, seats } = await table(2)
        await g.startCampaign(id, owner)
        presence.online = null
        const state = await declare(id, seats[0]!.userId)
        expect(state.turn).toMatchObject({ number: 1, phase: "players" })
    })
})

describe("Maddox 3 — dono pula jogador e saídas", () => {
    it("o dono pula a vez de um jogador ausente (auditado) e o turno fecha", async () => {
        const { id, owner, seats } = await table(2)
        await g.startCampaign(id, owner)
        await declare(id, owner)
        await expect(g.skipPlayer(id, { memberId: seats[0]!.memberId }, seats[1]!.userId)).rejects.toMatchObject({ status: 403 })
        await expect(g.skipPlayer(id, { memberId: seats[0]!.memberId }, owner)).rejects.toMatchObject({ status: 409, code: "ALREADY_DECLARED" })
        const state = await g.skipPlayer(id, { memberId: seats[1]!.memberId }, owner)
        expect(state.turn.number).toBe(2)
        const pass = state.messages.find((message) => message.kind === "pass")!
        expect(pass).toMatchObject({ memberId: seats[1]!.memberId, skippedByName: "DONO" })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: { turn: 1, skipped: seats[1]!.userId } }))
    })

    it("pular jogador inexistente responde 404", async () => {
        const { id, owner } = await table(1)
        await g.startCampaign(id, owner)
        await expect(g.skipPlayer(id, { memberId: "nao-e-id" }, owner)).rejects.toMatchObject({ status: 404 })
        await expect(g.skipPlayer(id, { memberId: String(new mongoose.Types.ObjectId()) }, owner)).rejects.toMatchObject({ status: 404 })
    })

    it("falha ao reavaliar o turno não desfaz a saída: auditoria e aviso já foram feitos", async () => {
        const { id, owner, seats } = await table(2)
        await g.startCampaign(id, owner)
        recordAudit.mockClear()
        publishToChannels.mockClear()
        // A reavaliação do turno (`$pull` dos elegíveis) falha; o resto do banco segue normal.
        const original = MaddoxCampaignModel.updateOne.bind(MaddoxCampaignModel)
        const spy = vi.spyOn(MaddoxCampaignModel, "updateOne").mockImplementation(((filter: never, update: Record<string, unknown>, options?: never) =>
            update && "$pull" in update ? Promise.reject(new Error("banco indisponível")) : original(filter, update as never, options)) as never)
        await expect(campaigns.removeMember(id, seats[1]!.memberId, seats[1]!.userId)).resolves.toEqual({ left: true })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: { member: seats[1]!.userId, status: "left" } }))
        expect(publishToChannels).toHaveBeenCalledWith(expect.arrayContaining([`private-maddox-u-${seats[1]!.userId}`]), "maddox.campaign.changed", { campaignId: id })
        expect(spy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $pull: expect.anything() }))
        spy.mockRestore()
        expect((await MaddoxCampaignMemberModel.findById(seats[1]!.memberId).lean())!.status).toBe("left")
    })

    it("jogador que sai no meio do turno deixa de contar e o turno fecha", async () => {
        const { id, owner, seats } = await table(3)
        await g.startCampaign(id, owner)
        await declare(id, seats[0]!.userId)
        await declare(id, seats[1]!.userId)
        await campaigns.removeMember(id, seats[2]!.memberId, seats[2]!.userId)
        const state = await g.getGameState(id, owner)
        expect(state.turn).toMatchObject({ number: 2, phase: "players" })
        expect(state.participants).toHaveLength(2)
    })
})

describe("Maddox 3 — turno do mestre interrompido", () => {
    it("trava velha do mestre é retomada ao abrir a mesa, sem duplicar a narração", async () => {
        const { id, owner, seats } = await table(1)
        await g.startCampaign(id, owner)
        await MaddoxCampaignModel.updateOne(
            { _id: id },
            { $set: { "turn.number": 2, "turn.phase": "master", "turn.generating": { token: "morto", startedAt: new Date(Date.now() - MADDOX_MASTER_LOCK_STALE_MS - 1000) } } },
        )
        const fresh = await MaddoxCampaignModel.findById(id).lean()
        expect(fresh!.turn.phase).toBe("master")
        const state = await g.getGameState(id, seats[0]!.userId)
        expect(state.turn).toMatchObject({ number: 2, phase: "players", generating: false })
        expect(await narrations(id)).toBe(2)
        await g.getGameState(id, owner)
        expect(await narrations(id)).toBe(2)
    })

    it("falha do mestre libera a trava sem avisar a mesa; a retomada espera o intervalo e narra uma única vez", async () => {
        const { id, owner } = await table(1)
        await g.startCampaign(id, owner)
        fakeMaster.narrate.mockClear()
        const narrate = fakeMaster.narrate.mockRejectedValueOnce(new Error("provedor fora do ar"))
        publishToChannels.mockClear()
        let state = await declare(id, owner)
        expect(state.turn).toMatchObject({ number: 2, phase: "master", generating: false })
        let stored = await MaddoxCampaignModel.findById(id).lean()
        expect(stored!.turn.generating).toBeNull()
        expect(stored!.turn.failedAt).toBeInstanceOf(Date)
        expect(await narrations(id)).toBe(1)
        // Depois da falha nenhum aviso: os clientes não recarregam em laço.
        const publishesAfterClose = publishToChannels.mock.calls.length
        expect(narrate).toHaveBeenCalledTimes(1)

        // Dentro do intervalo, abrir a mesa ou reavaliar não tenta de novo.
        state = await g.getGameState(id, owner)
        await g.checkTurn(id, owner)
        expect(state.turn).toMatchObject({ number: 2, phase: "master" })
        expect(narrate).toHaveBeenCalledTimes(1)
        expect(publishToChannels.mock.calls.length).toBe(publishesAfterClose)

        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.failedAt": new Date(Date.now() - MADDOX_MASTER_RETRY_MS - 1000) } })
        state = await g.getGameState(id, owner)
        expect(state.turn).toMatchObject({ number: 2, phase: "players", generating: false })
        expect(await narrations(id)).toBe(2)
        stored = await MaddoxCampaignModel.findById(id).lean()
        expect(stored!.turn.failedAt).toBeNull()
        await g.getGameState(id, owner)
        expect(await narrations(id)).toBe(2)
    })

    it("falha ao gravar a narração também deixa o turno no mestre, sem narração órfã", async () => {
        const { id, owner } = await table(1)
        await g.startCampaign(id, owner)
        const original = MaddoxCampaignMessageModel.create.bind(MaddoxCampaignMessageModel)
        const create = vi.spyOn(MaddoxCampaignMessageModel, "create").mockImplementation(((doc: { kind?: string }) =>
            doc?.kind === "narration" ? Promise.reject(new Error("banco indisponível")) : original(doc as never)) as never)
        const state = await declare(id, owner)
        create.mockRestore()
        expect(state.turn).toMatchObject({ number: 2, phase: "master", generating: false })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "narration", turnNumber: 2 })).toBe(0)
    })

    it("trava recente não é retomada", async () => {
        const { id, owner } = await table(1)
        await g.startCampaign(id, owner)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.number": 2, "turn.phase": "master", "turn.generating": { token: "vivo", startedAt: new Date() } } })
        const state = await g.getGameState(id, owner)
        expect(state.turn).toMatchObject({ number: 2, phase: "master", generating: true })
    })
})

describe("Maddox 3 — paginação", () => {
    it("lista as mensagens anteriores pelo cursor", async () => {
        const { id, owner } = await table(1)
        await g.startCampaign(id, owner)
        for (let turn = 0; turn < 3; turn++) await declare(id, owner, `Ação ${turn}`)
        const state = await g.getGameState(id, owner)
        expect(state.hasMore).toBe(false)
        const page = await game.listGameMessages(id, state.messages[2]!.id, owner)
        expect(page.messages.map((message) => message.id)).toEqual(state.messages.slice(0, 2).map((message) => message.id))
        await expect(game.listGameMessages(id, "ruim", owner)).rejects.toMatchObject({ status: 400 })
    })
})

/** Promessa controlada pelo teste (segura uma geração do mestre no meio). */
function gate() {
    let open!: () => void
    const promise = new Promise<void>((resolve) => (open = resolve))
    return { promise, open }
}

describe("Maddox 4 — mestre em segundo plano e streaming", () => {
    it("iniciar responde logo no turno do mestre; a narração chega pelo barramento a quem assiste e o turno abre depois", async () => {
        const { id, owner } = await table(2)
        const lines: { type: string; text?: string; messageId?: string | null }[] = []
        const unsubscribe = subscribeGameLive(id, (line) => lines.push(line as never))
        const hold = gate()
        fakeMaster.narrate.mockImplementationOnce(async (_context, sink) => {
            sink.delta("A taverna ")
            sink.tool(true)
            await hold.promise
            sink.tool(false)
            sink.delta("arde.")
            return "A taverna arde."
        })
        const started = await game.startCampaign(id, owner)
        expect(started.turn).toMatchObject({ number: 1, phase: "master", generating: true })
        hold.open()
        await waitForCampaignIdle(id)
        unsubscribe()
        const state = await game.getGameState(id, owner)
        expect(state.turn).toMatchObject({ number: 1, phase: "players", generating: false, failed: false })
        const narration = state.messages.find((message) => message.kind === "narration")!
        expect(narration.content).toBe("A taverna arde.")
        expect(lines.map((line) => line.type)).toEqual(["live-start", "delta", "tool", "tool", "delta", "live-end"])
        expect(lines.filter((line) => line.type === "delta").map((line) => line.text).join("")).toBe("A taverna arde.")
        expect(lines.at(-1)).toMatchObject({ type: "live-end", messageId: narration.id, error: null })
    })

    it("pergunta: grava a pergunta, responde em segundo plano sem mudar o turno e liga a resposta", async () => {
        const { id, owner, seats } = await table(2)
        await g.startCampaign(id, owner)
        const immediate = await game.submitGameAction(id, { kind: "question", content: "Há guardas?" }, seats[1]!.userId)
        expect(immediate.messages.some((message) => message.kind === "question")).toBe(true)
        await waitForCampaignIdle(id)
        const state = await game.getGameState(id, owner)
        const question = state.messages.find((message) => message.kind === "question")!
        const answer = state.messages.find((message) => message.kind === "answer")!
        expect(answer).toMatchObject({ replyToId: question.id, error: null })
        expect(answer.content).toContain("Há guardas?")
        expect(state.turn).toMatchObject({ number: 1, phase: "players" })
        expect(fakeMaster.answer).toHaveBeenCalledWith(expect.objectContaining({ campaignId: id, turnNumber: 1, questionId: question.id, characterName: "Herói 1" }), expect.anything())
    })

    it("falha ao responder grava a resposta com o aviso em pt-BR, sem travar o turno", async () => {
        const { id, owner, seats } = await table(1)
        await g.startCampaign(id, owner)
        fakeMaster.answer.mockRejectedValueOnce(new Error("provedor fora do ar"))
        const state = await g.submitGameAction(id, { kind: "question", content: "E agora?" }, seats[0]!.userId)
        const answer = state.messages.find((message) => message.kind === "answer")!
        expect(answer).toMatchObject({ content: "", error: "O Maddox não conseguiu responder agora. Pergunte de novo." })
        expect(state.turn.phase).toBe("players")
    })

    it("uma geração por vez por campanha: a narração espera a resposta em andamento", async () => {
        const { id, owner, seats } = await table(1)
        await g.startCampaign(id, owner)
        let running = 0
        let peak = 0
        const track = async <T,>(value: T) => {
            running += 1
            peak = Math.max(peak, running)
            await new Promise((resolve) => setTimeout(resolve, 30))
            running -= 1
            return value
        }
        fakeMaster.answer.mockImplementationOnce(async () => track("Resposta."))
        fakeMaster.narrate.mockImplementationOnce(async () => track("Narração."))
        await game.submitGameAction(id, { kind: "question", content: "Pergunta?" }, seats[0]!.userId)
        await game.submitGameAction(id, { kind: "declaration", content: "Ajo." }, seats[0]!.userId)
        await waitForCampaignIdle(id)
        expect(peak).toBe(1)
        const state = await game.getGameState(id, owner)
        expect(state.turn).toMatchObject({ number: 2, phase: "players" })
        const kinds = state.messages.map((message) => message.kind)
        expect(kinds.indexOf("answer")).toBeLessThan(kinds.lastIndexOf("narration"))
    })

    it("trava velha não é retomada enquanto a geração ainda roda neste processo (sem narração duplicada)", async () => {
        const { id, owner } = await table(1)
        const hold = gate()
        fakeMaster.narrate.mockImplementationOnce(async () => {
            await hold.promise
            return "Abertura."
        })
        await game.startCampaign(id, owner)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.generating.startedAt": new Date(Date.now() - MADDOX_MASTER_LOCK_STALE_MS - 1000) } })
        const state = await game.getGameState(id, owner)
        expect(state.turn).toMatchObject({ phase: "master", generating: true })
        hold.open()
        await waitForCampaignIdle(id)
        expect(fakeMaster.narrate).toHaveBeenCalledTimes(1)
        expect(await narrations(id)).toBe(1)
    })

    it("mestre que nunca responde: o teto de duração aborta a geração, libera a trava e a fila volta a andar", async () => {
        const { id, owner, seats } = await table(1)
        let aborted: AbortSignal | undefined
        fakeMaster.narrate.mockImplementationOnce(async (context: MaddoxNarrationContext) => {
            aborted = context.signal
            return new Promise<string>(() => undefined)
        })
        const lines: { type: string; error?: string | null }[] = []
        const unsubscribe = subscribeGameLive(id, (line) => lines.push(line as never))
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        unsubscribe()
        expect(aborted?.aborted).toBe(true)
        const stored = await MaddoxCampaignModel.findById(id).lean()
        expect(stored!.turn).toMatchObject({ phase: "master", generating: null })
        expect(stored!.turn.failedAt).toBeInstanceOf(Date)
        expect(lines.at(-1)).toMatchObject({ type: "live-end", error: expect.stringContaining("nova tentativa") })
        // A retomada depois do intervalo narra normalmente (a fila não ficou presa).
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.failedAt": new Date(Date.now() - MADDOX_MASTER_RETRY_MS - 1000) } })
        const state = await g.getGameState(id, seats[0]!.userId)
        expect(state.turn).toMatchObject({ number: 1, phase: "players", generating: false })
        expect(await narrations(id)).toBe(1)
    })

    it("resposta que nunca chega também é abortada pelo teto e vira o aviso de falha", async () => {
        const { id, owner, seats } = await table(1)
        await g.startCampaign(id, owner)
        fakeMaster.answer.mockImplementationOnce(async () => new Promise<string>(() => undefined))
        const state = await g.submitGameAction(id, { kind: "question", content: "Alguém?" }, seats[0]!.userId)
        expect(state.messages.find((message) => message.kind === "answer")).toMatchObject({ error: "O Maddox não conseguiu responder agora. Pergunte de novo." })
    })

    it("falha do mestre com o banco fora no mesmo instante: a geração ao vivo termina mesmo assim (sem bolha fantasma)", async () => {
        const { id, owner } = await table(1)
        fakeMaster.narrate.mockRejectedValueOnce(new Error("fora do ar"))
        const original = MaddoxCampaignModel.updateOne.bind(MaddoxCampaignModel)
        const spy = vi.spyOn(MaddoxCampaignModel, "updateOne").mockImplementation(((filter: never, update: { $set?: Record<string, unknown> }, ...rest: never[]) => {
            if (update?.$set && "turn.failedAt" in update.$set && update.$set["turn.failedAt"] instanceof Date) return Promise.reject(new Error("banco indisponível")) as never
            return (original as (...args: unknown[]) => unknown)(filter, update, ...rest) as never
        }) as never)
        const lines: { type: string; error?: string | null }[] = []
        const unsubscribe = subscribeGameLive(id, (line) => lines.push(line as never))
        try {
            await game.startCampaign(id, owner)
            await waitForCampaignIdle(id)
        } finally {
            unsubscribe()
            spy.mockRestore()
        }
        expect(lines.map((line) => line.type)).toEqual(["live-start", "live-end"])
        expect(lines.at(-1)).toMatchObject({ error: expect.stringContaining("nova tentativa") })
        const { liveSnapshot } = await import("@/features/maddox/server/game-live")
        expect(liveSnapshot(id)).toEqual([])
    })

    it("falha do mestre marca o turno como `failed` para a faixa da mesa", async () => {
        const { id, owner } = await table(1)
        fakeMaster.narrate.mockRejectedValueOnce(new Error("fora do ar"))
        const state = await g.startCampaign(id, owner)
        expect(state.turn).toMatchObject({ phase: "master", generating: false, failed: true })
    })
})

describe("Maddox 4 — validação da ação livre ao declarar", () => {
    async function rigorousTable(rigor: "rigoroso" | "fiel-dnd" | "equilibrado" | "narrativo") {
        const created = await table(1)
        await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { rigor } })
        await g.startCampaign(created.id, created.owner)
        return created
    }

    it.each(["rigoroso", "fiel-dnd"] as const)("%s: declaração inválida é recusada com o motivo, sem gravar nem gastar a vez", async (rigor) => {
        const { id, owner } = await rigorousTable(rigor)
        validateDeclaration.mockResolvedValueOnce({ valid: false, reason: "Herói 0 não conhece magia." })
        await expect(game.submitGameAction(id, { kind: "declaration", content: "Lanço uma bola de fogo." }, owner)).rejects.toMatchObject({ status: 409, code: "ACTION_INVALID", message: "Herói 0 não conhece magia." })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "declaration" })).toBe(0)
        const state = await g.submitGameAction(id, { kind: "declaration", content: "Saco a espada." }, owner)
        expect(state.turn.number).toBe(2)
        expect(validateDeclaration).toHaveBeenCalledTimes(2)
        expect(validateDeclaration).toHaveBeenLastCalledWith(expect.objectContaining({ content: "Saco a espada." }))
    })

    it.each(["narrativo", "equilibrado"] as const)("%s: não valida ao declarar (o narrador julga na narração)", async (rigor) => {
        const { id, owner } = await rigorousTable(rigor)
        const state = await g.submitGameAction(id, { kind: "declaration", content: "Lanço uma bola de fogo." }, owner)
        expect(state.turn.number).toBe(2)
        expect(validateDeclaration).not.toHaveBeenCalled()
    })

    it("quem já declarou recebe ALREADY_DECLARED sem disparar a validação por IA", async () => {
        const { id, owner, token } = await rigorousTable("rigoroso")
        const late = await seedUser("segundo")
        await campaigns.joinByInvite(token, late)
        await giveCharacter(id, late, "Segunda")
        // Turno 2 com os dois elegíveis: a declaração do dono não fecha o turno.
        await g.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "declaration", content: "Saco a espada." }, owner)
        expect(validateDeclaration).toHaveBeenCalledTimes(1)
        await expect(game.submitGameAction(id, { kind: "declaration", content: "De novo." }, owner)).rejects.toMatchObject({ status: 409, code: "ALREADY_DECLARED" })
        expect(validateDeclaration).toHaveBeenCalledTimes(1)
    })

    it("perguntas e \"não fazer nada\" nunca passam pela validação", async () => {
        const { id, owner } = await rigorousTable("fiel-dnd")
        await g.submitGameAction(id, { kind: "question", content: "Posso?" }, owner)
        await g.submitGameAction(id, { kind: "pass" }, owner)
        expect(validateDeclaration).not.toHaveBeenCalled()
    })
})
