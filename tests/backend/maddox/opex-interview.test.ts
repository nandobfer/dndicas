import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { AiStreamEvent, AiStreamRequest } from "@/lib/ai/stream"
import type { MaddoxSettings } from "@/features/maddox/schemas"

/**
 * Entrevista do Personagem Opex (DND-26): adicionar (permissões e regras), modo autônomo (o Opex responde sozinho, a
 * síntese é confirmada e sai o retrato), modo ao vivo (nada chega ao entrevistador sem aprovação; editar e "Gerar outra
 * resposta"; o dono confirma a síntese) e a falha com "Tentar de novo".
 */

const recordAudit = vi.fn(async () => undefined)
const publishToChannels = vi.fn(async () => undefined)
const availability = { available: true, reason: null as string | null }
const state: { settings: MaddoxSettings | null } = { settings: null }
const scripted: AiStreamEvent[][] = []
const streamCalls: AiStreamRequest[] = []
const opexReplies: (string | Error)[] = []
const opexCalls: AiStreamRequest[] = []
const consolidations: string[] = []
const generateAndStoreDndImage = vi.fn()
const provisionOpexCharacterAgent = vi.fn(async () => true)
const retireOpexCharacterAgent = vi.fn(async () => undefined)

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: state.settings, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ ...availability })),
    maddoxOpexAvailability: vi.fn(async () => ({ ...availability })),
}))
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ ...availability })) }))
vi.mock("@/lib/ai/stream", () => ({
    streamAi: vi.fn(async function* (request: AiStreamRequest) {
        streamCalls.push(request)
        for (const event of scripted.shift() ?? [{ type: "delta", text: "Conte mais." }, { type: "done", finishReason: "stop", usage: null, durationMs: 1 }]) yield event
    }),
    generateAiText: vi.fn(async (request: AiStreamRequest) => {
        if (String(request.title).startsWith("Personagem Opex")) {
            opexCalls.push(request)
            const next = opexReplies.shift() ?? JSON.stringify({ resposta: "Combinado." })
            if (next instanceof Error) throw next
            return { text: next, usage: null, durationMs: 1 }
        }
        return { text: consolidations.shift() ?? JSON.stringify({ name: "Brunna Pedraforte", profile: { identidade: "Clériga anã" }, sheet: null }), usage: null, durationMs: 1 }
    }),
    prepareModel: vi.fn(async () => ({ model: {}, dispose: async () => undefined })),
    samplingOptions: () => ({}),
    describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: vi.fn(async () => undefined) }))
vi.mock("@/lib/ai/jev", () => ({ askJevSystemOne: vi.fn() }))
vi.mock("@/features/maddox/server/opencode-sessions", () => ({ ensureMaddoxSession: vi.fn(async () => "ses"), releaseInterviewSession: vi.fn(async () => undefined) }))
vi.mock("@/features/ai/server/image-generator", () => ({ generateAndStoreDndImage }))
vi.mock("@/features/mcp/server/catalog-entity-service", () => ({ searchCatalogEntities: vi.fn(async () => ({ items: [], limit: 10, offset: 0 })) }))
vi.mock("@/features/engramind/server/opex-characters", () => ({
    opexCharacterMemoryBlock: vi.fn(async () => ""),
    saveOpexCharacterMemories: vi.fn(async () => ({ saved: 0, pending: 0 })),
    provisionOpexCharacterAgent,
    retireOpexCharacterAgent,
}))

