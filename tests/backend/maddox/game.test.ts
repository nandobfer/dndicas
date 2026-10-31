import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
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

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const { MADDOX_MASTER_LOCK_STALE_MS } = await import("@/features/maddox/constants")

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
const declare = (id: string, userId: string, content = "Abro a porta.") => game.submitGameAction(id, { kind: "declaration", content }, userId)

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
})

describe("Maddox 3 — iniciar a campanha", () => {
    it("o dono inicia: campanha em andamento, abertura do Maddox e turno dos jogadores com todos os prontos", async () => {
        const { id, owner, seats } = await table(2)
        const state = await game.startCampaign(id, owner)
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
        await expect(game.startCampaign(id, seats[1]!.userId)).rejects.toMatchObject({ status: 403 })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "scenarioInterview.status": "in-progress" } })
        await expect(game.startCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "SCENARIO_PENDING" })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "scenarioInterview.status": "done" } })
        await MaddoxCharacterModel.updateOne({ _id: seats[0]!.characterId }, { $set: { "interview.status": "in-progress" } })
        await expect(game.startCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "INTERVIEW_REQUIRED" })
        await finishInterview(seats[0]!.characterId)
        await game.startCampaign(id, owner)
        await expect(game.startCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_ALREADY_STARTED" })
        expect(await narrations(id)).toBe(1)
    })

    it("quem não participa recebe 404 na mesa", async () => {
        const { id, owner } = await table(1)
        await game.startCampaign(id, owner)
        const stranger = await seedUser("estranho")
        await expect(game.getGameState(id, stranger)).rejects.toMatchObject({ status: 404 })
        await expect(declare(id, stranger)).rejects.toMatchObject({ status: 404 })
    })
})

describe("Maddox 3 — troca de turno", () => {
    it.each([1, 2, 5])("com %i jogador(es), o turno só passa ao mestre quando todos declaram", async (players) => {
        const { id, owner, seats } = await table(players)
        await game.startCampaign(id, owner)
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
        const state = await game.getGameState(id, owner)
        expect(state.participants.every((participant) => participant.eligible && !participant.declared)).toBe(true)
    })

    it('"Não fazer nada" conta como declaração', async () => {
        const { id, owner, seats } = await table(2)
        await game.startCampaign(id, owner)
        await game.submitGameAction(id, { kind: "pass" }, seats[0]!.userId)
        const state = await game.submitGameAction(id, { kind: "pass" }, seats[1]!.userId)
        expect(state.turn).toMatchObject({ number: 2, phase: "players" })
        const narration = await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "narration", turnNumber: 2 }).lean()
        expect(narration!.content).toContain("preferiu esperar")
    })

    it("pergunta ao mestre é respondida e não encerra o turno, mesmo depois de declarar", async () => {
        const { id, owner, seats } = await table(2)
        await game.startCampaign(id, owner)
        let state = await game.submitGameAction(id, { kind: "question", content: "Há guardas na porta?" }, seats[0]!.userId)
        expect(state.turn).toMatchObject({ number: 1, phase: "players" })
        const question = state.messages.find((message) => message.kind === "question")!
        const answer = state.messages.find((message) => message.kind === "answer")!
        expect(question).toMatchObject({ content: "Há guardas na porta?", characterName: "Herói 0" })
        expect(answer.replyToId).toBe(question.id)
        expect(answer.content).toContain("Há guardas na porta?")
        await declare(id, seats[0]!.userId)
        state = await game.submitGameAction(id, { kind: "question", content: "E agora?" }, seats[0]!.userId)
        expect(state.turn.phase).toBe("players")
        expect(state.me.declared).toBe(true)
        expect(await narrations(id)).toBe(1)
    })

    it("não declara duas vezes no mesmo turno nem no turno do mestre", async () => {
        const { id, owner, seats } = await table(2)
        await game.startCampaign(id, owner)
        await declare(id, seats[0]!.userId)
        await expect(declare(id, seats[0]!.userId)).rejects.toMatchObject({ status: 409, code: "ALREADY_DECLARED" })
        await expect(game.submitGameAction(id, { kind: "pass" }, seats[0]!.userId)).rejects.toMatchObject({ code: "ALREADY_DECLARED" })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "master", "turn.generating": { token: "x", startedAt: new Date() } } })
        await expect(declare(id, seats[1]!.userId)).rejects.toMatchObject({ status: 409, code: "MASTER_TURN" })
    })

    it("as duas últimas declarações simultâneas geram uma única narração", async () => {
        const { id, owner, seats } = await table(3)
        await game.startCampaign(id, owner)
        await declare(id, seats[0]!.userId)
        await Promise.all([declare(id, seats[1]!.userId), declare(id, seats[2]!.userId), game.checkTurn(id, owner)])
        expect(await narrations(id)).toBe(2)
        const stored = await MaddoxCampaignModel.findById(id).lean()
        expect(stored!.turn).toMatchObject({ number: 2, phase: "players" })
    })

    it("membro sem a entrevista concluída não joga (assertMemberCanPlay)", async () => {
        const { id, owner, token } = await table(1)
        await game.startCampaign(id, owner)
        const late = await seedUser("atrasado")
        await campaigns.joinByInvite(token, late)
        await giveCharacter(id, late, "Novato", false)
        await expect(declare(id, late)).rejects.toMatchObject({ status: 409, code: "INTERVIEW_REQUIRED" })
        const state = await game.getGameState(id, late)
        expect(state.me).toMatchObject({ ready: false, eligible: false })
    })
})

