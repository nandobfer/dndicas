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
        calls.push({ instructions: options.instructions, userText: options.messages[0]!.content, toolNames: Object.keys(options.tools) })
        return {
            fullStream: (async function* () {
                if (hooks.onStream) {
                    const hook = hooks.onStream
                    hooks.onStream = null
                    await hook()
                }
                // Lido depois do gancho: o roteiro pode depender do que o gancho criou (ex.: o id de um lembrete).
                const steps = script.shift() ?? [{ text: "O mundo segue." }]
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
        await expect(reminders.submitTalk(id, { texto: "Lembre-se do Alerta." }, owner)).rejects.toMatchObject({ code: "CAMPAIGN_NOT_ACTIVE", message: "A campanha não está em andamento." })
        await start(id, owner)
        await expect(reminders.submitTalk(id, { texto: "Sou forte." }, player)).rejects.toMatchObject({ code: "INTERVIEW_REQUIRED" })
        await expect(reminders.submitTalk(id, { texto: "Oi" }, await seedUser("estranho"))).rejects.toMatchObject({ status: 404 })

        const before = (await MaddoxCampaignModel.findById(id).lean())!.turn
        const state = await reminders.submitTalk(id, { texto: "Lembre-se que tenho o talento Alerta." }, owner)
        const after = (await MaddoxCampaignModel.findById(id).lean())!.turn
        expect(after).toMatchObject({ number: before.number, phase: before.phase })
        expect(after.declaredMemberIds).toEqual([])
        const line = state.messages.find((message) => message.kind === "reminder")!
        expect(line).toMatchObject({ characterName: "Lyra", content: "Lembre-se que tenho o talento Alerta.", reminder: { status: "pending" } })
        expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ userId: owner, entidadeId: id, acao: "CRIAR", depois: expect.objectContaining({ talk: line.id }) }))
        // Toda a mesa vê a linha.
        expect((await game.getGameState(id, player)).messages.some((message) => message.kind === "reminder" && message.id === line.id)).toBe(true)
    })

    it("DND-59: o lembrete é corrigido na hora num job próprio (resposta à mesa); guardado vira memória e o outro fica só para o momento", async () => {
        const { id, owner, player } = await activeTable()
        await start(id, owner)
        const before = calls.length
        // O id só existe depois do envio: o roteiro do job do lembrete é montado no começo da geração dele.
        hooks.onStream = async () => {
            const [alert] = await remindersOf(id)
            script.push([
                {
                    tools: [{ name: "resolve_reminder", input: { lembranca: String(alert!._id).slice(-6), guardar: true, tipo: "fato", titulo: "Lyra tem Alerta", texto: "Lyra tem o talento Alerta e não é surpreendida.", visibility: "master" } }],
                    text: "Anotado: Lyra não é surpreendida.",
                },
            ])
        }
        await reminders.submitTalk(id, { texto: "Tenho o talento Alerta: não posso ser surpreendido." }, owner)
        await waitForCampaignIdle(id)
        const [alert] = await remindersOf(id)
        await reminders.submitTalk(id, { texto: "Estou com o braço ferido." }, player)
        await waitForCampaignIdle(id)
        const [, arm] = await remindersOf(id)
        const fixes = calls.slice(before)
        expect(fixes).toHaveLength(2)
        expect(fixes[0]!.userText).toContain("# Conversa com o mestre (turno 1) — fora da mesa")
        expect(fixes[0]!.userText).toContain(`[${String(alert!._id).slice(-6)}] Jogador de **Lyra**: Tenho o talento Alerta: não posso ser surpreendido.`)
        expect(fixes[0]!.userText).toContain("Só diga que registrou, aplicou, removeu ou corrigiu algo depois que a ferramenta")
        expect(fixes[0]!.toolNames).toContain("resolve_reminder")
        expect(fixes[1]!.userText).toContain(`[${String(arm!._id).slice(-6)}] Jogador de **Doran**: Estou com o braço ferido.`)
        const [savedAlert, usedArm] = await remindersOf(id)
        expect(savedAlert!.reminder).toMatchObject({ status: "saved", visibility: "master", memoryTitle: "Lyra tem Alerta" })
        expect(usedArm!.reminder).toMatchObject({ status: "discarded" })
        expect(campaignMemoriesStore.all(id)).toEqual([expect.objectContaining({ title: "Lyra tem Alerta", visibility: "master", kind: "fato" })])
        // A resposta do Maddox ao lembrete aparece na mesa, ligada a ele.
        const answer = await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "answer", replyToId: alert!._id }).lean()
        expect(answer?.content).toContain("Lyra não é surpreendida")
        // Já resolvidos: a narração seguinte não os recebe de novo, e eles não entram na transcrição.
        await game.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "pass" }, player)
        await waitForCampaignIdle(id)
        expect(calls.at(-1)!.userText).not.toContain("Lembranças dos jogadores")
        expect(calls.at(-1)!.userText).not.toContain("braço ferido")
        const view = await game.getGameState(id, player)
        expect(view.messages.filter((message) => message.kind === "reminder").map((message) => message.reminder!.status)).toEqual(["saved", "discarded"])
    })

    it("DND-59: enviado durante a narração, é corrigido logo depois dela; a correção que falha devolve o lembrete à próxima narração", async () => {
        const { id, owner, player } = await activeTable()
        await start(id, owner)
        hooks.onStream = async () => {
            await reminders.submitTalk(id, { texto: "Carrego uma tocha acesa." }, player)
        }
        await game.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "declaration", content: "Doran entra na caverna." }, player)
        await waitForCampaignIdle(id)
        const narration = calls.at(-2)!
        expect(narration.userText).toContain("# Turno")
        expect(narration.userText).not.toContain("tocha")
        expect(calls.at(-1)!.userText).toContain("Jogador de **Doran**: Carrego uma tocha acesa.")
        expect((await remindersOf(id))[0]!.reminder!.status).toBe("discarded")

        // A correção falha: o lembrete volta a esperar e a próxima narração o considera.
        failNext.value = true
        await reminders.submitTalk(id, { texto: "Tenho uma corda." }, owner)
        await waitForCampaignIdle(id)
        expect((await remindersOf(id))[1]!.reminder).toMatchObject({ status: "pending", jobId: null })
        const failed = await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "answer", replyToId: (await remindersOf(id))[1]!._id }).lean()
        expect(failed?.error).toBeTruthy()
        await game.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "pass" }, player)
        await waitForCampaignIdle(id)
        expect(calls.at(-1)!.userText).toContain("## Lembranças dos jogadores (considere nesta narração)")
        expect(calls.at(-1)!.userText).toContain("**Lyra**: Tenho uma corda.")
        expect((await remindersOf(id))[1]!.reminder!.status).toBe("discarded")
    })

    it("falha ao gravar a situação do lembrete não derruba a resposta já gravada; ele volta a esperar", async () => {
        const { id, owner } = await activeTable()
        await start(id, owner)
        const original = MaddoxCampaignMessageModel.updateOne.bind(MaddoxCampaignMessageModel)
        const spy = vi.spyOn(MaddoxCampaignMessageModel, "updateOne").mockImplementation(((filter: Record<string, unknown>, update: { $set?: Record<string, unknown> }, options: never) => {
            if (filter?.["reminder.status"] === "pending" && update?.$set?.["reminder.status"]) throw new Error("banco indisponível")
            return original(filter as never, update as never, options)
        }) as never)
        await reminders.submitTalk(id, { texto: "Tenho um mapa." }, owner)
        await waitForCampaignIdle(id)
        spy.mockRestore()
        const [map] = await remindersOf(id)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "answer", replyToId: map!._id, error: null })).toBe(1)
        expect(map!.reminder).toMatchObject({ status: "pending", jobId: null })
    })

    it("DND-59: lembrete já resolvido (ou pego por uma narração) não gera correção duplicada", async () => {
        const { id, owner } = await activeTable()
        await start(id, owner)
        await reminders.submitTalk(id, { texto: "Falo élfico." }, owner)
        await waitForCampaignIdle(id)
        const [elvish] = await remindersOf(id)
        expect(elvish!.reminder!.status).toBe("discarded")
        expect(await reminders.claimReminder(new mongoose.Types.ObjectId(id), "outro-job", elvish!._id)).toBeNull()
        const total = calls.length
        await game.scheduleReminderFix(new mongoose.Types.ObjectId(id), elvish!._id)
        await waitForCampaignIdle(id)
        expect(calls.length).toBe(total)
    })

    it("com a rede de memórias fora, a gravação vai para a fila e o aviso mostra 'Guardada como memória'", async () => {
        const { id, owner } = await activeTable()
        await start(id, owner)
        const save = vi.spyOn(memoriesModule, "saveCampaignMemory").mockResolvedValueOnce({ saved: true, created: false, pending: true, aviso: "fila" })
        // O id só existe depois do envio: o roteiro lê o lembrete pendente na hora da geração.
        hooks.onStream = async () => {
            const [devotion] = await remindersOf(id)
            script.unshift([{ tools: [{ name: "resolve_reminder", input: { lembranca: String(devotion!._id).slice(-6), guardar: true, titulo: "Fé de Lyra", texto: "Lyra é devota de Tymora." } }], text: "A moeda gira." }])
        }
        await reminders.submitTalk(id, { texto: "Sou devoto de Tymora." }, owner)
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

describe("DND-74 — Conversar com o Mestre", () => {
    const talksOf = async (id: string) => (await remindersOf(id)).filter((item) => item.reminder?.talk)

    it("a mensagem é conversa fora da mesa: identificada pelo usuário, vista por todos e válida em qualquer fase", async () => {
        const { id, owner, player } = await activeTable()
        await start(id, owner)
        // Turno do mestre aguardando testes: a conversa continua liberada e não mexe no turno.
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.phase": "master", "turn.awaitingChecks": true } })
        const state = await reminders.submitTalk(id, { texto: "O que tem no chão?" }, player)
        await waitForCampaignIdle(id)
        const talk = state.messages.find((message) => message.kind === "reminder")!
        expect(talk).toMatchObject({ reminder: { talk: true }, authorName: "JOGADORA", characterName: "Doran" })
        expect((await MaddoxCampaignModel.findById(id).lean())!.turn).toMatchObject({ phase: "master", awaitingChecks: true })
        const ownerView = await game.getGameState(id, owner)
        expect(ownerView.messages.find((message) => message.id === talk.id)).toMatchObject({ authorName: "JOGADORA" })
    })

    it("lembrança resolvida só por correção: sem balão, com a linha \"Lembrança injetada: …\"; não volta na narração seguinte", async () => {
        const { id, owner, player } = await activeTable()
        await start(id, owner)
        hooks.onStream = async () => {
            const [talk] = await talksOf(id)
            script.unshift([{ tools: [{ name: "resolve_reminder", input: { lembranca: String(talk!._id).slice(-6), guardar: false, resultado: "Doran tem vantagem no teste por causa da furtividade ativa" } }] }])
        }
        await reminders.submitTalk(id, { texto: "Lembre que estou furtivo: o teste devia ter vantagem." }, player)
        await waitForCampaignIdle(id)
        const [talk] = await talksOf(id)
        expect(talk!.reminder).toMatchObject({ status: "discarded" })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "answer", replyToId: talk!._id })).toBe(0)
        const line = await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "master-fix" }).lean()
        expect(line).toMatchObject({ content: "Lembrança injetada: Doran tem vantagem no teste por causa da furtividade ativa", masterFix: { kind: "reminder", status: "discarded" } })
        const view = await game.getGameState(id, owner)
        expect(view.messages.find((message) => message.kind === "master-fix")).toMatchObject({ masterFix: { kind: "reminder", status: "discarded" } })
        await game.submitGameAction(id, { kind: "pass" }, owner)
        await game.submitGameAction(id, { kind: "pass" }, player)
        await waitForCampaignIdle(id)
        expect(calls.at(-1)!.userText).not.toContain("estou furtivo")
        expect(calls.at(-1)!.userText).not.toContain("Lembrança injetada")
    })

    it("pergunta de fato: o balão responde; sem texto e sem correção, é falha e a conversa volta a esperar", async () => {
        const { id, owner, player } = await activeTable()
        await start(id, owner)
        script.push([{ text: "Você vê um par de adagas no chão." }])
        await reminders.submitTalk(id, { texto: "O que tem no chão?" }, player)
        await waitForCampaignIdle(id)
        const [question] = await talksOf(id)
        const answer = await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "answer", replyToId: question!._id }).lean()
        expect(answer?.content).toBe("Você vê um par de adagas no chão.")
        expect(calls.at(-1)!.userText).toContain("## Como tratar a conversa")
        // A réplica continua a conversa (responde à última resposta do Maddox ao jogador).
        script.push([{ tools: [] }])
        await reminders.submitTalk(id, { texto: "E atrás da porta?" }, player)
        await waitForCampaignIdle(id)
        const [, reply] = await talksOf(id)
        expect(String(reply!.replyToId)).toBe(String(answer!._id))
        expect(calls.at(-1)!.userText).toContain("Conversa até aqui")
        expect(calls.at(-1)!.userText).toContain("- Maddox: Você vê um par de adagas no chão.")
        const failed = await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "answer", replyToId: reply!._id }).lean()
        expect(failed?.error).toBe("O Maddox não conseguiu responder agora. Pergunte de novo.")
        expect((await talksOf(id))[1]!.reminder).toMatchObject({ status: "pending", jobId: null })
    })
})
