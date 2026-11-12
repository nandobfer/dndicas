import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * DND-52 — narração reescrita depois das ferramentas: com o narrador REAL sobre um `streamText` roteirizado, o modelo escreve a
 * cena, chama `update_campaign_state` e reescreve tudo na etapa seguinte. A mensagem gravada fica só com a reescrita, a tela
 * ao vivo converge para o mesmo texto (`live-text`) e uma falha com texto parcial seguida de nova tentativa não repete nada.
 */

type ToolCall = { name: string; input: Record<string, unknown> }
/** `text` em lista = vários trechos (`text-delta`) na mesma etapa. */
type Step = { tools?: ToolCall[]; text?: string | string[]; fail?: boolean }

const calls: { instructions: string; userText: string; toolNames: string[] }[] = []
const script: Step[][] = []
const toolLog: { name: string; output?: unknown; error?: string }[] = []
vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
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
            sceneImages: { enabled: false, situations: {}, custom: [], minNarrationsBetween: 3, maxPerDay: 10, aspectRatio: "16:9", style: "" },
        },
        isDefault: false,
        updatedAt: null,
    })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/ai/server/settings", () => ({
    availability: vi.fn(async () => ({ available: true, reason: null })),
    loadImageGeneratorSettings: vi.fn(async () => ({ settings: { enabled: false, provider: "gemini", model: "gemini-2.5-flash-image", instructions: "Arte.", defaultAspectRatio: "1:1" }, isDefault: false, updatedAt: null })),
    availabilityOfImageGenerator: vi.fn(async () => ({ available: false, reason: "desligado" })),
}))
vi.mock("@/features/ai/server/memory-block", () => ({ memoryBlock: vi.fn(async () => "") }))
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
                    for (const text of typeof step.text === "string" ? [step.text] : (step.text ?? [])) yield { type: "text-delta", text }
                    if (step.fail) {
                        yield { type: "error", error: new Error("provedor caiu no meio") }
                        return
                    }
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
const { subscribeGameLive, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { MADDOX_GAME_STREAM_INITIAL, reduceGameStream } = await import("@/features/maddox/hooks/useMaddoxGameStream")
const { sameParagraph } = await import("@/features/maddox/narration-dedupe")
const { MADDOX_MASTER_RETRY_MS } = await import("@/features/maddox/constants")
const { MADDOX_WRITE_ONCE_RULE } = await import("@/features/maddox/server/narrator-prompt")

let mongo: MongoMemoryServer

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function table(rigor: "narrativo" | "equilibrado" = "narrativo") {
    const owner = await seedUser("dono")
    const player = await seedUser("jogador")
    const created = await campaigns.createCampaign({ name: "Brumas do Norte", rigor }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", setting: "Um porto envolto em névoa.", openingSituation: "O farol se apagou." } })
    const ownerMember = await MaddoxCampaignMemberModel.findOne({ campaignId: created.id, userId: owner }).lean()
    const lyra = await MaddoxCharacterModel.create({ campaignId: created.id, memberId: ownerMember!._id, userId: owner, name: "Lyra", sheetId: new mongoose.Types.ObjectId(), profile: { identidade: "Elfa de capa azul." }, interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: ownerMember!._id }, { $set: { characterId: lyra._id } })
    const playerMember = await MaddoxCampaignMemberModel.create({ campaignId: created.id, userId: player, role: "player", status: "joined" })
    const doran = await MaddoxCharacterModel.create({ campaignId: created.id, memberId: playerMember._id, userId: player, name: "Doran", profile: { identidade: "Anão ferreiro." }, interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: playerMember._id }, { $set: { characterId: doran._id } })
    return { id: created.id, owner, player }
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_narrator_rewrite_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxNpcModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    campaignMemoriesStore.reset()
    await Promise.all([
        mongoose.connection.collection("users").deleteMany({}),
        MaddoxCampaignModel.deleteMany({}),
        MaddoxCampaignMemberModel.deleteMany({}),
        MaddoxCharacterModel.deleteMany({}),
        MaddoxCampaignMessageModel.deleteMany({}),
        MaddoxNpcModel.deleteMany({}),
    ])
    calls.length = 0
    script.length = 0
    toolLog.length = 0
})

const SCENE = "O farol range ao vento e a escada de pedra sobe em espiral, úmida de sal; no alto, uma luz fraca pisca como quem chama."
const SCENE_REWRITE = "O farol range ao vento e a escada de pedra sobe em espiral, úmida de sal; lá no alto, uma luz fraca pisca como quem pede ajuda."
const DECISION = "**Lyra** tem a mão no corrimão gelado e **Doran** segura a lanterna. O que vocês fazem?"
const DECISION_REWRITE = "**Lyra** tem a mão no corrimão gelado e **Doran** ergue a lanterna. O que vocês fazem?"
const stateTool = { name: "update_campaign_state", input: { scene: "Subindo o farol.", pendingDecision: "O que fazem no alto do farol?" } }
/** Etapa 1 escreve a cena; etapa 2 grava o estado e a reescreve inteira (o padrão visto nas mensagens reais). */
const rewriteSteps = (scene = SCENE, rewrite = SCENE_REWRITE): Step[] => [{ text: `${scene}\n\n${DECISION}` }, { tools: [stateTool], text: `${rewrite}\n\n${DECISION_REWRITE}` }]

const paragraphs = (text: string) => text.split(/\n[ \t]*\n/).map((part) => part.trim()).filter(Boolean)
const repeats = (text: string) => {
    const list = paragraphs(text)
    return list.some((later, index) => list.slice(0, index).some((earlier) => sameParagraph(earlier, later)))
}
const narrations = async (id: string) => (await MaddoxCampaignMessageModel.find({ campaignId: id, kind: "narration" }).sort({ _id: 1 }).lean()).map((message) => message.content)

describe("DND-52 — narração reescrita depois das ferramentas", () => {
    it("grava só a reescrita, e a tela ao vivo termina com o mesmo texto gravado", async () => {
        const { id, owner } = await table()
        let stream = MADDOX_GAME_STREAM_INITIAL
        const lines: string[] = []
        const leave = subscribeGameLive(id, (line) => {
            lines.push(line.type)
            stream = reduceGameStream(stream, line)
        })
        script.push(rewriteSteps())
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        leave()

        const [content] = await narrations(id)
        expect(content).toBe(`${SCENE_REWRITE}\n\n${DECISION_REWRITE}`)
        expect(toolLog.map((item) => item.name)).toEqual(["update_campaign_state"])
        expect(lines).toContain("live-text")
        expect(stream.settled).toHaveLength(1)
        // A linha `live-text` deixa a última quebra de parágrafo do texto ao vivo; o conteúdo é o gravado.
        expect(stream.settled[0]!.text.trim()).toBe(content)
    })

    it("o texto que acrescenta cena depois das ferramentas fica inteiro (nada é tirado)", async () => {
        const { id, owner } = await table()
        script.push([{ text: SCENE }, { tools: [stateTool], text: DECISION }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(await narrations(id)).toEqual([`${SCENE}\n\n${DECISION}`])
    })

    it("o mesmo bloco entregue duas vezes pelo provedor é gravado uma vez", async () => {
        const { id, owner } = await table()
        script.push([{ text: `${SCENE}\n\n${DECISION}` }, { text: `${SCENE}\n\n${DECISION}` }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(await narrations(id)).toEqual([`${SCENE}\n\n${DECISION}`])
    })

    it("falha com texto parcial e nova tentativa: a narração gravada é só a da nova geração", async () => {
        const { id, owner } = await table()
        script.push([{ text: `${SCENE}\n\n`, fail: true }], [{ text: `${SCENE_REWRITE}\n\n${DECISION}` }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(await narrations(id)).toEqual([])
        expect((await MaddoxCampaignModel.findById(id).lean())!.turn.failedAt).toBeInstanceOf(Date)

        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.failedAt": new Date(Date.now() - MADDOX_MASTER_RETRY_MS - 1000) } })
        await game.getGameState(id, owner)
        await waitForCampaignIdle(id)
        expect(await narrations(id)).toEqual([`${SCENE_REWRITE}\n\n${DECISION}`])
    })

    it("10 narrações seguidas, com reescritas e uma falha no meio: nenhuma mensagem do diário repete parágrafo", async () => {
        const { id, owner, player } = await table()
        script.push(rewriteSteps())
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        for (let turn = 2; turn <= 10; turn += 1) {
            const scene = `No andar ${turn} do farol, o vento assobia pelas frestas e a pedra está coberta de conchas partidas e sal.`
            const rewrite = `No andar ${turn} do farol, o vento assobia pelas frestas e a pedra está coberta de conchas partidas e areia.`
            if (turn === 5) script.push([{ text: `${scene}\n\n`, fail: true }])
            script.push(turn % 2 ? [{ text: scene }, { tools: [stateTool], text: DECISION }] : rewriteSteps(scene, rewrite))
            await game.submitGameAction(id, { kind: "declaration", content: `Subo para o andar ${turn}` }, owner)
            await game.submitGameAction(id, { kind: "declaration", content: "Sigo a Lyra" }, player)
            await waitForCampaignIdle(id)
            if (turn === 5) {
                expect((await MaddoxCampaignModel.findById(id).lean())!.turn.failedAt).toBeInstanceOf(Date)
                await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.failedAt": new Date(Date.now() - MADDOX_MASTER_RETRY_MS - 1000) } })
                await game.getGameState(id, owner)
                await waitForCampaignIdle(id)
            }
        }
        const stored = await narrations(id)
        expect(stored).toHaveLength(10)
        for (const content of stored) expect(repeats(content), content).toBe(false)
    }, 30_000)

    it("ao vivo, um parágrafo em escrita igual ao começo de um anterior não apaga nada; falas curtas repetidas ficam (F1)", async () => {
        const { id, owner } = await table()
        let stream = MADDOX_GAME_STREAM_INITIAL
        const lines: string[] = []
        const leave = subscribeGameLive(id, (line) => {
            lines.push(line.type)
            stream = reduceGameStream(stream, line)
        })
        const middle = "O goblin da direita larga o arco e dispara pela trilha, tropeçando nas raízes, os olhos arregalados de medo."
        const opening = "O vento sopra forte entre as pedras do farol e apaga as tochas uma a uma, deixando só o brilho da lua."
        // O último trecho termina com o começo de um parágrafo igual ao primeiro ("O vento sopra forte…"), ainda sem ponto final.
        script.push([{ text: [`— Corram!\n\n${middle}\n\n${opening}\n\nO vento sopra forte entre as pedras do farol e apaga`, " as velas da escada também, e a porta bate com força no alto, sem ninguém por perto que a tenha tocado.\n\n— Corram!"] }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        leave()
        const [content] = await narrations(id)
        expect(content).toBe(`— Corram!\n\n${middle}\n\n${opening}\n\nO vento sopra forte entre as pedras do farol e apaga as velas da escada também, e a porta bate com força no alto, sem ninguém por perto que a tenha tocado.\n\n— Corram!`)
        expect(lines).not.toContain("live-text")
        expect(stream.settled[0]!.text).toBe(content)
    })

    it("as instruções pedem as ferramentas antes e o texto uma vez só", async () => {
        const { id, owner } = await table()
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(calls[0]!.instructions).toContain(MADDOX_WRITE_ONCE_RULE)
        expect(calls[0]!.instructions).toContain("Grave antes de escrever a narração, nunca no meio nem depois dela")
    })
})
