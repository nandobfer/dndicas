import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { MaddoxAnswerContext, MaddoxMasterSink, MaddoxNarrationContext } from "@/features/maddox/server/game-master"
import type { MaddoxGameStreamLine } from "@/features/maddox/game-types"

/**
 * Reiniciar a campanha (DND-50): reinício completo (o que apaga e o que preserva), só o dono, fases aceitas, idempotência,
 * retomada depois de uma falha no meio, memórias do Engramind fora do ar (lobby mesmo assim, início recusado até
 * apagar) e a interrupção de uma narração em andamento. O Engramind entra pelo módulo `campaign-rewind` falso (a parte da
 * rede é testada em tests/backend/engramind/campaign-reset-memories.test.ts). As fichas ficam em sheet-restore.test.ts.
 */

const recordAudit = vi.fn<(entry: Record<string, unknown>) => Promise<undefined>>(async () => undefined)
const publishToChannels = vi.fn<(channels: string[], event: string, payload: unknown) => Promise<undefined>>(async () => undefined)
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
const deleteFile = vi.fn<(key: string) => Promise<undefined>>(async () => undefined)
vi.mock("@/lib/storage/s3", () => ({ deleteFile }))
const syncCampaignChannelLifecycle = vi.fn<(campaign: { id: string; status: string }, actorId?: string) => Promise<undefined>>(async () => undefined)
vi.mock("@/features/engramind/server/campaign-channels", () => ({ syncCampaignChannelLifecycle, provisionCampaignMemoryNetworkSafely: vi.fn(async () => true) }))
const retireOpexNpcAgent = vi.fn<(ref: { campaignId: string; npcId: string }) => Promise<undefined>>(async () => undefined)
vi.mock("@/features/engramind/server/opex-npcs", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/engramind/server/opex-npcs")>()), retireOpexNpcAgent }))

/** Narração falsa: grava o cenário do turno; `gate.hold` segura a geração (narração em andamento). */
const gate: { hold: Promise<void> | null; signals: AbortSignal[]; toolErrors: string[] } = { hold: null, signals: [], toolErrors: [] }
const fakeMaster = {
    narrate: vi.fn(async (context: MaddoxNarrationContext, sink: MaddoxMasterSink) => {
        if (context.signal) gate.signals.push(context.signal)
        sink.delta("Começo da narração")
        if (gate.hold) await gate.hold
        // Como o narrador real: grava o estado pela ferramenta (recusada se a geração foi interrompida).
        const tools = await import("@/features/maddox/server/master-tools")
        await tools
            .runMaddoxTool(tools.findMaddoxTool("update_campaign_state")!, { campaignId: new mongoose.Types.ObjectId(context.campaignId), turnNumber: context.turnNumber, jobId: context.jobId }, { scene: `Cena do turno ${context.turnNumber}` })
            .catch((error: unknown) => gate.toolErrors.push(error instanceof Error ? error.message : String(error)))
        return `Narração do turno ${context.turnNumber}`
    }),
    answer: vi.fn(async (_context: MaddoxAnswerContext, sink: MaddoxMasterSink) => {
        sink.delta("Resposta.")
        return "Resposta."
    }),
}
vi.mock("@/features/maddox/server/game-master", () => ({ getMaddoxMaster: vi.fn(async () => fakeMaster) }))
const rotateNarratorSession = vi.fn(async (campaignId: string) => void campaignId)
vi.mock("@/features/maddox/server/opencode-sessions", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/opencode-sessions")>()), rotateNarratorSession }))

/** Engramind do reinício: os tokens dos NPCs Opex e a exclusão das memórias (com a rede fora quando pedido). */
const net = vi.hoisted(() => ({ down: false, purges: [] as { campaignId: string; npcIds: string[] }[], boxes: new Map<string, unknown>() }))
vi.mock("@/features/engramind/server/campaign-rewind", () => {
    class MemoryRewindUnavailableError extends Error {
        constructor(readonly cause: unknown) {
            super("rede fora")
        }
    }
    return {
        MEMORY_REWIND_UNAVAILABLE: "A rede de memórias está indisponível. Nada mudou na mesa; tente de novo em instantes.",
        MemoryRewindUnavailableError,
        npcTokenBoxesOf: vi.fn(async () => new Map(net.boxes)),
        purgeCampaignMemories: vi.fn(async (campaignId: string, boxes: ReadonlyMap<string, unknown>) => {
            if (net.down) throw new MemoryRewindUnavailableError(new Error("ECONNREFUSED"))
            net.purges.push({ campaignId, npcIds: [...boxes.keys()] })
            return 3
        }),
        resolveRewindChannels: vi.fn(async () => null),
        stashPendingWrites: vi.fn(async () => []),
        restorePendingWrites: vi.fn(async () => undefined),
    }
})

const models = await import("@/features/maddox/models")
const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCampaignSnapshotModel, MaddoxSceneImageModel, INCLUDE_DISCARDED } = models
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const reset = await import("@/features/maddox/server/campaign-reset")
const live = await import("@/features/maddox/server/game-live")
const { waitForOpexIdle } = await import("@/features/maddox/server/opex-runtime")
const { MADDOX_CAMPAIGN_CHANGED_EVENT, MADDOX_RESET_TEXTS } = await import("@/features/maddox/constants")

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
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", setting: "Um reino em brumas.", openingSituation: "Uma taverna.", density: "rica", combatDifficulty: "dificil", hidePlayerActions: true, startingStage: "Novatos" } })
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
        const character = await MaddoxCharacterModel.create({ campaignId: created.id, memberId: member!._id, userId, name: `Herói ${index}`, portraitUrl: `https://img/heroi-${index}.png`, profile: { identidade: `Herói ${index}` }, interview: { status: "done", scriptVersion: 0 } })
        await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
        seats.push({ userId, memberId: String(member!._id), characterId: String(character._id) })
    }
    return { id: created.id, owner, seats, token }
}

