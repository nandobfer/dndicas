import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { MaddoxAnswerContext, MaddoxMasterSink, MaddoxNarrationContext } from "@/features/maddox/server/game-master"

/**
 * Voltar a um turno (DND-44): só o dono pronto; ir ao turno X (mensagens, cenário, NPCs e imagens de X), andar para
 * frente e para trás dentro da volta pendente, retomar o turno de origem, declarações novas apagadas na troca, a perda
 * definitiva na nova narração (com exclusão pendente das memórias), os bloqueios e a rede de memórias fora do ar.
 * O Engramind entra pelo módulo `campaign-rewind` falso (a parte da rede é testada em tests/backend/engramind).
 */

const recordAudit = vi.fn(async () => undefined)
const publishToChannels = vi.fn(async () => undefined)
vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: { enabled: true, avatar: { url: null } }, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)
const deleteFile = vi.fn(async () => undefined)
vi.mock("@/lib/storage/s3", () => ({ deleteFile }))

/** Narração falsa: grava o cenário do turno e, no turno 3, um NPC (para conferir o que a volta repõe). */
const gate: { hold: Promise<void> | null } = { hold: null }
const fakeMaster = {
    narrate: vi.fn(async (context: MaddoxNarrationContext, sink: MaddoxMasterSink) => {
        if (gate.hold) await gate.hold
        const { MaddoxCampaignModel: Campaigns, MaddoxNpcModel: Npcs } = await import("@/features/maddox/models")
        await Campaigns.updateOne({ _id: context.campaignId }, { $set: { "state.scene": `Cena do turno ${context.turnNumber}` } })
        if (context.turnNumber === 3) await Npcs.create({ campaignId: context.campaignId, name: "Goblin", nameKey: "goblin", visibility: "players" })
        const text = `Narração do turno ${context.turnNumber}: ${context.declarations.map((item) => item.content).join(" / ") || "abertura"}`
        sink.delta(text)
        return text
    }),
    answer: vi.fn(async (_context: MaddoxAnswerContext, sink: MaddoxMasterSink) => {
        sink.delta("Resposta.")
        return "Resposta."
    }),
}
vi.mock("@/features/maddox/server/game-master", () => ({ getMaddoxMaster: vi.fn(async () => fakeMaster) }))
const rotateNarratorSession = vi.fn(async (campaignId: string) => void campaignId)
vi.mock("@/features/maddox/server/opencode-sessions", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/opencode-sessions")>()), rotateNarratorSession }))

/** Engramind da volta: grava os alvos pedidos e simula a rede fora e a exclusão que falha. */
const net = vi.hoisted(() => ({ down: false, purgeFails: false, applyFailures: 0, downAfterApplyFailure: false, targets: [] as unknown[], purges: [] as unknown[] }))
vi.mock("@/features/engramind/server/campaign-rewind", () => {
    class MemoryRewindUnavailableError extends Error {
        constructor(readonly cause: unknown) {
            super("rede fora")
        }
    }
    return {
        MEMORY_REWIND_UNAVAILABLE: "A rede de memórias está indisponível. Nada mudou na mesa; tente de novo em instantes.",
        MemoryRewindUnavailableError,
        npcTokenBoxesOf: vi.fn(async () => new Map()),
        resolveRewindChannels: vi.fn(async () => [{ ref: { kind: "campaign" }, channels: [], client: {} }]),
        planMemoryRewinds: vi.fn(async (_channels: unknown, target: unknown) => {
            if (net.down) throw new MemoryRewindUnavailableError(new Error("ECONNREFUSED"))
            net.targets.push(target)
            return [{ id: `m_${net.targets.length}`, ref: { kind: "campaign" }, action: { kind: "apply", revertTo: null, status: "archive" } }]
        }),
        applyMemoryRewinds: vi.fn(async () => {
            if (net.down) throw new MemoryRewindUnavailableError(new Error("ECONNREFUSED"))
            // Falha no meio: parte já foi aplicada e a rede cai (opcionalmente fica fora para o reparo imediato).
            if (net.applyFailures > 0) {
                net.applyFailures--
                if (net.downAfterApplyFailure) net.down = true
                throw new MemoryRewindUnavailableError(new Error("ECONNRESET"))
            }
            return 1
        }),
        purgeDiscardedMemories: vi.fn(async (_channels: unknown, known: { id: string; ref: unknown }[], window: unknown) => {
            net.purges.push({ known, window })
            return net.purgeFails ? { deleted: 0, failed: known.map((item) => ({ ...item, error: "rede fora" })) } : { deleted: known.length, failed: [] }
        }),
        purgeMemoryNow: vi.fn(async () => true),
        stashPendingWrites: vi.fn(async () => []),
        restorePendingWrites: vi.fn(async () => undefined),
    }
})

const models = await import("@/features/maddox/models")
const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel, MaddoxCampaignSnapshotModel, MaddoxSceneImageModel, MaddoxMemoryRepairModel, INCLUDE_DISCARDED } = models
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const rewind = await import("@/features/maddox/server/rewind")
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { sceneImageQuota } = await import("@/features/maddox/server/scene-images")
const tactical = await import("@/features/maddox/server/tactical-combat")