const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
const { MaddoxCampaignModel, MaddoxCampaignMemberModel, MaddoxCharacterModel, MaddoxInterviewModel, MaddoxInterviewScriptModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const campaigns = await import("@/features/maddox/server/campaigns")
const opex = await import("@/features/maddox/server/opex")
const opexInterview = await import("@/features/maddox/server/opex-interview")
const interviews = await import("@/features/maddox/server/interviews")
const portraits = await import("@/features/maddox/server/character-portrait")
const { waitForOpexIdle } = await import("@/features/maddox/server/opex-runtime")
const { sheetOwnerUserId } = await import("@/features/maddox/server/opex-members")

let mongo: MongoMemoryServer
const ids = { owner: "", ana: "" }
const done: AiStreamEvent = { type: "done", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: null }, durationMs: 1 }
const reply = (text: string): AiStreamEvent[] => [{ type: "delta", text }, done]
const proposal = () => reply("Síntese: Brunna, clériga anã. Confirma?\n[[MADDOX_PROPOSTA_DE_CONCLUSAO]]")
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function settle() {
    for (let round = 0; round < 5; round++) {
        await waitForOpexIdle()
        await sleep(10)
    }
    await portraits.waitForCharacterPortraits()
}

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function readyCampaign() {
    const created = await campaigns.createCampaign({ name: "Brumas", rigor: "narrativo" }, ids.owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", setting: "Fantasia sombria.", openingSituation: "Numa taverna." } })
    const { token } = await campaigns.getInviteLink(created.id, ids.owner)
    await campaigns.joinByInvite(token, ids.ana)
    return created.id
}

const opexMember = (campaignId: string) => MaddoxCampaignMemberModel.findOne({ campaignId, kind: "opex" }).lean()
const interviewOf = (memberId: unknown) => MaddoxInterviewModel.findOne({ memberId }).lean()

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_opex_interview_test" })
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await mongoose.connection.db!.dropDatabase()
    await Promise.all([MaddoxInterviewModel.init(), MaddoxCampaignMemberModel.init(), MaddoxInterviewScriptModel.init()])
    ids.owner = await seedUser("dono")
    ids.ana = await seedUser("ana")
    availability.available = true
    availability.reason = null
    state.settings = { ...DEFAULT_MADDOX_SETTINGS, enabled: true, main: { ...DEFAULT_MADDOX_SETTINGS.main, provider: "gemini", model: "gemini-pro" } }
    scripted.length = 0
    streamCalls.length = 0
    opexReplies.length = 0
    opexCalls.length = 0
    consolidations.length = 0
    generateAndStoreDndImage.mockReset()
    generateAndStoreDndImage.mockResolvedValue({ key: "maddox/opex.png", url: "/api/upload?key=maddox/opex.png", mimeType: "image/png" })
    provisionOpexCharacterAgent.mockClear()
    retireOpexCharacterAgent.mockClear()
    recordAudit.mockClear()
})

afterEach(async () => {
    await settle()
})

describe("adicionar Personagem Opex", () => {
    it("só o dono adiciona, com o cenário pronto, campanha aberta e o Maddox disponível; sem limite", async () => {
        const id = await readyCampaign()
        await expect(opex.addOpexCharacter(id, { prompt: "", interviewMode: "autonomous" }, ids.ana)).rejects.toMatchObject({ status: 403 })
        const stranger = await seedUser("estranho")
        await expect(opex.addOpexCharacter(id, { prompt: "", interviewMode: "autonomous" }, stranger)).rejects.toMatchObject({ status: 404 })
        availability.available = false
        availability.reason = 'O "Agente Maddox" está desativado.'
        await expect(opex.addOpexCharacter(id, { prompt: "", interviewMode: "autonomous" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "MADDOX_UNAVAILABLE", message: 'O "Agente Maddox" está desativado.' })
        availability.available = true
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "scenarioInterview.status": "in-progress" } })
        await expect(opex.addOpexCharacter(id, { prompt: "", interviewMode: "autonomous" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "SCENARIO_PENDING" })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "scenarioInterview.status": "done", status: "archived" } })
        await expect(opex.addOpexCharacter(id, { prompt: "", interviewMode: "autonomous" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_CLOSED" })
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { status: "active" } })
        for (let index = 0; index < 3; index++) await opex.addOpexCharacter(id, { prompt: "", interviewMode: "live" }, ids.owner)
        const detail = await campaigns.getCampaignDetail(id, ids.owner)
        const added = detail.members.filter((member) => member.kind === "opex")
        expect(added).toHaveLength(3)
        expect(added[0]).toMatchObject({ name: "Personagem Opex", role: "player", opex: { interviewMode: "live" } })
        expect(provisionOpexCharacterAgent).toHaveBeenCalledTimes(3)
        // O jogador não vê o prompt base.
        const asPlayer = await campaigns.getCampaignDetail(id, ids.ana)
        expect(asPlayer.members.find((member) => member.kind === "opex")!.opex!.prompt).toBeNull()
        // Os ids sintéticos nunca viram canal do Pusher.
        expect(JSON.stringify(publishToChannels.mock.calls)).not.toContain("private-maddox-u-opex:")
    })

    it("a ficha do Opex fica com o dono da campanha (\"Minhas fichas\")", async () => {
        expect(sheetOwnerUserId({ userId: "opex:abc", kind: "opex", opex: { ownerUserId: "dono-1" } as never })).toBe("dono-1")
        expect(sheetOwnerUserId({ userId: "u1", kind: "human", opex: null })).toBe("u1")
    })
})