const settle = async <T>(id: string, action: Promise<T>) => {
    const result = await action
    await live.waitForCampaignIdle(id)
    await waitForOpexIdle()
    return result
}

/** Inicia e joga até o turno `n` (vez dos jogadores aberta). */
async function playTo(n: number, players = 2) {
    const setup = await table(players)
    await settle(setup.id, game.startCampaign(setup.id, setup.owner))
    for (let turn = 1; turn < n; turn++) {
        for (const [index, seat] of setup.seats.entries()) await settle(setup.id, game.submitGameAction(setup.id, { kind: "declaration", content: `Ação ${turn}-${index}` }, seat.userId))
    }
    return setup
}

/** O que a partida cria fora das mensagens: NPC, combate, preparação, imagem, reparo e gravação pendente. */
async function seedPlayedTable(id: string, characterId: string) {
    const db = mongoose.connection.db!
    const campaignId = new mongoose.Types.ObjectId(id)
    const npcId = new mongoose.Types.ObjectId()
    await db.collection("maddox_npcs").insertOne({ _id: npcId, campaignId, name: "Goblin", nameKey: "goblin", visibility: "players" })
    const combatId = new mongoose.Types.ObjectId()
    await db.collection("maddox_combats").insertOne({ _id: combatId, campaignId, title: "Emboscada", status: "active", startedTurn: 2, combatants: [] })
    await db.collection("maddox_combat_preps").insertOne({ campaignId, combatId, actorKey: "pc:1", characterId: new mongoose.Types.ObjectId(characterId), memberId: new mongoose.Types.ObjectId(), userId: "u", status: "ready" })
    await db.collection("maddox_scene_images").insertOne({ campaignId, turnNumber: 2, source: "manual", slot: "manual", status: "done", counts: true, url: "https://img/cena.png", key: "maddox/cena.png", createdAt: new Date(), updatedAt: new Date(), discardedBy: null })
    await db.collection("maddox_memory_repairs").insertOne({ _id: `${id}:m_1` as never, campaignId, memoryId: "m_1", ref: { kind: "campaign" }, window: { after: new Date(), upTo: new Date() }, attempts: 0 })
    await db.collection("engramind_pending_writes").insertOne({ _id: `${id}:k` as never, campaignId: id, key: "k", channel: "c", body: {}, createdAt: new Date(), updatedAt: new Date() })
    await MaddoxCharacterModel.updateOne({ _id: characterId }, { $set: { currentState: "Ferido na perna", currentStatePublic: true, status: "dead" } })
    return { npcId: String(npcId) }
}

