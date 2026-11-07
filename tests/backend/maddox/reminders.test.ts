import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * Injetar Lembrança (DND-25): o serviço de envio e o ciclo com o narrador REAL (`narrator.ts`, ferramentas e prompt)
 * sobre um `streamText` roteirizado — a lembrança entra na próxima narração, o Maddox decide guardar ou não
 * (`resolve_reminder`) e o status muda depois de a narração ser gravada.
 */

type ToolCall = { name: string; input: Record<string, unknown> }
type Step = { tools?: ToolCall[]; text?: string }

const calls: { instructions: string; userText: string; toolNames: string[] }[] = []
/** Roteiro por geração (na ordem em que o narrador é chamado). */
const script: Step[][] = []
const failNext = { value: false }
/** Chamado no começo de cada geração (ex.: enviar uma lembrança enquanto o Maddox narra). */
const hooks: { onStream: (() => Promise<void>) | null } = { onStream: null }

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
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
vi.mock("@/features/ai/server/memory-block", () => ({ memoryBlock: vi.fn(async () => "- Narre sempre com calma.") }))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: vi.fn(async () => undefined) }))
vi.mock("@/lib/ai/stream", () => ({
    prepareModel: vi.fn(async () => ({ model: {}, dispose: async () => undefined })),
    samplingOptions: () => ({}),
    describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock("ai", () => ({
    dynamicTool: (def: unknown) => def,
    stepCountIs: (count: number) => ({ count }),
    streamText: (options: { instructions: string; messages: { content: string }[]; tools: Record<string, { execute: (input: unknown, meta: unknown) => Promise<unknown> }> }) => {
        const steps = script.shift() ?? [{ text: "O mundo segue." }]
        calls.push({ instructions: options.instructions, userText: options.messages[0]!.content, toolNames: Object.keys(options.tools) })
        return {
            fullStream: (async function* () {
                if (hooks.onStream) {
                    const hook = hooks.onStream
                    hooks.onStream = null
                    await hook()
                }
                if (failNext.value) {
                    failNext.value = false
                    yield { type: "error", error: new Error("provedor fora do ar") }
                    return
                }
                let index = 0
                for (const step of steps) {
                    yield { type: "start-step" }
                    for (const call of step.tools ?? []) {
                        const toolCallId = `call-${index++}`
                        yield { type: "tool-call", toolCallId, toolName: call.name, input: call.input }
                        try {
                            const output = await options.tools[call.name]!.execute(call.input, { toolCallId })
                            yield { type: "tool-result", toolCallId, toolName: call.name, output }
                        } catch (error) {
                            yield { type: "tool-error", toolCallId, toolName: call.name, error }
                        }
                    }
                    if (step.text) for (const piece of step.text.match(/[\s\S]{1,12}/g) ?? []) yield { type: "text-delta", text: piece }
                }
                yield { type: "finish", finishReason: "stop", totalUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }
            })(),
        }
    },
}))

vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)
const { campaignMemoriesStore } = await import("../../helpers/campaign-memories-mock")
const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const reminders = await import("@/features/maddox/server/reminders")
const { recordAudit } = await import("@/lib/db")
const memoriesModule = await import("@/features/engramind/server/campaign-memories")

let mongo: MongoMemoryServer

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function giveCharacter(campaignId: string, userId: string, name: string, done = true) {
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const character = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name, profile: {}, interview: { status: done ? "done" : "in-progress", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
}

/** Mesa narrativa com Lyra (dona) e Doran, já em jogo (o turno 1 do mestre narrado). */
async function activeTable(options: { doranReady?: boolean } = {}) {
    const owner = await seedUser("dono")
    const created = await campaigns.createCampaign({ name: "Brumas", rigor: "narrativo" }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", setting: "Porto na névoa.", openingSituation: "O farol se apagou." } })
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const player = await seedUser("jogadora")
    await campaigns.joinByInvite(token, player)
    await giveCharacter(created.id, owner, "Lyra")
    await giveCharacter(created.id, player, "Doran", options.doranReady ?? true)
    return { id: created.id, owner, player }
}

async function start(id: string, owner: string) {
    await game.startCampaign(id, owner)
    await waitForCampaignIdle(id)
}

const remindersOf = async (id: string) => MaddoxCampaignMessageModel.find({ campaignId: id, kind: "reminder" }).sort({ _id: 1 }).lean()

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_reminders_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxNpcModel.init()])
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
    failNext.value = false
    hooks.onStream = null
    vi.mocked(recordAudit).mockClear()
})

