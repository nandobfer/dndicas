import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * DND-30 — sugestões de ação de ponta a ponta: com o narrador REAL (prompt e ferramentas) sobre um `streamText` roteirizado,
 * o Maddox chama `suggest_actions` na narração; as sugestões são gravadas com ela e cada jogador recebe só as do próprio
 * personagem. Narração com testes pedidos descarta as sugestões; narração que falha não grava nada; respostas a perguntas não
 * recebem a ferramenta; clicar numa sugestão é a mesma declaração do campo.
 */

type ToolCall = { name: string; input: Record<string, unknown> }
type Step = { tools?: ToolCall[]; text?: string; fail?: boolean }

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
                    if (step.text) yield { type: "text-delta", text: step.text }
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
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")

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
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_action_options_campaign_test" })
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

const suggestTool = { name: "suggest_actions", input: { opcoes: [{ personagem: "Lyra", acoes: ["Subo a escada do farol", "Procuro o faroleiro"] }, { personagem: "doran", acoes: ["Forço a porta"] }] } }
const narrationOf = (state: Awaited<ReturnType<typeof game.getGameState>>) => state.messages.filter((message) => message.kind === "narration").at(-1)!

describe("DND-30 — sugestões de ação de ponta a ponta", () => {
    it("o Maddox sugere na abertura: a narração grava as sugestões e cada jogador recebe só as do próprio personagem", async () => {
        const { id, owner, player } = await table()
        script.push([{ text: "Vocês chegam ao farol. O que fazem?", tools: [suggestTool] }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(calls[0]!.toolNames).toContain("suggest_actions")
        expect(calls[0]!.userText).toContain("chame `suggest_actions`")
        expect(toolLog[0]).toMatchObject({ name: "suggest_actions", output: { saved: [{ personagem: "Lyra" }, { personagem: "Doran" }] } })

        const mine = await game.getGameState(id, owner)
        expect(mine.turn.phase).toBe("players")
        expect(narrationOf(mine).actionOptions).toEqual(["Subo a escada do farol", "Procuro o faroleiro"])
        const theirs = await game.getGameState(id, player)
        expect(narrationOf(theirs).actionOptions).toEqual(["Forço a porta"])
        expect(JSON.stringify(theirs.messages)).not.toContain("Subo a escada do farol")
    })

    it("a sugestão clicada é a declaração do turno (mesmo efeito do campo); a narração seguinte traz as novas", async () => {
        const { id, owner, player } = await table()
        script.push([{ text: "O farol está escuro.", tools: [suggestTool] }], [{ text: "A porta cede.", tools: [{ name: "suggest_actions", input: { opcoes: [{ personagem: "Lyra", acoes: ["Entro com o arco pronto"] }] } }] }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        const state = await game.submitGameAction(id, { kind: "declaration", content: "Subo a escada do farol" }, owner)
        expect(state.me.declared).toBe(true)
        expect(state.messages.find((message) => message.kind === "declaration")).toMatchObject({ content: "Subo a escada do farol" })
        await game.submitGameAction(id, { kind: "declaration", content: "Ajudo a Lyra" }, player)
        await waitForCampaignIdle(id)
        expect(calls[1]!.userText).toContain("Subo a escada do farol")
        const next = await game.getGameState(id, owner)
        expect(next.turn.number).toBe(2)
        expect(narrationOf(next).actionOptions).toEqual(["Entro com o arco pronto"])
        expect(narrationOf(await game.getGameState(id, player)).actionOptions).toBeNull()
    })

    it("narração que pede testes descarta as sugestões (o turno dos jogadores ainda não abre)", async () => {
        const { id, owner } = await table("equilibrado")
        const check = { name: "request_check", input: { personagem: "Lyra", tipo: "pericia", pericia: "Percepção", cd: 12, motivo: "Ver o vulto na névoa" } }
        script.push([{ tools: [check, suggestTool], text: "Algo se move na névoa…" }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(toolLog.map((item) => item.name)).toEqual(["request_check", "suggest_actions"])
        const narration = await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "narration" }).lean()
        expect(narration!.actionOptions).toBeNull()
        const state = await game.getGameState(id, owner)
        expect(state.turn.awaitingChecks).toBe(true)
        expect(narrationOf(state).actionOptions).toBeNull()
    })

    it("narração que falha não grava sugestões", async () => {
        const { id, owner } = await table()
        script.push([{ tools: [suggestTool], text: "Começo…", fail: true }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(await MaddoxCampaignMessageModel.countDocuments({ kind: "narration" })).toBe(0)
    })

    it("resposta a pergunta não recebe a ferramenta nem a orientação", async () => {
        const { id, owner } = await table()
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        script.push([{ text: "Há dois guardas." }])
        await game.submitGameAction(id, { kind: "question", content: "Quantos guardas há?" }, owner)
        await waitForCampaignIdle(id)
        const answer = calls.at(-1)!
        expect(answer.userText).toContain("Quantos guardas há?")
        expect(answer.toolNames).not.toContain("suggest_actions")
        expect(answer.userText).not.toContain("suggest_actions")
    })
})