vi.setConfig({ testTimeout: 30_000 })

let mongo: MongoMemoryServer

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username, email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function table(players: number) {
    const owner = await seedUser("dono")
    const created = await campaigns.createCampaign({ name: "Brumas", rigor: "narrativo" }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", openingSituation: "Uma taverna." } })
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const users = [owner]
    for (let index = 1; index < players; index++) {
        const userId = await seedUser(`jogador${index}`)
        await campaigns.joinByInvite(token, userId)
        users.push(userId)
    }
    const seats: { userId: string; memberId: string; characterId: string }[] = []
    for (const [index, userId] of users.entries()) {
        const member = await MaddoxCampaignMemberModel.findOne({ campaignId: created.id, userId }).lean()
        const character = await MaddoxCharacterModel.create({ campaignId: created.id, memberId: member!._id, userId, name: `Herói ${index}`, interview: { status: "done", scriptVersion: 0 } })
        await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
        seats.push({ userId, memberId: String(member!._id), characterId: String(character._id) })
    }
    return { id: created.id, owner, seats }
}

const settle = async <T>(id: string, action: Promise<T>) => {
    const result = await action
    await waitForCampaignIdle(id)
    return result
}
const state = (id: string, userId: string) => settle(id, game.getGameState(id, userId))
const declareAll = async (id: string, seats: { userId: string }[], label: string) => {
    for (const [index, seat] of seats.entries()) await settle(id, game.submitGameAction(id, { kind: "declaration", content: `${label}-${index}` }, seat.userId))
}

/** Inicia e joga até o turno `n` (vez dos jogadores aberta). */
async function playTo(n: number, players = 2) {
    const setup = await table(players)
    await settle(setup.id, game.startCampaign(setup.id, setup.owner))
    for (let turn = 1; turn < n; turn++) await declareAll(setup.id, setup.seats, `Ação ${turn}`)
    return setup
}

const goto = (id: string, owner: string, turnNumber: number) => settle(id, rewind.rewindToTurn(id, { turnNumber }, owner))
const resume = (id: string, owner: string) => settle(id, rewind.resumeCurrentTurn(id, owner))
const campaignOf = (id: string) => MaddoxCampaignModel.findById(id).lean()
const allMessages = (id: string) => MaddoxCampaignMessageModel.find({ campaignId: id }).setOptions(INCLUDE_DISCARDED).lean()

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_rewind_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxCampaignSnapshotModel.init(), MaddoxSceneImageModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    const db = mongoose.connection.db!
    for (const collection of await db.collections()) await collection.deleteMany({})
    Object.assign(net, { down: false, purgeFails: false, applyFailures: 0, downAfterApplyFailure: false, targets: [], purges: [] })
    rotateNarratorSession.mockClear()
    gate.hold = null
    recordAudit.mockClear()
    publishToChannels.mockClear()
})

describe("filtro de descarte", () => {
    it("a mensagem descartada some das leituras; a opção includeDiscarded a enxerga", async () => {
        const campaignId = new mongoose.Types.ObjectId()
        await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 1, phase: "master", kind: "narration", content: "a" })
        await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 2, phase: "master", kind: "narration", content: "b", discardedBy: { rewindId: "r1", at: new Date() } })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId })).toBe(1)
        expect((await MaddoxCampaignMessageModel.find({ campaignId }).lean()).map((item) => item.content)).toEqual(["a"])
        expect(await MaddoxCampaignMessageModel.exists({ campaignId, turnNumber: 2 })).toBeNull()
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId }).setOptions(INCLUDE_DISCARDED)).toBe(2)
        await MaddoxCampaignMessageModel.updateMany({ campaignId }, { $set: { content: "x" } })
        expect((await allMessages(String(campaignId))).map((item) => item.content).sort()).toEqual(["b", "x"])
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId, "discardedBy.rewindId": "r1" })).toBe(1)
    })
})