const campaignOf = (id: string) => MaddoxCampaignModel.findById(id).select("+invite.token").lean()
const allMessages = (id: string) => MaddoxCampaignMessageModel.find({ campaignId: id }).setOptions(INCLUDE_DISCARDED).lean()

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_reset_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxCampaignSnapshotModel.init(), MaddoxSceneImageModel.init()])
}, 180_000)

afterAll(async () => {
    await reset.waitForCampaignResets()
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    const db = mongoose.connection.db!
    for (const collection of await db.collections()) await collection.deleteMany({})
    net.down = false
    net.purges = []
    net.boxes = new Map()
    gate.hold = null
    gate.signals = []
    gate.toolErrors = []
    for (const mock of [recordAudit, publishToChannels, rotateNarratorSession, deleteFile, syncCampaignChannelLifecycle, retireOpexNpcAgent, fakeMaster.narrate, fakeMaster.answer]) mock.mockClear()
    const { campaignMemoriesStore } = await import("../../helpers/campaign-memories-mock")
    campaignMemoriesStore.reset()
})

describe("reinício completo", () => {
    it("apaga a história jogada e devolve a campanha ao lobby do fim das entrevistas", async () => {
        const { id, owner, seats } = await playTo(3)
        const { npcId } = await seedPlayedTable(id, seats[1]!.characterId)
        net.boxes = new Map([[npcId, { iv: "x" }]])
        expect((await allMessages(id)).length).toBeGreaterThan(0)
        expect(await MaddoxCampaignSnapshotModel.countDocuments({ campaignId: id, kind: "turn" })).toBeGreaterThan(0)

        const detail = await settle(id, reset.resetCampaign(id, owner))
        expect(detail.status).toBe("lobby")
        expect(detail.canReset).toBe(false)
        expect(detail.resetting).toBe(false)

        const campaign = await campaignOf(id)
        expect(campaign!.status).toBe("lobby")
        expect(campaign!.turn).toMatchObject({ number: 0, phase: "master", generating: null, eligibleMemberIds: [], declaredMemberIds: [], opexActor: null, combatActor: null })
        expect(campaign!.state).toMatchObject({ scene: "", location: "", situation: "", pendingDecision: "" })
        expect(campaign!.rewind ?? null).toBeNull()
        expect(campaign!.memoryRepair ?? null).toBeNull()
        expect(campaign!.reset).toMatchObject({ status: "done", memories: "done", previousStatus: "active", byUserId: owner })

        const db = mongoose.connection.db!
        expect(await allMessages(id)).toHaveLength(0)
        for (const name of ["maddox_npcs", "maddox_combats", "maddox_combat_preps", "maddox_memory_repairs"]) expect(await db.collection(name).countDocuments({ campaignId: new mongoose.Types.ObjectId(id) })).toBe(0)
        expect(await db.collection("engramind_pending_writes").countDocuments({ campaignId: id })).toBe(0)
        expect(await MaddoxCampaignSnapshotModel.countDocuments({ campaignId: id, kind: { $ne: "start" } })).toBe(0)
        // Imagem: some da tela e do arquivo, mas o registro segue no teto diário.
        const images = await MaddoxSceneImageModel.find({ campaignId: id }).setOptions(INCLUDE_DISCARDED).lean()
        expect(images).toHaveLength(1)
        expect(images[0]).toMatchObject({ slot: "discarded", url: null, key: null, counts: true })
        expect(await MaddoxSceneImageModel.countDocuments({ campaignId: id })).toBe(0)
        await vi.waitFor(() => expect(deleteFile).toHaveBeenCalledWith("maddox/cena.png"))

        // Memórias nos canais da campanha e dos NPCs Opex; o agente do NPC apagado é aposentado.
        expect(net.purges).toEqual([{ campaignId: id, npcIds: [npcId] }])
        await vi.waitFor(() => expect(retireOpexNpcAgent).toHaveBeenCalledWith({ campaignId: id, npcId }))
        expect(rotateNarratorSession).toHaveBeenCalledWith(id)

        const characters = await MaddoxCharacterModel.find({ campaignId: id }).lean()
        for (const character of characters) expect(character).toMatchObject({ currentState: "", currentStatePublic: false, status: "active" })

        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: owner, entidade: "CampanhaMaddox", entidadeId: id, antes: { status: "active", turn: 3 }, depois: expect.objectContaining({ reset: "lobby" }) }))
        expect(publishToChannels.mock.calls.some(([channels, event]) => event === MADDOX_CAMPAIGN_CHANGED_EVENT && seats.every((seat) => channels.includes(`private-maddox-u-${seat.userId}`)))).toBe(true)
    })

    it("preserva cenário, configurações, convite, membros e personagens; dá para iniciar de novo", async () => {
        const { id, owner, seats, token } = await playTo(2)
        const before = await campaignOf(id)
        await settle(id, reset.resetCampaign(id, owner))
        const after = await campaignOf(id)
        for (const key of ["name", "rigor", "setting", "openingSituation", "density", "combatDifficulty", "hidePlayerActions", "showCheckDc", "sceneImages", "startingStage", "scriptVersions"] as const) expect(after![key]).toEqual(before![key])
        expect(after!.scenarioInterview.status).toBe("done")
        expect(after!.invite.token).toBe(token)
        expect(await MaddoxCampaignMemberModel.countDocuments({ campaignId: id, status: "joined" })).toBe(seats.length)
        const characters = await MaddoxCharacterModel.find({ campaignId: id }).sort({ name: 1 }).lean()
        expect(characters.map((character) => [character.name, character.portraitUrl, character.interview.status])).toEqual(seats.map((_, index) => [`Herói ${index}`, `https://img/heroi-${index}.png`, "done"]))

        const restarted = await settle(id, game.startCampaign(id, owner))
        expect(restarted.status).toBe("active")
        expect(restarted.turn.number).toBe(1)
        expect((await campaignOf(id))!.reset ?? null).toBeNull()
        expect((await allMessages(id)).filter((message) => message.kind === "narration").map((message) => message.content)).toEqual(["Narração do turno 1"])
    })

    it("quem saiu ou foi removido continua fora", async () => {
        const { id, owner, seats } = await playTo(2, 3)
        await campaigns.removeMember(id, seats[2]!.memberId, owner)
        await settle(id, reset.resetCampaign(id, owner))
        expect(await MaddoxCampaignMemberModel.findById(seats[2]!.memberId).lean()).toMatchObject({ status: "removed" })
    })
})