describe("entrevista autônoma", () => {
    it("termina sem interação: o Opex responde, a síntese é confirmada, o nome é gravado e o retrato é gerado", async () => {
        const id = await readyCampaign()
        scripted.push(reply("Bem-vindo! Quem é o seu personagem?"), proposal())
        opexReplies.push(JSON.stringify({ resposta: "Sou Brunna, uma clériga anã devota." }))
        await opex.addOpexCharacter(id, { prompt: "Uma clériga anã.", interviewMode: "autonomous" }, ids.owner)
        await settle()
        const member = await opexMember(id)
        const character = await MaddoxCharacterModel.findById(member!.characterId).lean()
        expect(character).toMatchObject({ name: "Brunna Pedraforte", interview: { status: "done" }, portrait: { status: "done" }, portraitUrl: "/api/upload?key=maddox/opex.png" })
        const interview = await interviewOf(member!._id)
        expect(interview!.status).toBe("done")
        expect(interview!.messages.filter((message) => message.role === "user").map((message) => message.content)).toEqual(["Sou Brunna, uma clériga anã devota."])
        // O prompt base do dono e a conversa chegaram à decisão do Opex.
        expect(opexCalls[0]!.instructions).toContain("Uma clériga anã.")
        expect(opexCalls[0]!.prompt).toContain("Quem é o seu personagem?")
        expect(member!.opex!.run).toMatchObject({ status: "idle" })
        expect(generateAndStoreDndImage).toHaveBeenCalledTimes(1)
        const detail = await campaigns.getCampaignDetail(id, ids.owner)
        expect(detail.members.find((item) => item.kind === "opex")).toMatchObject({ ready: true, opex: { status: "ready" } })
    })

    it("conclusão sem nome vira pedido de ajuste ao entrevistador e segue até concluir", async () => {
        const id = await readyCampaign()
        scripted.push(reply("Quem é você?"), proposal(), proposal())
        opexReplies.push(JSON.stringify({ resposta: "Uma clériga." }), JSON.stringify({ resposta: "Escolho o nome Brunna." }))
        consolidations.push(JSON.stringify({ name: null, profile: { identidade: "Clériga" }, sheet: null }))
        await opex.addOpexCharacter(id, { prompt: "", interviewMode: "autonomous" }, ids.owner)
        await settle()
        const member = await opexMember(id)
        expect(opexCalls[1]!.prompt).toContain("A conclusão foi recusada")
        expect((await MaddoxCharacterModel.findById(member!.characterId).lean())!.interview.status).toBe("done")
    })

    it("falha do provedor mostra o motivo e \"Tentar de novo\" continua de onde parou", async () => {
        const id = await readyCampaign()
        scripted.push(reply("Quem é você?"))
        opexReplies.push(new Error("provedor fora"), new Error("provedor fora"))
        await opex.addOpexCharacter(id, { prompt: "", interviewMode: "autonomous" }, ids.owner)
        await settle()
        let member = await opexMember(id)
        expect(member!.opex!.run).toMatchObject({ status: "failed", stage: "interview" })
        const detail = await campaigns.getCampaignDetail(id, ids.owner)
        expect(detail.members.find((item) => item.kind === "opex")!.opex).toMatchObject({ status: "failed" })
        expect(detail.members.find((item) => item.kind === "opex")!.opex!.error).toContain("provedor fora")
        await expect(opexInterview.retryOpexInterview(id, String(member!._id), ids.ana)).rejects.toMatchObject({ status: 403 })

        scripted.push(proposal())
        opexReplies.push(JSON.stringify({ resposta: "Sou Brunna." }))
        await opexInterview.retryOpexInterview(id, String(member!._id), ids.owner)
        await settle()
        member = await opexMember(id)
        const interview = await interviewOf(member!._id)
        // A abertura não foi refeita: continuou da fala que esperava resposta.
        expect(interview!.messages.filter((message) => message.role === "maddox").map((message) => message.content)[0]).toBe("Quem é você?")
        expect(interview!.status).toBe("done")
    })
})

