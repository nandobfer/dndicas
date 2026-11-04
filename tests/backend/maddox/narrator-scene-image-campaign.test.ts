import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * Critério de aceite do Maddox 10: com o narrador REAL (prompt e ferramentas) sobre um `streamText` roteirizado, o Maddox
 * pede a imagem do novo local; a narração é gravada e só então a imagem é pedida, ligada a ela, e pintada em segundo plano
 * (o turno dos jogadores abre sem esperar). Situação inativa não oferece a ferramenta; narração que falha não gera imagem;
 * respostas a perguntas não recebem a ferramenta; o intervalo entre imagens é respeitado.
 */

type ToolCall = { name: string; input: Record<string, unknown> }
type Step = { tools?: ToolCall[]; text?: string; fail?: boolean }

const calls: { instructions: string; userText: string; toolNames: string[] }[] = []
const script: Step[][] = []
const toolLog: { name: string; output?: unknown; error?: string }[] = []
const scene = { enabled: true, situations: { "new-location": true } as Record<string, boolean>, gap: 2 }
/**
 * Portão da geração das imagens. Fechado, a geração espera a liberação da prova; aberto, gera direto. O estado é lido pela
 * própria geração, e não só a função de liberar: a fila começa em segundo plano e, conforme a carga da máquina, a geração só
 * chega ao gerador depois de `releaseImages()` — antes isso deixava o portão preso em quem liberou e travava a prova.
 */
const gate = { open: false, release: null as null | (() => void) }

const generateAndStoreDndImage = vi.fn(async (input: { storageKey?: string }) => {
    if (!gate.open) await new Promise<void>((resolve) => (gate.release = resolve))
    const key = `${input.storageKey}.png`
    return { key, url: `/api/upload?key=${encodeURIComponent(key)}`, mimeType: "image/png", referencesUsed: 0 }
})

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
            sceneImages: { enabled: scene.enabled, situations: scene.situations, custom: [], minNarrationsBetween: scene.gap, maxPerDay: 10, aspectRatio: "16:9", style: "" },
        },
        isDefault: false,
        updatedAt: null,
    })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/ai/server/settings", () => ({
    availability: vi.fn(async () => ({ available: true, reason: null })),
    loadImageGeneratorSettings: vi.fn(async () => ({ settings: { enabled: true, provider: "gemini", model: "gemini-2.5-flash-image", instructions: "Arte.", defaultAspectRatio: "1:1" }, isDefault: false, updatedAt: null })),
    availabilityOfImageGenerator: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/ai/server/image-generator", () => ({ generateAndStoreDndImage }))
vi.mock("@/features/ai/server/agent-memory-service", () => ({ agentMemoryTexts: vi.fn(async () => []) }))
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

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel, MaddoxSceneImageModel, MaddoxCampaignMemoryModel, MaddoxCombatModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const images = await import("@/features/maddox/server/scene-images")
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")

let mongo: MongoMemoryServer

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function table() {
    const owner = await seedUser("dono")
    const created = await campaigns.createCampaign({ name: "Brumas do Norte", rigor: "narrativo" }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", setting: "Um porto envolto em névoa.", openingSituation: "O farol se apagou." } })
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId: created.id, userId: owner }).lean()
    const character = await MaddoxCharacterModel.create({ campaignId: created.id, memberId: member!._id, userId: owner, name: "Lyra", profile: { identidade: "Elfa de capa azul." }, interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
    return { id: created.id, owner }
}

const declare = async (id: string, owner: string, content: string) => {
    await game.submitGameAction(id, { kind: "declaration", content }, owner)
    await waitForCampaignIdle(id)
}
const releaseImages = async () => {
    gate.open = true
    gate.release?.()
    await images.waitForSceneImages()
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_scene_image_campaign_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxNpcModel.init(), MaddoxSceneImageModel.init(), MaddoxCampaignMemoryModel.init(), MaddoxCombatModel.init()])
    await images.loadSceneImageEnvironment()
}, 180_000)

afterAll(async () => {
    gate.open = true
    gate.release?.()
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
        MaddoxNpcModel.deleteMany({}),
        MaddoxSceneImageModel.deleteMany({}),
    ])
    calls.length = 0
    script.length = 0
    toolLog.length = 0
    Object.assign(scene, { enabled: true, situations: { "new-location": true }, gap: 2 })
    gate.open = false
    gate.release = null
    generateAndStoreDndImage.mockClear()
})