describe("permissões e fases", () => {
    it("jogador recebe 403 e quem não participa, 404", async () => {
        const { id, seats } = await playTo(2)
        await expect(reset.resetCampaign(id, seats[1]!.userId)).rejects.toMatchObject({ status: 403, message: MADDOX_RESET_TEXTS.forbidden })
        await expect(reset.resetCampaign(id, await seedUser("estranho"))).rejects.toMatchObject({ status: 404 })
        expect((await campaignOf(id))!.status).toBe("active")
        expect((await campaigns.getCampaignDetail(id, seats[1]!.userId)).canReset).toBe(false)
    })

    it("no lobby (nunca iniciada) e em entrevista a operação é recusada", async () => {
        const { id, owner } = await table(1)
        expect((await campaigns.getCampaignDetail(id, owner)).canReset).toBe(false)
        await expect(reset.resetCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_NOT_STARTED", message: MADDOX_RESET_TEXTS.notStarted })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { status: "interview" } })
        await expect(reset.resetCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_NOT_STARTED" })
    })

    it.each(["paused", "ended", "archived"] as const)("campanha %s também volta ao lobby", async (status) => {
        const { id, owner } = await playTo(2)
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { status } })
        expect((await campaigns.getCampaignDetail(id, owner)).canReset).toBe(true)
        await settle(id, reset.resetCampaign(id, owner))
        expect((await campaignOf(id))!.status).toBe("lobby")
        // Arquivada: os canais das memórias voltam antes da limpeza.
        if (status === "archived") expect(syncCampaignChannelLifecycle).toHaveBeenCalledWith(expect.objectContaining({ id, status: "lobby" }), owner)
        else expect(syncCampaignChannelLifecycle).not.toHaveBeenCalled()
    })
})