describe("permissões e bloqueios", () => {
    it("só o dono vê a lista e volta (403 para os outros); dono sem entrevista recebe 409 INTERVIEW_REQUIRED", async () => {
        const { id, owner, seats } = await playTo(3)
        expect((await state(id, seats[1]!.userId)).me.rewind ?? null).toBeNull()
        await expect(rewind.listRewindTurns(id, seats[1]!.userId)).rejects.toMatchObject({ status: 403 })
        await expect(rewind.rewindToTurn(id, { turnNumber: 1 }, seats[1]!.userId)).rejects.toMatchObject({ status: 403 })
        await expect(rewind.resumeCurrentTurn(id, seats[1]!.userId)).rejects.toMatchObject({ status: 403 })
        await MaddoxCharacterModel.updateOne({ _id: seats[0]!.characterId }, { $set: { "interview.status": "in-progress" } })
        expect((await state(id, owner)).me.rewind?.blockReason).toMatch(/Conclua a entrevista/)
        await expect(rewind.rewindToTurn(id, { turnNumber: 1 }, owner)).rejects.toMatchObject({ status: 409, code: "INTERVIEW_REQUIRED" })
    })

    it("lista os turnos com retrato, do mais recente para o mais antigo, com o começo da narração", async () => {
        const { id, owner } = await playTo(4)
        const list = await rewind.listRewindTurns(id, owner)
        expect(list).toMatchObject({ originTurn: 4, atTurn: 4, undoTarget: 3 })
        expect(list.turns.map((item) => item.turnNumber)).toEqual([3, 2, 1])
        expect(list.turns[0]!.excerpt).toBe("Narração do turno 3: Ação 2-0 / Ação 2-1")
        // Turno antigo, sem retrato, não aparece.
        await MaddoxCampaignSnapshotModel.deleteOne({ campaignId: id, turnNumber: 1 })
        expect((await rewind.listRewindTurns(id, owner)).turns.map((item) => item.turnNumber)).toEqual([3, 2])
        await expect(goto(id, owner, 1)).rejects.toMatchObject({ status: 409, code: "TURN_UNAVAILABLE" })
        await expect(goto(id, owner, 4)).rejects.toMatchObject({ status: 409, code: "TURN_UNAVAILABLE" })
    })

    it("turno 1: não há para onde voltar", async () => {
        const { id, owner } = await playTo(1)
        const mine = (await state(id, owner)).me.rewind!
        expect(mine).toMatchObject({ undoTarget: null, hasTurns: false, emptyReason: "A mesa está no turno 1: não há para onde voltar." })
        await expect(rewind.resumeCurrentTurn(id, owner)).rejects.toMatchObject({ status: 409, code: "NO_PENDING_REWIND" })
    })

    it("409 MASTER_TURN com o Maddox narrando; 409 CAMPAIGN_NOT_ACTIVE fora de active", async () => {
        const { id, owner, seats } = await playTo(3)
        let release!: () => void
        gate.hold = new Promise<void>((resolve) => (release = resolve))
        await game.submitGameAction(id, { kind: "declaration", content: "a" }, seats[0]!.userId)
        await game.submitGameAction(id, { kind: "declaration", content: "b" }, seats[1]!.userId)
        expect((await game.getGameState(id, owner)).me.rewind?.blockReason).toMatch(/O Maddox está narrando/)
        await expect(rewind.rewindToTurn(id, { turnNumber: 1 }, owner)).rejects.toMatchObject({ status: 409, code: "MASTER_TURN" })
        release()
        gate.hold = null
        await waitForCampaignIdle(id)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { status: "archived" } })
        await expect(rewind.rewindToTurn(id, { turnNumber: 1 }, owner)).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_NOT_ACTIVE" })
    })

    it("com a narração parada por falha, o dono pode voltar; retomar devolve a fase do mestre com a falha", async () => {
        const { id, owner, seats } = await playTo(3)
        fakeMaster.narrate.mockRejectedValueOnce(new Error("provedor fora"))
        await declareAll(id, seats, "Ação 3")
        const failed = await campaignOf(id)
        expect(failed!.turn).toMatchObject({ number: 4, phase: "master", generating: null })
        expect(failed!.turn.failedAt).toBeTruthy()
        await goto(id, owner, 2)
        expect((await campaignOf(id))!.turn).toMatchObject({ number: 2, phase: "players" })
        expect((await campaignOf(id))!.rewind).toMatchObject({ originTurn: 4, originPhase: "master", atTurn: 2 })
        await resume(id, owner)
        const back = (await campaignOf(id))!
        expect(back.turn).toMatchObject({ number: 4, phase: "master", generating: null })
        expect(back.turn.failedAt).toBeTruthy()
    })
})