describe("Maddox 3 — entrada no meio da campanha", () => {
    it("quem fica pronto durante o turno entra no próximo; o turno fecha sem ele", async () => {
        const { id, owner, token, seats } = await table(2)
        await game.startCampaign(id, owner)
        const late = await seedUser("atrasado")
        await campaigns.joinByInvite(token, late)
        const lateSeat = await giveCharacter(id, late, "Novato", false)
        await finishInterview(lateSeat.characterId)

        await expect(declare(id, late)).rejects.toMatchObject({ status: 409, code: "NEXT_TURN" })
        await expect(game.submitGameAction(id, { kind: "question", content: "Posso entrar?" }, late)).rejects.toMatchObject({ code: "NEXT_TURN" })
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
        await game.startCampaign(id, owner)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.eligibleMemberIds": [] } })
        const state = await game.getGameState(id, seats[1]!.userId)
        expect(state.me.eligible).toBe(true)
        expect(state.participants.every((participant) => participant.eligible)).toBe(true)
    })
})

describe("Maddox 3 — presença", () => {
    it("elegível offline não trava o turno; quem volta online passa a contar", async () => {
        const { id, owner, seats } = await table(3)
        await game.startCampaign(id, owner)
        presence.online = new Set([seats[0]!.userId, seats[1]!.userId])
        await declare(id, seats[0]!.userId)
        presence.online.add(seats[2]!.userId)
        let state = await declare(id, seats[1]!.userId)
        expect(state.turn).toMatchObject({ number: 1, phase: "players" })
        presence.online.delete(seats[2]!.userId)
        state = await game.checkTurn(id, seats[0]!.userId)
        expect(state.turn).toMatchObject({ number: 2, phase: "players" })
    })

    it("todos offline e nenhuma declaração: o turno não fecha sozinho", async () => {
        const { id, owner } = await table(2)
        await game.startCampaign(id, owner)
        presence.online = new Set()
        const state = await game.checkTurn(id, owner)
        expect(state.turn).toMatchObject({ number: 1, phase: "players" })
    })

    it("presença desconhecida (Pusher indisponível) exige todos os elegíveis", async () => {
        const { id, owner, seats } = await table(2)
        await game.startCampaign(id, owner)
        presence.online = null
        const state = await declare(id, seats[0]!.userId)
        expect(state.turn).toMatchObject({ number: 1, phase: "players" })
    })
})