describe("idempotência e falhas", () => {
    it("reiniciar duas vezes seguidas não muda nada e não dá erro", async () => {
        const { id, owner } = await playTo(2)
        await settle(id, reset.resetCampaign(id, owner))
        const first = await campaignOf(id)
        recordAudit.mockClear()
        const again = await settle(id, reset.resetCampaign(id, owner))
        expect(again.status).toBe("lobby")
        const second = await campaignOf(id)
        expect(second!.reset).toEqual(first!.reset)
        expect(net.purges).toHaveLength(1)
        expect(recordAudit).not.toHaveBeenCalled()
    })

    it("limpeza interrompida no meio (processo reiniciado): repetir o reinício chega ao estado completo", async () => {
        const { id, owner } = await playTo(3)
        // Estado de uma limpeza que parou depois de virar lobby: as mensagens ainda estão lá.
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { status: "lobby", reset: { id: "r-velho", status: "cleaning", previousStatus: "active", byUserId: owner, startedAt: new Date(), completedAt: null, memories: "pending", npcTokenBoxes: {}, lastError: null } } })
        await expect(game.startCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "RESET_IN_PROGRESS", message: MADDOX_RESET_TEXTS.inProgress })
        expect((await campaigns.getCampaignDetail(id, owner)).resetting).toBe(true)
        await reset.waitForCampaignResets()
        await settle(id, reset.resetCampaign(id, owner))
        expect(await allMessages(id)).toHaveLength(0)
        expect((await campaignOf(id))!.reset).toMatchObject({ id: "r-velho", status: "done", memories: "done" })
    })

    it("Engramind fora do ar: a campanha fica no lobby, o início é recusado e a nova tentativa apaga as memórias", async () => {
        const { id, owner } = await playTo(2)
        net.down = true
        const detail = await settle(id, reset.resetCampaign(id, owner))
        expect(detail.status).toBe("lobby")
        expect((await campaignOf(id))!.reset).toMatchObject({ status: "done", memories: "pending", lastError: expect.stringContaining("ECONNREFUSED") })
        await expect(game.startCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "ENGRAMIND_UNAVAILABLE", message: MADDOX_RESET_TEXTS.memoriesPending })

        net.down = false
        expect(await reset.processPendingResetPurges()).toBe(1)
        expect((await campaignOf(id))!.reset).toMatchObject({ memories: "done", lastError: null })
        expect((await settle(id, game.startCampaign(id, owner))).status).toBe("active")
    })

    it("o novo reinício também refaz as memórias pendentes", async () => {
        const { id, owner } = await playTo(2)
        net.down = true
        await settle(id, reset.resetCampaign(id, owner))
        net.down = false
        await settle(id, reset.resetCampaign(id, owner))
        expect((await campaignOf(id))!.reset).toMatchObject({ memories: "done" })
        expect(net.purges).toHaveLength(1)
    })
})