describe("ir ao turno, andar e retomar", () => {
    it("ir ao turno 2: vez dos jogadores, narração de 2 continua, o resto sai da mesa; cenário e NPCs de 2; aviso e faixa para todos", async () => {
        const { id, owner, seats } = await playTo(4)
        expect((await campaignOf(id))!.state.scene).toBe("Cena do turno 4")
        expect(await MaddoxNpcModel.countDocuments({ campaignId: id })).toBe(1)
        const view = await goto(id, owner, 2)
        expect(view.turn).toMatchObject({ number: 2, phase: "players", rewind: { atTurn: 2, originTurn: 4, hasNewActions: false } })
        expect(view.participants.every((participant) => participant.eligible && !participant.declared)).toBe(true)
        const visible = view.messages.filter((message) => message.kind !== "rewind")
        expect(Math.max(...visible.map((message) => message.turnNumber))).toBe(2)
        expect(visible.filter((message) => message.kind === "narration").map((message) => message.turnNumber)).toEqual([1, 2])
        expect(visible.some((message) => message.kind === "declaration" && message.turnNumber === 2)).toBe(false)
        expect(view.messages.at(-1)).toMatchObject({ kind: "rewind", rewindNotice: { event: "goto", turnNumber: 2, originTurn: 4 } })
        expect((await campaignOf(id))!.state.scene).toBe("Cena do turno 2")
        expect(await MaddoxNpcModel.countDocuments({ campaignId: id })).toBe(0)
        expect(net.targets).toHaveLength(1)
        const other = await state(id, seats[1]!.userId)
        expect(other.turn.rewind).toMatchObject({ atTurn: 2, originTurn: 4 })
        expect(publishToChannels).toHaveBeenCalledWith(expect.arrayContaining(seats.map((seat) => `private-maddox-u-${seat.userId}`)), "maddox.game.changed", expect.objectContaining({ campaignId: id, turnNumber: 2, phase: "players" }))
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "CampanhaMaddox", depois: { rewind: "goto", turn: 2, origin: 4 } }))
        // Diário: a busca não acha o que saiu da mesa (a narração do turno 3), mas acha a do 2.
        const { searchJournal } = await import("@/features/maddox/server/journal")
        expect((await searchJournal(id, { q: "Narração do turno 3" }, owner)).messages.items).toHaveLength(0)
        expect((await searchJournal(id, { q: "Narração do turno 2" }, owner)).messages.items.length).toBeGreaterThan(0)
        // Lobby: "Em andamento · Turno 2 · …".
        expect(await campaigns.getCampaignDetail(id, owner)).toMatchObject({ status: "active", turnNumber: 2, turnPhase: "players" })
        // A lista agora: < 4 e diferente de 2; desfazer vai ao 1.
        const list = await rewind.listRewindTurns(id, owner)
        expect(list.turns.map((item) => item.turnNumber)).toEqual([3, 1])
        expect(list.undoTarget).toBe(1)
    })

    it("andar para frente dentro da volta: 2 → 3 traz o turno 3 e o NPC dele; o 4 segue fora e retomar continua disponível", async () => {
        const { id, owner } = await playTo(4)
        await goto(id, owner, 2)
        const view = await goto(id, owner, 3)
        expect(view.turn).toMatchObject({ number: 3, phase: "players", rewind: { atTurn: 3, originTurn: 4 } })
        const visible = view.messages.filter((message) => message.kind !== "rewind")
        expect(Math.max(...visible.map((message) => message.turnNumber))).toBe(3)
        expect((await campaignOf(id))!.state.scene).toBe("Cena do turno 3")
        expect(await MaddoxNpcModel.countDocuments({ campaignId: id })).toBe(1)
        expect((await rewind.listRewindTurns(id, owner)).turns.map((item) => item.turnNumber)).toEqual([2, 1])
    })

    it("declarações novas: aparecem no aviso e são apagadas ao trocar de turno", async () => {
        const { id, owner, seats } = await playTo(4)
        await goto(id, owner, 2)
        const view = await settle(id, game.submitGameAction(id, { kind: "declaration", content: "Nova ideia" }, seats[1]!.userId))
        expect(view.turn.rewind?.hasNewActions).toBe(true)
        await goto(id, owner, 1)
        expect((await allMessages(id)).some((message) => message.content === "Nova ideia")).toBe(false)
        expect((await state(id, owner)).turn.rewind?.hasNewActions).toBe(false)
    })

    it('"Voltar ao turno atual (N)": devolve exatamente o 4, na fase em que estava, e apaga as declarações novas', async () => {
        const { id, owner, seats } = await playTo(4)
        await settle(id, game.submitGameAction(id, { kind: "declaration", content: "Antes da volta" }, seats[0]!.userId))
        const before = await state(id, owner)
        await goto(id, owner, 2)
        await settle(id, game.submitGameAction(id, { kind: "declaration", content: "Nova ideia" }, seats[1]!.userId))
        const view = await resume(id, owner)
        expect(view.turn).toMatchObject({ number: 4, phase: "players", rewind: null })
        expect(view.participants.map((participant) => [participant.memberId, participant.eligible, participant.declared])).toEqual(before.participants.map((participant) => [participant.memberId, participant.eligible, participant.declared]))
        const visible = view.messages.filter((message) => message.kind !== "rewind").map((message) => message.id)
        expect(visible).toEqual(before.messages.map((message) => message.id))
        expect(view.messages.at(-1)).toMatchObject({ kind: "rewind", rewindNotice: { event: "resume", turnNumber: 4 } })
        expect((await allMessages(id)).some((message) => message.content === "Nova ideia")).toBe(false)
        expect((await campaignOf(id))!.state.scene).toBe("Cena do turno 4")
        expect(await MaddoxNpcModel.countDocuments({ campaignId: id })).toBe(1)
        expect(net.targets.at(-1)).toMatchObject({ deleteAfter: expect.any(Number) })
        expect(await MaddoxCampaignSnapshotModel.countDocuments({ campaignId: id, kind: "origin" })).toBe(0)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: { rewind: "resume", turn: 4, phase: "players" } }))
        // O jogador que já tinha declarado no 4 continua contado: o outro fecha o turno normalmente.
        await settle(id, game.submitGameAction(id, { kind: "declaration", content: "Fecha" }, seats[1]!.userId))
        expect((await campaignOf(id))!.turn).toMatchObject({ number: 5, phase: "players" })
    })

    it("rede de memórias fora: 409 ENGRAMIND_UNAVAILABLE e nada muda na mesa; repetir depois funciona", async () => {
        const { id, owner } = await playTo(4)
        net.down = true
        await expect(goto(id, owner, 2)).rejects.toMatchObject({ status: 409, code: "ENGRAMIND_UNAVAILABLE" })
        const after = (await campaignOf(id))!
        expect(after.turn).toMatchObject({ number: 4, phase: "players", generating: null })
        expect(after.rewind).toBeNull()
        expect(await MaddoxCampaignSnapshotModel.countDocuments({ campaignId: id, kind: "origin" })).toBe(0)
        expect((await allMessages(id)).some((message) => message.discardedBy)).toBe(false)
        net.down = false
        expect((await goto(id, owner, 2)).turn).toMatchObject({ number: 2, phase: "players" })
    })

    it("duas voltas ao mesmo tempo: uma passa e a outra responde 409; declaração concorrente nunca fica órfã", async () => {
        const { id, owner, seats } = await playTo(4)
        const results = await Promise.allSettled([rewind.rewindToTurn(id, { turnNumber: 2 }, owner), rewind.rewindToTurn(id, { turnNumber: 1 }, owner), game.submitGameAction(id, { kind: "declaration", content: "Concorrente" }, seats[1]!.userId)])
        await waitForCampaignIdle(id)
        expect(results.slice(0, 2).filter((result) => result.status === "fulfilled")).toHaveLength(1)
        const rejected = results.slice(0, 2).find((result) => result.status === "rejected") as PromiseRejectedResult
        expect(rejected.reason).toMatchObject({ status: 409 })
        const campaign = (await campaignOf(id))!
        const concurrent = (await allMessages(id)).find((message) => message.content === "Concorrente")
        const declaration = results[2]!
        if (concurrent) {
            // Entrou antes da trava: foi para o descarte junto com o turno 4.
            expect(declaration.status).toBe("fulfilled")
            expect(concurrent.discardedBy).toBeTruthy()
        } else {
            // Chegou com a trava tomada ou depois de o turno fechar: recusada com o código, sem mensagem.
            expect(declaration.status).toBe("rejected")
            expect((declaration as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: expect.stringMatching(/^(TURN_CLOSED|MASTER_TURN)$/) })
        }
        expect(campaign.turn.declaredMemberIds).toHaveLength(0)
    })

    it("rede de memórias cai no meio: devolve as memórias na hora, a mesa não muda e repetir funciona", async () => {
        const { id, owner } = await playTo(4)
        net.applyFailures = 1
        await expect(goto(id, owner, 2)).rejects.toMatchObject({ status: 409, code: "ENGRAMIND_UNAVAILABLE" })
        // Plano da volta + plano do reparo imediato (de volta ao estado mais novo: asOf infinito).
        expect(net.targets).toHaveLength(2)
        expect(net.targets[1]).toMatchObject({ asOf: Number.POSITIVE_INFINITY, deleteAfter: null })
        const after = (await campaignOf(id))!
        expect(after.turn).toMatchObject({ number: 4, phase: "players", generating: null })
        expect(after.rewind ?? null).toBeNull()
        expect(after.memoryRepair ?? null).toBeNull()
        expect((await allMessages(id)).some((message) => message.discardedBy)).toBe(false)
        expect((await goto(id, owner, 2)).turn).toMatchObject({ number: 2, phase: "players" })
    })

    it("rede cai no meio e fica fora: o reparo pendente é gravado e roda antes da próxima volta", async () => {
        const { id, owner } = await playTo(4)
        Object.assign(net, { applyFailures: 1, downAfterApplyFailure: true })
        await expect(goto(id, owner, 2)).rejects.toMatchObject({ status: 409, code: "ENGRAMIND_UNAVAILABLE" })
        const pending = (await campaignOf(id))!
        expect(pending.turn).toMatchObject({ number: 4, phase: "players", generating: null })
        expect(pending.memoryRepair).toMatchObject({ asOf: null, keepAfter: null, known: [expect.objectContaining({ id: "m_1", ref: { kind: "campaign" } })] })
        expect((await allMessages(id)).some((message) => message.discardedBy)).toBe(false)
        // Rede de volta: a próxima volta repara primeiro (alvo = estado mais novo) e depois aplica.
        net.down = false
        net.targets = []
        expect((await goto(id, owner, 2)).turn).toMatchObject({ number: 2, phase: "players" })
        expect(net.targets[0]).toMatchObject({ asOf: Number.POSITIVE_INFINITY })
        expect((await campaignOf(id))!.memoryRepair ?? null).toBeNull()
    })

    it("trava de volta sem processo vivo (reinício): a leitura da mesa refaz a operação, cancela os prazos e troca a sessão do narrador", async () => {
        const { id, owner } = await playTo(4)
        const old = new Date(Date.now() - 10 * 60_000)
        await MaddoxCampaignModel.updateOne(
            { _id: id },
            { $set: { "turn.phase": "master", "turn.generating": { token: "morto", startedAt: old, rewind: { kind: "goto", target: 2, userId: owner, before: { number: 4, phase: "players", failedAt: null } } } } },
        )
        let fired = false
        tactical.scheduleTimer(`npc-block:${id}`, 60_000, async () => {
            fired = true
        })
        const during = await game.getGameState(id, owner)
        expect(during.turn).toMatchObject({ rewinding: true, generating: false })
        await vi.waitFor(async () => expect((await campaignOf(id))!.turn).toMatchObject({ number: 2, phase: "players", generating: null }), { timeout: 10_000 })
        await waitForCampaignIdle(id)
        expect((await campaignOf(id))!.rewind).toMatchObject({ originTurn: 4, originPhase: "players", atTurn: 2 })
        expect(tactical.hasSequenceTimer(id)).toBe(false)
        expect(fired).toBe(false)
        expect(rotateNarratorSession).toHaveBeenCalledWith(id)
        // Trava recente (processo vivo em outro lugar): não é tomada.
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "master", "turn.generating": { token: "vivo", startedAt: new Date(), rewind: { kind: "resume", target: null, userId: owner, before: { number: 2, phase: "players", failedAt: null } } } } })
        await state(id, owner)
        expect((await campaignOf(id))!.turn.generating).toMatchObject({ token: "vivo" })
    })
})