const imageTool = (descricao: string) => ({ name: "request_scene_image", input: { situacao: "new-location", descricaoVisual: descricao, legenda: "O farol", personagens: ["Lyra"] } })

describe("Maddox 10 — imagens nas cenas de ponta a ponta", () => {
    it("o Maddox pede a imagem do novo local: fica ligada à narração gravada e o turno abre sem esperar a pintura", async () => {
        const { id, owner } = await table()
        script.push([{ tools: [imageTool("O farol apagado na chuva, Lyra na escada.")], text: "Vocês chegam ao farol. O que fazem?" }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(calls[0]!.toolNames).toContain("request_scene_image")
        expect(calls[0]!.instructions).toContain("## Imagens da cena")
        expect(calls[0]!.instructions).toContain("`new-location` — Novo local ou cenário")
        expect(toolLog[0]).toMatchObject({ name: "request_scene_image", output: { requested: true } })

        // A geração está presa no gate: o turno dos jogadores já abriu e a mesa mostra o placeholder.
        const pending = await game.getGameState(id, owner)
        expect(pending.turn.phase).toBe("players")
        const narration = pending.messages.find((message) => message.kind === "narration")!
        expect(narration.sceneImages).toEqual([expect.objectContaining({ status: "generating", url: null, caption: "O farol", situationLabel: "Novo local ou cenário" })])

        await releaseImages()
        const done = await game.getGameState(id, owner)
        expect(done.messages.find((message) => message.kind === "narration")!.sceneImages).toEqual([expect.objectContaining({ status: "done", url: expect.stringContaining("scenes") })])
        expect(await MaddoxSceneImageModel.findOne({}).lean()).toMatchObject({ messageId: new mongoose.Types.ObjectId(narration.id), turnNumber: 1, references: { characters: ["Lyra"] } })
    })

    it("frequência: dentro do intervalo o prompt avisa e a ferramenta recusa; depois dele, a imagem volta", async () => {
        const { id, owner } = await table()
        gate.open = true
        script.push(
            [{ tools: [imageTool("Turno 1.")], text: "Abertura. O que fazem?" }],
            [{ tools: [imageTool("Turno 2.")], text: "Turno 2. O que fazem?" }],
            [{ tools: [imageTool("Turno 3.")], text: "Turno 3. O que fazem?" }],
        )
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        await declare(id, owner, "Subo a escada.")
        expect(calls[1]!.instructions).toContain("AGORA: Intervalo entre imagens: a próxima pode sair a partir do turno 3.")
        expect(toolLog[1]!.error).toContain("a partir do turno 3")
        await declare(id, owner, "Abro a porta.")
        expect(toolLog[2]).toMatchObject({ output: { requested: true } })
        await images.waitForSceneImages()
        expect((await MaddoxSceneImageModel.find({ counts: true }).sort({ turnNumber: 1 }).lean()).map((image) => image.turnNumber)).toEqual([1, 3])
    })

    it("situação inativa ou imagens desligadas: a ferramenta nem é oferecida e o prompt não fala de imagens", async () => {
        const { id, owner } = await table()
        scene.situations = { "new-location": false, climax: false }
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(calls[0]!.toolNames).not.toContain("request_scene_image")
        expect(calls[0]!.instructions).not.toContain("## Imagens da cena")
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { sceneImages: false } })
        scene.situations = { "new-location": true }
        await declare(id, owner, "Olho em volta.")
        expect(calls[1]!.toolNames).not.toContain("request_scene_image")
    })

    it("narração que falha não gera imagem", async () => {
        const { id, owner } = await table()
        script.push([{ tools: [imageTool("Não deve sair.")], text: "Começo…", fail: true }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(await MaddoxSceneImageModel.countDocuments()).toBe(0)
        expect(await MaddoxCampaignMessageModel.countDocuments({ kind: "narration" })).toBe(0)
    })

    it("resposta a pergunta não recebe a ferramenta nem a regra das imagens", async () => {
        const { id, owner } = await table()
        gate.open = true
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        script.push([{ text: "Há dois guardas." }])
        await game.submitGameAction(id, { kind: "question", content: "Quantos guardas há?" }, owner)
        await waitForCampaignIdle(id)
        const answer = calls.at(-1)!
        expect(answer.userText).toContain("Quantos guardas há?")
        expect(answer.toolNames).not.toContain("request_scene_image")
        expect(answer.instructions).not.toContain("## Imagens da cena")
    })
})