describe("Maddox 3 — dono pula jogador e saídas", () => {
    it("o dono pula a vez de um jogador ausente (auditado) e o turno fecha", async () => {
        const { id, owner, seats } = await table(2)
        await game.startCampaign(id, owner)
        await declare(id, owner)
        await expect(game.skipPlayer(id, { memberId: seats[0]!.memberId }, seats[1]!.userId)).rejects.toMatchObject({ status: 403 })
        await expect(game.skipPlayer(id, { memberId: seats[0]!.memberId }, owner)).rejects.toMatchObject({ status: 409, code: "ALREADY_DECLARED" })
        const state = await game.skipPlayer(id, { memberId: seats[1]!.memberId }, owner)
        expect(state.turn.number).toBe(2)
        const pass = state.messages.find((message) => message.kind === "pass")!
        expect(pass).toMatchObject({ memberId: seats[1]!.memberId, skippedByName: "DONO" })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: { turn: 1, skipped: seats[1]!.userId } }))
    })

    it("pular jogador inexistente responde 404", async () => {
        const { id, owner } = await table(1)
        await game.startCampaign(id, owner)
        await expect(game.skipPlayer(id, { memberId: "nao-e-id" }, owner)).rejects.toMatchObject({ status: 404 })
        await expect(game.skipPlayer(id, { memberId: String(new mongoose.Types.ObjectId()) }, owner)).rejects.toMatchObject({ status: 404 })
    })

    it("jogador que sai no meio do turno deixa de contar e o turno fecha", async () => {
        const { id, owner, seats } = await table(3)
        await game.startCampaign(id, owner)
        await declare(id, seats[0]!.userId)
        await declare(id, seats[1]!.userId)
        await campaigns.removeMember(id, seats[2]!.memberId, seats[2]!.userId)
        const state = await game.getGameState(id, owner)
        expect(state.turn).toMatchObject({ number: 2, phase: "players" })
        expect(state.participants).toHaveLength(2)
    })
})

describe("Maddox 3 — turno do mestre interrompido", () => {
    it("trava velha do mestre é retomada ao abrir a mesa, sem duplicar a narração", async () => {
        const { id, owner, seats } = await table(1)
        await game.startCampaign(id, owner)
        await MaddoxCampaignModel.updateOne(
            { _id: id },
            { $set: { "turn.number": 2, "turn.phase": "master", "turn.generating": { token: "morto", startedAt: new Date(Date.now() - MADDOX_MASTER_LOCK_STALE_MS - 1000) } } },
        )
        const fresh = await MaddoxCampaignModel.findById(id).lean()
        expect(fresh!.turn.phase).toBe("master")
        const state = await game.getGameState(id, seats[0]!.userId)
        expect(state.turn).toMatchObject({ number: 2, phase: "players", generating: false })
        expect(await narrations(id)).toBe(2)
        await game.getGameState(id, owner)
        expect(await narrations(id)).toBe(2)
    })

    it("trava recente não é retomada", async () => {
        const { id, owner } = await table(1)
        await game.startCampaign(id, owner)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.number": 2, "turn.phase": "master", "turn.generating": { token: "vivo", startedAt: new Date() } } })
        const state = await game.getGameState(id, owner)
        expect(state.turn).toMatchObject({ number: 2, phase: "master", generating: true })
    })
})

describe("Maddox 3 — paginação", () => {
    it("lista as mensagens anteriores pelo cursor", async () => {
        const { id, owner } = await table(1)
        await game.startCampaign(id, owner)
        for (let turn = 0; turn < 3; turn++) await declare(id, owner, `Ação ${turn}`)
        const state = await game.getGameState(id, owner)
        expect(state.hasMore).toBe(false)
        const page = await game.listGameMessages(id, state.messages[2]!.id, owner)
        expect(page.messages.map((message) => message.id)).toEqual(state.messages.slice(0, 2).map((message) => message.id))
        await expect(game.listGameMessages(id, "ruim", owner)).rejects.toMatchObject({ status: 400 })
    })
})