describe("perda definitiva", () => {
    it("a nova narração apaga o trecho, a numeração segue em X+1, a faixa some e a exclusão das memórias é pedida", async () => {
        const { id, owner, seats } = await playTo(4)
        await goto(id, owner, 2)
        const rewindId = (await campaignOf(id))!.rewind!.id
        await declareAll(id, seats, "Novo rumo")
        const view = await state(id, owner)
        expect(view.turn).toMatchObject({ number: 3, phase: "players", rewind: null })
        expect((await allMessages(id)).some((message) => message.discardedBy)).toBe(false)
        const narration3 = await MaddoxCampaignMessageModel.find({ campaignId: id, kind: "narration", turnNumber: 3 }).lean()
        expect(narration3.map((message) => message.content)).toEqual(["Narração do turno 3: Novo rumo-0 / Novo rumo-1"])
        expect(await MaddoxCampaignSnapshotModel.countDocuments({ campaignId: id, kind: "origin" })).toBe(0)
        expect((await MaddoxCampaignSnapshotModel.find({ campaignId: id, kind: "turn" }).lean()).map((item) => item.turnNumber).sort()).toEqual([1, 2, 3])
        expect(net.purges).toHaveLength(1)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: { rewind: "commit", turn: 2, discardedTurns: "3..4" } }))
        expect(rewindId).toBeTruthy()
        await expect(rewind.resumeCurrentTurn(id, owner)).rejects.toMatchObject({ status: 409, code: "NO_PENDING_REWIND" })
    })

    it("exclusão das memórias falhou: a narração segue e a exclusão fica pendente até a rotina", async () => {
        const { id, owner, seats } = await playTo(4)
        await goto(id, owner, 2)
        net.purgeFails = true
        await declareAll(id, seats, "Novo rumo")
        expect((await campaignOf(id))!.turn).toMatchObject({ number: 3, phase: "players" })
        expect(await MaddoxMemoryRepairModel.countDocuments({ campaignId: id })).toBeGreaterThan(0)
        expect(await rewind.processRewindRepairs()).toBeGreaterThan(0)
        expect(await MaddoxMemoryRepairModel.countDocuments({ campaignId: id })).toBe(0)
    })

    it("imagens do trecho: somem da mesa, continuam no teto diário e, na perda definitiva, viram lápide", async () => {
        const { id, owner, seats } = await playTo(4)
        const campaignId = new mongoose.Types.ObjectId(id)
        await MaddoxSceneImageModel.create({ campaignId, turnNumber: 3, source: "tool", slot: "auto", status: "done", counts: true, url: "/x", key: "maddox/x.png", description: "d" })
        const scene = { maxPerDay: 5, minNarrationsBetween: 1 } as Parameters<typeof sceneImageQuota>[2]
        expect((await sceneImageQuota(campaignId, 5, scene, "manual")).remainingToday).toBe(4)
        await goto(id, owner, 2)
        expect(await MaddoxSceneImageModel.countDocuments({ campaignId })).toBe(0)
        expect((await sceneImageQuota(campaignId, 3, scene, "manual")).remainingToday).toBe(4)
        await declareAll(id, seats, "Novo rumo")
        const tomb = await MaddoxSceneImageModel.findOne({ campaignId }).setOptions(INCLUDE_DISCARDED).lean()
        expect(tomb).toMatchObject({ slot: "discarded", counts: true, url: null })
        expect(deleteFile).toHaveBeenCalledWith("maddox/x.png")
        expect((await sceneImageQuota(campaignId, 3, scene, "auto")).remainingToday).toBe(4)
    })
})
