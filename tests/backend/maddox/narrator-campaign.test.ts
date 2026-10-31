import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * Critério de aceite do Maddox 4: campanha narrativa com 2 jogadores por mais de 5 turnos, com o narrador REAL
 * (`narrator.ts`, ferramentas e prompt) sobre um `streamText` roteirizado — o modelo chama as ferramentas de verdade e
 * o teste confere a persistência no banco e o estado entregue ao prompt dos turnos seguintes.
 */

type ToolCall = { name: string; input: Record<string, unknown> }
type Step = { tools?: ToolCall[]; text?: string }

const calls: { instructions: string; userText: string; toolNames: string[] }[] = []
/** Roteiro por geração (na ordem em que o narrador é chamado). */
const script: Step[][] = []
const failNext = { value: false }

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
            opencode: { sessionScope: "campaign", deleteOnCampaignEnd: true, directory: null, mcpUrl: null },
            jev: {},
        },
        isDefault: false,
        updatedAt: null,
    })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/features/ai/server/agent-memory-service", () => ({ agentMemoryTexts: vi.fn(async () => ["Narre sempre com calma."]) }))
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

const { MaddoxCampaignMemberModel, MaddoxCampaignMemoryModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const { subscribeGameLive, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")

let mongo: MongoMemoryServer

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function giveCharacter(campaignId: string, userId: string, name: string, profile: Record<string, string>) {
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const character = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name, profile, interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
}

async function narrativeTable() {
    const owner = await seedUser("dono")
    const created = await campaigns.createCampaign({ name: "Brumas do Norte", rigor: "narrativo" }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", setting: "## Universo\nUm porto envolto em névoa.", openingSituation: "O farol do porto se apagou." } })
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const player = await seedUser("jogadora")
    await campaigns.joinByInvite(token, player)
    await giveCharacter(created.id, owner, "Lyra", { capacidades: "Arqueira, sem magia." })
    await giveCharacter(created.id, player, "Doran", { capacidades: "Ferreiro forte." })
    return { id: created.id, owner, player }
}

async function playersTurn(id: string, owner: string, player: string, turn: number) {
    await game.submitGameAction(id, { kind: "declaration", content: `Lyra age no turno ${turn}.` }, owner)
    await game.submitGameAction(id, { kind: "declaration", content: `Doran age no turno ${turn}.` }, player)
    await waitForCampaignIdle(id)
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_narrator_campaign_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxNpcModel.init(), MaddoxCampaignMemoryModel.init()])
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
        MaddoxNpcModel.deleteMany({}),
        MaddoxCampaignMemoryModel.deleteMany({}),
    ])
    calls.length = 0
    script.length = 0
})