describe("entrevista ao vivo", () => {
    it("nenhuma resposta chega ao entrevistador sem aprovação; editar, gerar outra com orientação e confirmar a síntese", async () => {
        const id = await readyCampaign()
        scripted.push(reply("Quem é você?"))
        opexReplies.push(JSON.stringify({ resposta: "Sou Brunna." }))
        await opex.addOpexCharacter(id, { prompt: "", interviewMode: "live" }, ids.owner)
        await settle()
        const member = await opexMember(id)
        const memberId = String(member!._id)
        let interview = await interviewOf(member!._id)
        expect(interview!.messages.filter((message) => message.role === "user")).toHaveLength(0)
        expect(interview!.opexDraft).toMatchObject({ status: "ready", kind: "message", content: "Sou Brunna." })
        expect(member!.opex!.run).toMatchObject({ status: "awaiting-approval" })
        expect(streamCalls).toHaveLength(1)
        // Tela fechada: segue pausada (nada é enviado sozinho).
        await settle()
        expect(streamCalls).toHaveLength(1)

        // "Gerar outra resposta" com orientação.
        opexReplies.push(JSON.stringify({ resposta: "Meu nome é Brunna Pedraforte, de Karak." }))
        await opexInterview.regenerateOpexDraft(id, memberId, "diga a cidade natal", ids.owner)
        await settle()
        expect(opexCalls.at(-1)!.prompt).toContain("diga a cidade natal")
        interview = await interviewOf(member!._id)
        expect(interview!.opexDraft).toMatchObject({ status: "ready", content: "Meu nome é Brunna Pedraforte, de Karak.", guidance: "diga a cidade natal" })

        // Editar e aprovar: a versão editada é a que chega ao Maddox.
        scripted.push(proposal())
        const { turn, after } = await opexInterview.approveOpexDraft(id, memberId, { content: "Sou Brunna, de Karak." }, ids.owner)
        await interviews.runTurn(turn, () => undefined)
        after()
        await settle()
        interview = await interviewOf(member!._id)
        expect(interview!.messages.filter((message) => message.role === "user").map((message) => message.content)).toEqual(["Sou Brunna, de Karak."])
        expect(interview!.status).toBe("proposed")
        expect(interview!.opexDraft).toBeNull()
        expect((await opexMember(id))!.opex!.run).toMatchObject({ status: "awaiting-approval" })
        await expect(opexInterview.approveOpexDraft(id, memberId, {}, ids.owner)).rejects.toMatchObject({ status: 409, code: "NO_OPEX_DRAFT" })

        // A síntese é confirmada pelo dono.
        await expect(opexInterview.completeOpexInterview(id, memberId, ids.ana)).rejects.toMatchObject({ status: 403 })
        await opexInterview.completeOpexInterview(id, memberId, ids.owner)
        await settle()
        expect((await MaddoxCharacterModel.findById(member!.characterId).lean())!.interview.status).toBe("done")
        const view = await opexInterview.getOpexInterview(id, memberId, ids.owner)
        expect(view).toMatchObject({ interviewMode: "live", status: "ready", characterName: "Brunna Pedraforte" })
    })
})

describe("remover Personagem Opex", () => {
    it("o dono remove (com o agente das memórias aposentado); jogador não remove", async () => {
        const id = await readyCampaign()
        scripted.push(reply("Quem é você?"))
        await opex.addOpexCharacter(id, { prompt: "", interviewMode: "live" }, ids.owner)
        await settle()
        const member = await opexMember(id)
        await expect(campaigns.removeMember(id, String(member!._id), ids.ana)).rejects.toMatchObject({ status: 403 })
        await campaigns.removeMember(id, String(member!._id), ids.owner)
        await settle()
        expect((await MaddoxCampaignMemberModel.findById(member!._id).lean())!.status).toBe("removed")
        expect(retireOpexCharacterAgent).toHaveBeenCalledWith(expect.objectContaining({ memberId: String(member!._id), campaignId: id }), ids.owner)
    })
})