describe("DND-25 — Injetar Lembrança", () => {
    it("recusa fora de jogo e para quem não concluiu a entrevista; o envio vale para todos, é auditado e não mexe no turno", async () => {
        const { id, owner, player } = await activeTable({ doranReady: false })
        await expect(reminders.submitReminder(id, { texto: "Lembre-se do Alerta." }, owner)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_ACTIVE", message: "A campanha não está em andamento." })
        await start(id, owner)
        await expect(reminders.submitReminder(id, { texto: "Sou forte." }, player)).rejects.toMatchObject({ code: "INTERVIEW_REQUIRED" })
        await expect(reminders.submitReminder(id, { texto: "Oi" }, await seedUser("estranho"))).rejects.toMatchObject({ status: 404 })

        const before = (await MaddoxCampaignModel.findById(id).lean())!.turn
        const state = await reminders.submitReminder(id, { texto: "Lembre-se que tenho o talento Alerta." }, owner)
        const after = (await MaddoxCampaignModel.findById(id).lean())!.turn
        expect(after).toMatchObject({ number: before.number, phase: before.phase })
        expect(after.declaredMemberIds).toEqual([])
        const line = state.messages.find((message) => message.kind === "reminder")!
        expect(line).toMatchObject({ characterName: "Lyra", content: "Lembre-se que tenho o talento Alerta.", reminder: { status: "pending" } })
        expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ userId: owner, entidadeId: id, acao: "CRIAR", depois: expect.objectContaining({ reminder: line.id }) }))
        // Toda a mesa vê a linha.
        expect((await game.getGameState(id, player)).messages.some((message) => message.kind === "reminder" && message.id === line.id)).toBe(true)
    })

    it("a próxima narração considera cada lembrança; guardada vira memória no canal escolhido e a outra fica só para o turno", async () => {
        const { id, owner, player } = await activeTable()
        await start(id, owner)
        await reminders.submitReminder(id, { texto: "Tenho o talento Alerta: não posso ser surpreendido." }, owner)
        await reminders.submitReminder(id, { texto: "Estou com o braço ferido." }, player)
        const [alert, arm] = await remindersOf(id)
        script.push([
            {
                tools: [{ name: "resolve_reminder", input: { lembranca: String(alert!._id).slice(-6), guardar: true, tipo: "fato", titulo: "Lyra tem Alerta", texto: "Lyra tem o talento Alerta e não é surpreendida.", visibility: "master" } }],
                text: "Lyra percebe o movimento antes de todos.",
            },
        ])
        await game.submitGameAction(id, { kind: "declaration", content: "Lyra vigia o cais." }, owner)
        await game.submitGameAction(id, { kind: "declaration", content: "Doran espera." }, player)
        await waitForCampaignIdle(id)
        const prompt = calls.at(-1)!.userText
        expect(prompt).toContain("## Lembranças dos jogadores (considere nesta narração)")
        expect(prompt).toContain(`[${String(alert!._id).slice(-6)}] **Lyra**: Tenho o talento Alerta: não posso ser surpreendido.`)
        expect(prompt).toContain(`[${String(arm!._id).slice(-6)}] **Doran**: Estou com o braço ferido.`)
        expect(calls.at(-1)!.toolNames).toContain("resolve_reminder")
        const [savedAlert, usedArm] = await remindersOf(id)
        expect(savedAlert!.reminder).toMatchObject({ status: "saved", visibility: "master", memoryTitle: "Lyra tem Alerta" })
        expect(usedArm!.reminder).toMatchObject({ status: "discarded" })
        expect(campaignMemoriesStore.all(id)).toEqual([expect.objectContaining({ title: "Lyra tem Alerta", visibility: "master", kind: "fato" })])
        // Já avaliadas: a narração seguinte não as recebe de novo, e elas não entram na transcrição.
        await game.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "pass" }, player)
        await waitForCampaignIdle(id)
        expect(calls.at(-1)!.userText).not.toContain("Lembranças dos jogadores")
        expect(calls.at(-1)!.userText).not.toContain("braço ferido")
        const view = await game.getGameState(id, player)
        expect(view.messages.filter((message) => message.kind === "reminder").map((message) => message.reminder!.status)).toEqual(["saved", "discarded"])
    })

    it("enviada durante a narração vale para a seguinte; a geração que falha devolve a lembrança à espera", async () => {
        const { id, owner, player } = await activeTable()
        await start(id, owner)
        // Durante a geração do turno 3: a lembrança chega no meio e espera a próxima narração.
        hooks.onStream = async () => {
            await reminders.submitReminder(id, { texto: "Carrego uma tocha acesa." }, player)
        }
        await game.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "declaration", content: "Doran entra na caverna." }, player)
        await waitForCampaignIdle(id)
        expect(calls.at(-1)!.userText).not.toContain("tocha")
        expect((await remindersOf(id))[0]!.reminder).toMatchObject({ status: "pending", jobId: null })

        // A geração seguinte falha: a lembrança volta a esperar e só a nova tentativa a avalia.
        failNext.value = true
        await game.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "pass" }, player)
        await waitForCampaignIdle(id)
        expect(calls.at(-1)!.userText).toContain("Carrego uma tocha acesa.")
        expect((await remindersOf(id))[0]!.reminder).toMatchObject({ status: "pending", jobId: null })
        expect((await game.getGameState(id, owner)).messages.find((message) => message.kind === "reminder")!.reminder!.status).toBe("pending")

        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.failedAt": new Date(Date.now() - 60_000) } })
        await game.checkTurn(id, owner)
        await waitForCampaignIdle(id)
        expect(calls.at(-1)!.userText).toContain("Carrego uma tocha acesa.")
        expect((await remindersOf(id))[0]!.reminder!.status).toBe("discarded")
    })

    it("falha ao gravar a situação das lembranças não derruba a narração já gravada (sem narração duplicada)", async () => {
        const { id, owner, player } = await activeTable()
        await start(id, owner)
        await reminders.submitReminder(id, { texto: "Tenho um mapa." }, owner)
        const original = MaddoxCampaignMessageModel.updateOne.bind(MaddoxCampaignMessageModel)
        const spy = vi.spyOn(MaddoxCampaignMessageModel, "updateOne").mockImplementation(((filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }, options: never) => {
            if (filter?.["reminder.status"] === "pending" && update?.$set?.["reminder.status"]) throw new Error("banco indisponível")
            return original(filter as never, update as never, options)
        }) as never)
        await game.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "pass" }, player)
        await waitForCampaignIdle(id)
        spy.mockRestore()
        const campaign = (await MaddoxCampaignModel.findById(id).lean())!
        expect(campaign.turn).toMatchObject({ phase: "players", failedAt: null })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "narration", turnNumber: campaign.turn.number - 1 })).toBe(1)
        // A lembrança volta a esperar a próxima narração.
        expect((await remindersOf(id))[0]!.reminder).toMatchObject({ status: "pending", jobId: null })
    })

    it("a resposta a uma pergunta não consome as lembranças", async () => {
        const { id, owner, player } = await activeTable()
        await start(id, owner)
        await reminders.submitReminder(id, { texto: "Falo élfico." }, player)
        await game.submitGameAction(id, { kind: "question", content: "O que diz a placa?" }, owner)
        await waitForCampaignIdle(id)
        expect(calls.at(-1)!.userText).not.toContain("Falo élfico.")
        expect((await remindersOf(id))[0]!.reminder!.status).toBe("pending")
    })

    it("com a rede de memórias fora, a gravação vai para a fila e o aviso mostra 'Guardada como memória'", async () => {
        const { id, owner, player } = await activeTable()
        await start(id, owner)
        await reminders.submitReminder(id, { texto: "Sou devoto de Tymora." }, owner)
        const [devotion] = await remindersOf(id)
        const save = vi.spyOn(memoriesModule, "saveCampaignMemory").mockResolvedValueOnce({ saved: true, created: false, pending: true, aviso: "fila" })
        script.push([{ tools: [{ name: "resolve_reminder", input: { lembranca: String(devotion!._id).slice(-6), guardar: true, titulo: "Fé de Lyra", texto: "Lyra é devota de Tymora." } }], text: "A moeda gira." }])
        await game.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "pass" }, player)
        await waitForCampaignIdle(id)
        expect(save).toHaveBeenCalledWith(id, expect.objectContaining({ title: "Fé de Lyra", visibility: "players", kind: "fato" }))
        expect((await remindersOf(id))[0]!.reminder!.status).toBe("saved")
        save.mockRestore()
    })

    it("resolve_reminder recusa id desconhecido e pede título e texto para guardar (decisão pura do job)", () => {
        const campaignId = new mongoose.Types.ObjectId()
        expect(reminders.decideReminder(campaignId, undefined, { lembranca: "abc", guardar: false })).toBe("Não há lembranças dos jogadores nesta narração.")
    })
})