describe("Maddox 4 — campanha narrativa de ponta a ponta", () => {
    it("2 jogadores, 6 narrações: o estado (NPCs, locais, missões, checkpoint, personagens) persiste entre os turnos e volta ao prompt", async () => {
        const { id, owner, player } = await narrativeTable()
        script.push(
            // Turno 1: abertura.
            [
                { text: "A névoa cobre o cais. **Bartolomeu**, o faroleiro, acena para vocês. O que vocês fazem?" },
                {
                    tools: [
                        { name: "update_campaign_state", input: { scene: "Cais na névoa", location: "Porto de Brumas", situation: "Farol apagado", pendingDecision: "Seguir Bartolomeu?" } },
                        { name: "save_npc", input: { name: "Bartolomeu", publicDescription: "Faroleiro idoso.", masterNotes: "Apagou o farol de propósito.", visibility: "players" } },
                    ],
                },
            ],
            // Turno 2.
            [{ tools: [{ name: "save_memory", input: { kind: "local", title: "Porto de Brumas", text: "Cais de madeira, tavernas e o farol ao norte." } }], text: "Vocês caminham pelo porto. O que vocês fazem?" }],
            // Turno 3.
            [
                {
                    tools: [
                        { name: "save_memory", input: { kind: "missao", title: "Reacender o farol", text: "Descobrir por que o farol apagou.", status: "ativa" } },
                        { name: "update_character_state", input: { characterName: "doran", currentState: "Mão esquerda queimada." } },
                    ],
                    text: "Bartolomeu pede ajuda com o farol. O que vocês fazem?",
                },
            ],
            // Turno 4: NPC atualizado (sem duplicar) e o checkpoint muda.
            [
                {
                    tools: [
                        { name: "save_npc", input: { name: "BARTOLOMEU", masterNotes: "Esconde um contrabandista no farol." } },
                        { name: "update_campaign_state", input: { location: "Escadaria do farol" } },
                    ],
                    text: "Vocês sobem a escadaria. O que vocês fazem?",
                },
            ],
            // Turno 5: missão concluída.
            [{ tools: [{ name: "save_memory", input: { kind: "missao", title: "Reacender o farol", text: "O farol voltou a brilhar.", status: "concluida" } }], text: "A luz volta ao farol. O que vocês fazem?" }],
            // Turno 6.
            [{ text: "Amanhece no porto. O que vocês fazem?" }],
        )

        const lines: { type: string }[] = []
        const unsubscribe = subscribeGameLive(id, (line) => lines.push(line))
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        for (let turn = 1; turn <= 5; turn++) await playersTurn(id, owner, player, turn)
        unsubscribe()

        // Seis narrações gravadas, turnos numerados e o turno 6 aberto para os jogadores.
        const narrationDocs = await MaddoxCampaignMessageModel.find({ campaignId: id, kind: "narration" }).sort({ turnNumber: 1 }).lean()
        expect(narrationDocs.map((doc) => doc.turnNumber)).toEqual([1, 2, 3, 4, 5, 6])
        expect(narrationDocs[0]!.content).toContain("Bartolomeu")
        const state = await game.getGameState(id, player)
        expect(state.turn).toMatchObject({ number: 6, phase: "players" })

        // Persistência no banco.
        const npcs = await MaddoxNpcModel.find({ campaignId: id }).lean()
        expect(npcs).toHaveLength(1)
        expect(npcs[0]).toMatchObject({ name: "Bartolomeu", publicDescription: "Faroleiro idoso.", masterNotes: "Esconde um contrabandista no farol." })
        const local = await MaddoxCampaignMemoryModel.findOne({ campaignId: id, kind: "local" }).lean()
        expect(local).toMatchObject({ title: "Porto de Brumas", origin: "agent", createdBy: "maddox", turnNumber: 2 })
        const quests = await MaddoxCampaignMemoryModel.find({ campaignId: id, kind: "missao" }).lean()
        expect(quests).toHaveLength(1)
        expect(quests[0]).toMatchObject({ title: "Reacender o farol", status: "concluida", text: "O farol voltou a brilhar.", turnNumber: 5 })
        const campaign = await MaddoxCampaignModel.findById(id).lean()
        expect(campaign!.state).toMatchObject({ scene: "Cais na névoa", location: "Escadaria do farol", updatedTurn: 4 })
        const doran = await MaddoxCharacterModel.findOne({ campaignId: id, name: "Doran" }).lean()
        expect(doran!.currentState).toBe("Mão esquerda queimada.")

        // O estado gravado volta ao prompt dos turnos seguintes.
        expect(calls).toHaveLength(6)
        expect(calls[0]!.toolNames).toEqual(expect.arrayContaining(["save_npc", "save_memory", "update_campaign_state", "update_character_state", "get_npc", "search_memories"]))
        expect(calls[0]!.instructions).toContain("Narre sempre com calma.")
        expect(calls[0]!.instructions).toContain("Não use dados, rolagens")
        expect(calls[1]!.instructions).toContain("**Bartolomeu**")
        expect(calls[1]!.instructions).toContain("[SÓ O MESTRE] Apagou o farol de propósito.")
        expect(calls[1]!.instructions).toContain("Local: Porto de Brumas")
        expect(calls[3]!.instructions).toContain("**Reacender o farol** [ativa]")
        expect(calls[3]!.instructions).toContain("Condição atual na história: Mão esquerda queimada.")
        expect(calls[5]!.instructions).toContain("[concluida]")
        expect(calls[2]!.userText).toContain("Lyra age no turno 2.")
        expect(calls[2]!.userText).toContain("Vocês caminham pelo porto.")
        // Uma só stream para a mesa inteira: 6 gerações ao vivo, cada uma terminando com a mensagem gravada.
        expect(lines.filter((line) => line.type === "live-start")).toHaveLength(6)
        expect(lines.filter((line) => line.type === "live-end")).toHaveLength(6)
    })

    it("pergunta ao mestre é respondida pelo narrador sem avançar o turno, com a tarefa de não avançar a cena", async () => {
        const { id, owner, player } = await narrativeTable()
        script.push([{ text: "Abertura." }], [{ text: "Há dois guardas na porta." }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        await game.submitGameAction(id, { kind: "declaration", content: "Lyra observa." }, owner)
        await game.submitGameAction(id, { kind: "question", content: "Quantos guardas há?" }, player)
        await waitForCampaignIdle(id)
        const state = await game.getGameState(id, owner)
        expect(state.turn).toMatchObject({ number: 1, phase: "players" })
        expect(state.messages.find((message) => message.kind === "answer")!.content).toBe("Há dois guardas na porta.")
        expect(calls[1]!.userText).toContain("**Doran** pergunta: Quantos guardas há?")
        expect(calls[1]!.userText).toContain("NÃO avance a cena")
        expect(calls[1]!.userText).toContain("**Lyra**: Lyra observa.")
    })

    it("ferramenta com entrada inválida volta ao modelo como erro e a narração continua", async () => {
        const { id, owner } = await narrativeTable()
        script.push([{ tools: [{ name: "update_character_state", input: { characterName: "Ninguém", currentState: "x" } }], text: "A história começa." }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        const narration = await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "narration" }).lean()
        expect(narration!.content).toBe("A história começa.")
    })

    it("falha do provedor deixa o turno do mestre com `failed` e nenhuma narração", async () => {
        const { id, owner } = await narrativeTable()
        failNext.value = true
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        const state = await game.getGameState(id, owner)
        expect(state.turn).toMatchObject({ phase: "master", failed: true })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: "narration" })).toBe(0)
    })
})