describe("interrupção da mesa", () => {
    it("a narração em andamento é interrompida e nada dela é gravado depois do reinício", async () => {
        const { id, owner } = await table(2)
        let release!: () => void
        gate.hold = new Promise<void>((resolve) => (release = resolve))
        const lines: MaddoxGameStreamLine[] = []
        const unsubscribe = live.subscribeGameLive(id, (line) => lines.push(line))
        await game.startCampaign(id, owner)
        await vi.waitFor(() => expect(fakeMaster.narrate).toHaveBeenCalledTimes(1))
        // Um job que entrou na fila antes do reinício é descartado.
        const queued = vi.fn(async () => undefined)
        void live.enqueueMaddoxJob(id, "pergunta na fila", queued)

        await reset.resetCampaign(id, owner)
        expect(gate.signals[0]!.aborted).toBe(true)
        expect(lines.some((line) => line.type === "live-end" && line.messageId === null)).toBe(true)
        release()
        await live.waitForCampaignIdle(id)
        await new Promise((resolve) => setTimeout(resolve, 50))
        unsubscribe()

        expect(queued).not.toHaveBeenCalled()
        expect(gate.toolErrors).toEqual(["Esta narração foi interrompida: a campanha foi reiniciada."])
        expect(await allMessages(id)).toHaveLength(0)
        const campaign = await campaignOf(id)
        expect(campaign!.status).toBe("lobby")
        expect(campaign!.state.scene).toBe("")
        expect(campaign!.turn.generating).toBeNull()
        expect(live.isCampaignBusy(id)).toBe(false)
    })

    it("a narração que já está gravando no momento do reinício: a limpeza espera o job e nada sobra depois", async () => {
        const { id, owner } = await table(2)
        // A gravação das mensagens da narração fica segurada até depois de o dono confirmar o reinício.
        let releaseWrite!: () => void
        const writeGate = new Promise<void>((resolve) => (releaseWrite = resolve))
        let writing!: () => void
        const writeStarted = new Promise<void>((resolve) => (writing = resolve))
        const original = MaddoxCampaignMessageModel.insertMany.bind(MaddoxCampaignMessageModel)
        const spy = vi.spyOn(MaddoxCampaignMessageModel, "insertMany").mockImplementationOnce((async (...args: Parameters<typeof original>) => {
            writing()
            await writeGate
            return original(...args)
        }) as never)
        await game.startCampaign(id, owner)
        await writeStarted

        const resetting = reset.resetCampaign(id, owner)
        let finished = false
        void resetting.then(() => (finished = true))
        await new Promise((resolve) => setTimeout(resolve, 100))
        // A limpeza não roda antes de o job interrompido terminar a gravação.
        expect(finished).toBe(false)
        releaseWrite()
        await resetting
        await live.waitForCampaignIdle(id)
        spy.mockRestore()

        expect(await allMessages(id)).toHaveLength(0)
        expect(await MaddoxCampaignSnapshotModel.countDocuments({ campaignId: id, kind: "turn" })).toBe(0)
        const campaign = await campaignOf(id)
        expect(campaign!.status).toBe("lobby")
        expect(campaign!.turn).toMatchObject({ number: 0, phase: "master", generating: null })
        expect(campaign!.reset).toMatchObject({ status: "done" })
    })

    it("execução viva de um Personagem Opex que não termina: a limpeza segue depois do teto de espera", async () => {
        const { id, owner } = await playTo(2)
        const { runOpexOnce } = await import("@/features/maddox/server/opex-runtime")
        let releaseRun!: () => void
        const stuck = new Promise<void>((resolve) => (releaseRun = resolve))
        void runOpexOnce(`combat:${id}`, () => stuck)
        const startedAt = Date.now()
        await reset.resetCampaign(id, owner)
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(4_000)
        expect(await allMessages(id)).toHaveLength(0)
        expect((await campaignOf(id))!.reset).toMatchObject({ status: "done" })
        releaseRun()
        await waitForOpexIdle()
    })

    it("a mesa aberta recebe o reinício pelo estado (status lobby com resetAt)", async () => {
        const { id, owner, seats } = await playTo(2)
        expect((await game.getGameState(id, seats[1]!.userId)).resetAt ?? null).toBeNull()
        await settle(id, reset.resetCampaign(id, owner))
        const state = await game.getGameState(id, seats[1]!.userId)
        expect(state.status).toBe("lobby")
        expect(state.resetAt).toEqual(expect.any(String))
        await expect(game.submitGameAction(id, { kind: "declaration", content: "Ainda aqui" }, seats[1]!.userId)).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_NOT_ACTIVE" })
    })
})
