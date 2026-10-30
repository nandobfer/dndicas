import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { AiStreamEvent, AiStreamRequest } from "@/lib/ai/stream"
import type { MaddoxSettings } from "@/features/maddox/schemas"
import type { MaddoxInterviewStreamLine } from "@/features/maddox/interview-types"

const recordAudit = vi.fn(async () => undefined)
const publishToChannels = vi.fn(async () => undefined)
const availability = { available: true, reason: null as string | null }
const state: { settings: MaddoxSettings | null } = { settings: null }

/** Respostas roteirizadas do provedor: cada chamada consome a próxima lista de eventos. */
const scripted: AiStreamEvent[][] = []
const streamCalls: AiStreamRequest[] = []
const generateAiText = vi.fn()
const askJevSystemOne = vi.fn()
const ensureMaddoxSession = vi.fn(async () => "ses_entrevista")
const releaseInterviewSession = vi.fn(async () => undefined)
const createBlankSheet = vi.fn()

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: state.settings, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ ...availability })),
}))
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ ...availability })) }))
vi.mock("@/lib/ai/stream", () => ({
    streamAi: vi.fn(async function* (request: AiStreamRequest) {
        streamCalls.push(request)
        for (const event of scripted.shift() ?? [{ type: "delta", text: "Olá!" }, { type: "done", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: null }, durationMs: 1 }]) yield event
    }),
    generateAiText,
}))
vi.mock("@/lib/ai/jev", () => ({ askJevSystemOne }))
vi.mock("@/features/maddox/server/opencode-sessions", () => ({ ensureMaddoxSession, releaseInterviewSession }))
vi.mock("@/features/character-sheets/api/character-sheets-service", () => ({ createBlankSheet }))
const { searchCatalogEntities } = vi.hoisted(() => ({
    searchCatalogEntities: vi.fn(async ({ query, types }: { query: string; types?: string[] }) => ({
        items: [
            { id: "race-elfo", name: "Elfo", originalName: "Elf", type: "Raça" },
            { id: "monster-lyra", name: "Lyra", originalName: "Lyra", type: "Monstro" },
        ].filter((item) => item.name.toLowerCase() === query.toLowerCase() && (!types?.length || types.includes(item.type))),
        limit: 10,
        offset: 0,
    })),
}))
vi.mock("@/features/mcp/server/catalog-entity-service", () => ({ searchCatalogEntities }))

const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
const { MADDOX_PROPOSAL_MARKER, MADDOX_INTERVIEW_MESSAGES_MAX } = await import("@/features/maddox/constants")
const { MaddoxCampaignModel, MaddoxCampaignMemberModel, MaddoxCharacterModel, MaddoxInterviewModel, MaddoxInterviewScriptModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { RaceModel } = await import("@/features/races/models/race")
const campaigns = await import("@/features/maddox/server/campaigns")
const interviews = await import("@/features/maddox/server/interviews")
const { completeInterview } = await import("@/features/maddox/server/interview-consolidation")

let mongo: MongoMemoryServer
const ids = { owner: "", ana: "", stranger: "" }

const done: AiStreamEvent = { type: "done", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: null }, durationMs: 1 }
const reply = (...texts: string[]): AiStreamEvent[] => [...texts.map((text): AiStreamEvent => ({ type: "delta", text })), done]
const proposalReply = () => reply("Síntese: um mundo sombrio. Confirma?\n[[MADDOX_PROPOSTA_", "DE_CONCLUSAO]]")

async function seedUser(username: string, name: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name, email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function run(turn: Awaited<ReturnType<typeof interviews.sendInterviewMessage>>) {
    const lines: MaddoxInterviewStreamLine[] = []
    await interviews.runTurn(turn, (line) => lines.push(line))
    return lines
}

async function startScenario(campaignId: string) {
    const { turn } = await interviews.startInterview(campaignId, "scenario", ids.owner)
    if (!turn) throw new Error("sem turno")
    return run(turn)
}

async function newCampaign(rigor: "narrativo" | "equilibrado" | "fiel-dnd" = "narrativo") {
    const campaign = await campaigns.createCampaign({ name: "Brumas de Valdrenn", rigor }, ids.owner)
    const { token } = await campaigns.getInviteLink(campaign.id, ids.owner)
    await campaigns.joinByInvite(token, ids.ana)
    return campaign.id
}

/** Cenário inteiro até a conclusão (a consolidação devolve o JSON pedido). */
async function finishScenario(campaignId: string) {
    await startScenario(campaignId)
    scripted.push(proposalReply())
    await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Fantasia sombria." }, ids.owner))
    generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ setting: { universo: "Aethra", canone: "", contexto: "Era das brumas", regras: "", tom: "Sombrio" }, openingSituation: "Numa taverna.", campaignName: null }) })
    await completeInterview(campaignId, "scenario", ids.owner)
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_interviews_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxInterviewModel.init(), MaddoxInterviewScriptModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await mongoose.connection.db!.dropDatabase()
    await Promise.all([MaddoxInterviewModel.init(), MaddoxCampaignMemberModel.init(), MaddoxInterviewScriptModel.init()])
    ids.owner = await seedUser("mestre", "Marina Dona")
    ids.ana = await seedUser("ana", "Ana Jogadora")
    ids.stranger = await seedUser("estranho", "Estranho")
    availability.available = true
    availability.reason = null
    state.settings = { ...DEFAULT_MADDOX_SETTINGS, enabled: true, main: { ...DEFAULT_MADDOX_SETTINGS.main, provider: "gemini", model: "gemini-pro" } }
    scripted.length = 0
    streamCalls.length = 0
    for (const fn of [recordAudit, publishToChannels, generateAiText, askJevSystemOne, ensureMaddoxSession, releaseInterviewSession, createBlankSheet]) fn.mockClear()
    generateAiText.mockReset()
    askJevSystemOne.mockReset()
    createBlankSheet.mockReset()
    createBlankSheet.mockImplementation(async (userId: string, username: string, name: string) => (await CharacterSheet.create({ userId, username, name, slug: `${username}/${name.toLowerCase()}` })).toObject())
})

describe("entrevista de cenário — início", () => {
    it("o dono começa: grava a versão do roteiro, a campanha fica 'Em entrevista', o rigor trava e a abertura é gravada", async () => {
        await MaddoxInterviewScriptModel.create({ kind: "scenario", version: 1, guide: "Guia do teste", topics: [{ id: "t2", text: "Segundo tópico", active: true }, { id: "t1", text: "Primeiro tópico", active: true }], notes: "", createdBy: ids.owner })
        const campaignId = await newCampaign()
        scripted.push(reply("Saudações, sou Maddox. ", "Que universo você imagina?"))
        const lines = await startScenario(campaignId)

        expect(lines.filter((line) => line.type === "delta").map((line) => (line as { text: string }).text).join("")).toBe("Saudações, sou Maddox. Que universo você imagina?")
        const last = lines[lines.length - 1]!
        expect(last.type).toBe("done")
        const stored = await MaddoxInterviewModel.findOne({ campaignId }).lean()
        expect(stored).toMatchObject({ kind: "scenario", scriptVersion: 1, status: "in-progress", generating: null })
        expect(stored!.messages).toHaveLength(1)
        expect(stored!.messages[0]).toMatchObject({ role: "maddox", content: "Saudações, sou Maddox. Que universo você imagina?", proposal: false })
        const campaign = await MaddoxCampaignModel.findById(campaignId).lean()
        expect(campaign).toMatchObject({ status: "interview", scenarioInterview: { status: "in-progress" }, scriptVersions: { scenario: 1 } })
        // As perguntas e a ordem vêm do roteiro gravado.
        expect(streamCalls[0]!.instructions).toContain("1. Segundo tópico\n2. Primeiro tópico")
        expect(streamCalls[0]!.messages?.[0]).toMatchObject({ role: "user" })
        expect(streamCalls[0]!.consumption).toEqual({ origin: "maddox-interview", subject: campaignId })
        await expect(campaigns.updateCampaign(campaignId, { rigor: "fiel-dnd" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "RIGOR_LOCKED" })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "CampanhaMaddox", depois: expect.objectContaining({ interview: "cenário iniciado", scriptVersion: 1 }) }))
    })

    it("começar de novo é idempotente: não gera outra abertura", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        const again = await interviews.startInterview(campaignId, "scenario", ids.owner)
        expect(again.turn).toBeNull()
        expect(again.interview.messages).toHaveLength(1)
        expect(streamCalls).toHaveLength(1)
    })

    it("jogador não faz a entrevista de cenário (403) e quem não participa recebe 404", async () => {
        const campaignId = await newCampaign()
        await expect(interviews.startInterview(campaignId, "scenario", ids.ana)).rejects.toMatchObject({ status: 403 })
        await expect(interviews.startInterview(campaignId, "scenario", ids.stranger)).rejects.toMatchObject({ status: 404 })
        await expect(interviews.getInterview(campaignId, "scenario", ids.stranger)).rejects.toMatchObject({ status: 404 })
    })

    it("com o Agente Maddox indisponível responde 409 e não cria nada", async () => {
        const campaignId = await newCampaign()
        availability.available = false
        availability.reason = 'O "Agente Maddox" está desativado.'
        await expect(interviews.startInterview(campaignId, "scenario", ids.owner)).rejects.toMatchObject({ status: 409, code: "MADDOX_UNAVAILABLE" })
        expect(await MaddoxInterviewModel.countDocuments()).toBe(0)
        expect((await MaddoxCampaignModel.findById(campaignId).lean())!.status).toBe("lobby")
    })

    it("campanha encerrada não aceita entrevista (409)", async () => {
        const campaignId = await newCampaign()
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { status: "ended" } })
        await expect(interviews.startInterview(campaignId, "scenario", ids.owner)).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_CLOSED" })
    })
})

describe("entrevista de cenário — conversa", () => {
    it("o marcador partido entre deltas não chega ao stream; vira proposta; uma nova resposta desfaz a proposta", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        scripted.push(proposalReply())
        const lines = await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Fantasia sombria." }, ids.owner))
        expect(lines[0]).toMatchObject({ type: "user", message: { role: "user", content: "Fantasia sombria." } })
        const streamed = lines.filter((line) => line.type === "delta").map((line) => (line as { text: string }).text).join("")
        expect(streamed).not.toContain("[[")
        expect(streamed).not.toContain(MADDOX_PROPOSAL_MARKER)
        let stored = await MaddoxInterviewModel.findOne({ campaignId }).lean()
        expect(stored!.status).toBe("proposed")
        expect(stored!.messages.at(-1)).toMatchObject({ role: "maddox", proposal: true, content: "Síntese: um mundo sombrio. Confirma?" })
        expect((await MaddoxCampaignModel.findById(campaignId).lean())!.scenarioInterview.status).toBe("proposed")

        scripted.push(reply("Ajustado. Mais algo?"))
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Troque o tom para épico." }, ids.owner))
        stored = await MaddoxInterviewModel.findOne({ campaignId }).lean()
        expect(stored!.status).toBe("in-progress")
        expect(stored!.messages.filter((message) => message.proposal)).toHaveLength(0)
        expect((await MaddoxCampaignModel.findById(campaignId).lean())!.scenarioInterview.status).toBe("in-progress")
        // Provedores sem sessão recebem o histórico gravado.
        expect(streamCalls.at(-1)!.messages!.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant", "user"])
    })

    it("uma geração por vez: com a trava ocupada responde 409; trava vencida é retomada", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        const turn = await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Primeira" }, ids.owner)
        await expect(interviews.sendInterviewMessage(campaignId, "scenario", { content: "Segunda" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "INTERVIEW_BUSY" })
        await run(turn)
        await MaddoxInterviewModel.updateOne({ campaignId }, { $set: { generating: { token: "antigo", startedAt: new Date(Date.now() - 10 * 60_000) } } })
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Depois da queda" }, ids.owner))
        expect((await MaddoxInterviewModel.findOne({ campaignId }).lean())!.generating).toBeNull()
    })

    it("falha do provedor grava a mensagem com erro; 'Tentar de novo' gera outra vez", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        scripted.push([{ type: "error", message: "Provedor inacessível" }])
        const lines = await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Olá" }, ids.owner))
        expect(lines.at(-1)).toMatchObject({ type: "error", message: "Provedor inacessível" })
        let stored = await MaddoxInterviewModel.findOne({ campaignId }).lean()
        expect(stored!.messages.at(-1)).toMatchObject({ role: "maddox", error: "Provedor inacessível" })
        expect(stored!.generating).toBeNull()

        scripted.push(reply("Agora sim."))
        await run(await interviews.retryInterviewTurn(campaignId, "scenario", ids.owner))
        stored = await MaddoxInterviewModel.findOne({ campaignId }).lean()
        expect(stored!.messages.map((message) => message.content)).toEqual(["Olá!", "Olá", "Agora sim."])
        await expect(interviews.retryInterviewTurn(campaignId, "scenario", ids.owner)).rejects.toMatchObject({ status: 409, code: "NOTHING_TO_RETRY" })
        expect((await MaddoxInterviewModel.findOne({ campaignId }).lean())!.generating).toBeNull()
    })

    it("entrevistador indisponível ao enviar: 409 e a conversa (e a proposta) ficam intactas", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        scripted.push(proposalReply())
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Pode ser." }, ids.owner))
        const before = await MaddoxInterviewModel.findOne({ campaignId }).lean()
        availability.available = false
        availability.reason = 'O "Agente Maddox" está desativado.'
        await expect(interviews.sendInterviewMessage(campaignId, "scenario", { content: "Ajuste" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "MADDOX_UNAVAILABLE" })
        const after = await MaddoxInterviewModel.findOne({ campaignId }).lean()
        expect(after!.messages).toEqual(before!.messages)
        expect(after).toMatchObject({ status: "proposed", generating: null })
        expect((await MaddoxCampaignModel.findById(campaignId).lean())!.scenarioInterview.status).toBe("proposed")
    })

    it("falha da sessão do OpenCode ao enviar também não deixa mensagem órfã", async () => {
        state.settings = { ...state.settings!, interviewer: { provider: "opencode", model: "anthropic/claude", agent: null, variant: null } }
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        ensureMaddoxSession.mockRejectedValueOnce(new Error("OpenCode fora do ar"))
        await expect(interviews.sendInterviewMessage(campaignId, "scenario", { content: "Olá" }, ids.owner)).rejects.toThrow("OpenCode fora do ar")
        const stored = await MaddoxInterviewModel.findOne({ campaignId }).lean()
        expect(stored!.messages.map((message) => message.role)).toEqual(["maddox"])
        expect(stored!.generating).toBeNull()
    })

    it("limite de mensagens: 409 pedindo para concluir", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        const filler = Array.from({ length: MADDOX_INTERVIEW_MESSAGES_MAX }, (_, index) => ({ id: `m${index}`, role: "user", content: "x", proposal: false, error: null, createdAt: new Date() }))
        await MaddoxInterviewModel.updateOne({ campaignId }, { $set: { messages: filler } })
        await expect(interviews.sendInterviewMessage(campaignId, "scenario", { content: "mais" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "INTERVIEW_TOO_LONG" })
    })

    it("JEV ligado: a resposta 'sim' acrescenta a orientação de propor a síntese; falha do JEV é ignorada; desligado não chama", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Sem JEV" }, ids.owner))
        expect(askJevSystemOne).not.toHaveBeenCalled()

        state.settings = { ...state.settings!, jev: { ...state.settings!.jev, "interview-complete": true } }
        askJevSystemOne.mockResolvedValueOnce({ answers: { ready: { type: "noul", noul: 0.9 } } })
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Já defini tudo" }, ids.owner))
        expect(askJevSystemOne).toHaveBeenCalledWith(expect.objectContaining({ model: "jev-latest", questions: expect.objectContaining({ ready: expect.objectContaining({ type: "noul" }) }) }))
        expect(streamCalls.at(-1)!.instructions).toContain("apresente agora a síntese")

        askJevSystemOne.mockRejectedValueOnce(new Error("JEV fora do ar"))
        const lines = await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "E agora?" }, ids.owner))
        expect(lines.at(-1)!.type).toBe("done")
        expect(streamCalls.at(-1)!.instructions).not.toContain("apresente agora a síntese")
    })

    it("OpenCode: usa a sessão gerenciada da entrevista com o agente do entrevistador", async () => {
        state.settings = { ...state.settings!, interviewer: { provider: "opencode", model: "anthropic/claude", agent: "maddox", variant: null } }
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        expect(ensureMaddoxSession).toHaveBeenCalledWith(expect.objectContaining({ campaignId, purpose: "scenario-interview", agent: "maddox" }))
        expect(streamCalls[0]).toMatchObject({ provider: "opencode", model: "anthropic/claude", opencodeSessionId: "ses_entrevista", temperature: null })
    })
})

describe("menções do catálogo", () => {
    it("a citação {{Tipo:Nome}} é gravada como menção; negrito não consulta; o stream nunca mostra {{ e o histórico volta com a marcação", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        searchCatalogEntities.mockClear()
        scripted.push(reply("Que tal um {", "{Raça:El", "fo}} vindo de **Aethra**?"))
        const lines = await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Sugira algo" }, ids.owner))
        const deltas = lines.filter((line): line is Extract<MaddoxInterviewStreamLine, { type: "delta" }> => line.type === "delta").map((line) => line.text)
        expect(deltas.join("")).toBe("Que tal um **Elfo** vindo de **Aethra**?")
        for (const delta of deltas) expect(delta).not.toMatch(/[{}]/)
        const final = lines.at(-1) as Extract<MaddoxInterviewStreamLine, { type: "done" }>
        expect(final.message.content).toBe("Que tal um [Elfo](#mention:Ra%C3%A7a:race-elfo) vindo de **Aethra**?")
        const stored = await MaddoxInterviewModel.findOne({ campaignId }).lean()
        expect(stored!.messages.at(-1)!.content).toContain("(#mention:Ra%C3%A7a:race-elfo)")
        expect(searchCatalogEntities).toHaveBeenCalledTimes(1)
        expect(searchCatalogEntities).toHaveBeenCalledWith(expect.objectContaining({ query: "Elfo", types: ["Raça"] }))

        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Gostei" }, ids.owner))
        const history = streamCalls.at(-1)!.messages!.map((message) => (typeof message.content === "string" ? message.content : "")).join("\n")
        expect(history).toContain("Que tal um {{Raça:Elfo}} vindo de **Aethra**?")
        expect(history).not.toContain("#mention:")
        expect(streamCalls.at(-1)!.instructions).toContain("{{Tipo:Nome oficial em português}}")
    })

    it("personagem com o mesmo nome de um monstro do catálogo nunca vira menção (caso da prévia)", async () => {
        const campaignId = await newCampaign()
        await finishScenario(campaignId)
        await campaigns.upsertCharacterDraft(campaignId, { name: "Lyra Ventobravo" }, ids.ana)
        scripted.push(reply("Olá! Vamos criar a {{Monstro:Lyra}}. Como a **Lyra** é por fora?"))
        const { turn } = await interviews.startInterview(campaignId, "character", ids.ana)
        await run(turn!)
        const stored = await MaddoxInterviewModel.findOne({ campaignId, kind: "character" }).lean()
        expect(stored!.messages.at(-1)!.content).toBe("Olá! Vamos criar a **Lyra**. Como a **Lyra** é por fora?")
        expect(stored!.messages.at(-1)!.content).not.toContain("#mention:")
    })

    it("a consolidação liga as citações no cenário e protege os nomes da campanha", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        scripted.push(proposalReply())
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Pode ser." }, ids.owner))
        generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ setting: { universo: "Terra do povo {{Raça:Elfo}} e do vale **Valdrenn**" }, openingSituation: "Um {{Raça:Elfo}} chega a {{Monstro:Valdrenn}}." }) })
        const detail = await completeInterview(campaignId, "scenario", ids.owner)
        expect(detail.setting).toContain("povo [Elfo](#mention:Ra%C3%A7a:race-elfo)")
        expect(detail.openingSituation).toBe("Um [Elfo](#mention:Ra%C3%A7a:race-elfo) chega a **Valdrenn**.")
        expect(detail.setting).not.toContain("{{")
    })
})

describe("conclusão do cenário", () => {
    it("antes da síntese responde 409; ao confirmar grava o cenário, volta ao lobby, renomeia e libera a sessão", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        await expect(completeInterview(campaignId, "scenario", ids.owner)).rejects.toMatchObject({ status: 409, code: "NO_PROPOSAL" })
        scripted.push(proposalReply())
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Pode ser." }, ids.owner))
        generateAiText.mockResolvedValueOnce({ text: "```json\n" + JSON.stringify({ setting: { universo: "Aethra", canone: "Original", contexto: "Era das brumas", regras: "Magia rara", tom: "Sombrio" }, openingSituation: "Numa taverna de Valdrenn.", campaignName: "Crônicas de Aethra" }) + "\n```" })

        const detail = await completeInterview(campaignId, "scenario", ids.owner)
        expect(detail).toMatchObject({ status: "lobby", scenarioStatus: "done", name: "Crônicas de Aethra", openingSituation: "Numa taverna de Valdrenn.", rigorLocked: true })
        expect(detail.setting).toContain("## Universo e referências\nAethra")
        const stored = await MaddoxInterviewModel.findOne({ campaignId }).lean()
        expect(stored).toMatchObject({ status: "done", generating: null })
        expect(stored!.completedAt).toBeInstanceOf(Date)
        expect(releaseInterviewSession).toHaveBeenCalledWith(campaignId, "scenario-interview", expect.any(String))
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ interview: "cenário concluído", name: "Crônicas de Aethra" }) }))
        await expect(completeInterview(campaignId, "scenario", ids.owner)).rejects.toMatchObject({ status: 409, code: "INTERVIEW_DONE" })
        await expect(interviews.sendInterviewMessage(campaignId, "scenario", { content: "mais" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "INTERVIEW_DONE" })
        await expect(campaigns.updateCampaign(campaignId, { rigor: "fiel-dnd" }, ids.owner)).rejects.toMatchObject({ code: "RIGOR_LOCKED" })
    })

    it("campos longos do modelo não invalidam a consolidação: o texto é gravado inteiro", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        scripted.push(proposalReply())
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Pode ser." }, ids.owner))
        const universo = "Aethra ".repeat(1500).trim()
        const opening = "Numa taverna. ".repeat(600).trim()
        expect(universo.length).toBeGreaterThan(6000)
        generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ setting: { universo }, openingSituation: opening }) })
        const detail = await completeInterview(campaignId, "scenario", ids.owner)
        expect(detail.setting).toContain(`## Universo e referências\n${universo}\n`)
        expect(detail.openingSituation).toBe(opening)
    })

    it("depois de pegar a trava revalida a proposta: ajuste enviado por outra aba = 409 NO_PROPOSAL e nada é gravado", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        scripted.push(proposalReply())
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Pode ser." }, ids.owner))
        // Simula a outra aba: entre a leitura e a trava, a proposta foi desfeita.
        const original = MaddoxInterviewModel.findOneAndUpdate.bind(MaddoxInterviewModel)
        const spy = vi.spyOn(MaddoxInterviewModel, "findOneAndUpdate").mockImplementationOnce(((filter: unknown, update: unknown, options: unknown) => {
            return {
                lean: async () => {
                    await MaddoxInterviewModel.updateOne({ campaignId }, { $set: { status: "in-progress" } })
                    return original(filter as never, update as never, options as never).lean()
                },
            }
        }) as never)
        await expect(completeInterview(campaignId, "scenario", ids.owner)).rejects.toMatchObject({ status: 409, code: "NO_PROPOSAL" })
        spy.mockRestore()
        expect(generateAiText).not.toHaveBeenCalled()
        expect((await MaddoxInterviewModel.findOne({ campaignId }).lean())).toMatchObject({ status: "in-progress", generating: null })
        expect((await MaddoxCampaignModel.findById(campaignId).lean())!.setting).toBe("")
    })

    it("falha ao gravar o cenário mantém a entrevista em 'proposed'; confirmar de novo conclui", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        scripted.push(proposalReply())
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Pode ser." }, ids.owner))
        const json = JSON.stringify({ setting: { universo: "Aethra" }, openingSituation: "Início." })
        generateAiText.mockResolvedValue({ text: json })
        const spy = vi.spyOn(MaddoxCampaignModel, "updateOne").mockRejectedValueOnce(new Error("Mongo caiu") as never)
        await expect(completeInterview(campaignId, "scenario", ids.owner)).rejects.toThrow("Mongo caiu")
        spy.mockRestore()
        expect((await MaddoxInterviewModel.findOne({ campaignId }).lean())).toMatchObject({ status: "proposed", generating: null })
        const detail = await completeInterview(campaignId, "scenario", ids.owner)
        expect(detail.scenarioStatus).toBe("done")
        expect((await MaddoxInterviewModel.findOne({ campaignId }).lean())!.status).toBe("done")
    })

    it("JSON inválido duas vezes: 502 sem gravar nada e a trava liberada; inválido uma vez: tenta de novo", async () => {
        const campaignId = await newCampaign()
        await startScenario(campaignId)
        scripted.push(proposalReply())
        await run(await interviews.sendInterviewMessage(campaignId, "scenario", { content: "Pode ser." }, ids.owner))
        generateAiText.mockResolvedValueOnce({ text: "não é json" }).mockResolvedValueOnce({ text: '{"setting": 3}' })
        await expect(completeInterview(campaignId, "scenario", ids.owner)).rejects.toMatchObject({ status: 502, code: "CONSOLIDATION_FAILED" })
        expect((await MaddoxCampaignModel.findById(campaignId).lean())).toMatchObject({ setting: "", status: "interview" })
        expect((await MaddoxInterviewModel.findOne({ campaignId }).lean())).toMatchObject({ status: "proposed", generating: null })

        generateAiText.mockResolvedValueOnce({ text: "lixo" }).mockResolvedValueOnce({ text: JSON.stringify({ setting: { universo: "Aethra" }, openingSituation: "Início." }) })
        const detail = await completeInterview(campaignId, "scenario", ids.owner)
        expect(detail.scenarioStatus).toBe("done")
        expect(detail.name).toBe("Brumas de Valdrenn")
    })
})

describe("entrevista de personagem", () => {
    it("antes do cenário: 409 SCENARIO_PENDING; sem esboço: 409 CHARACTER_DRAFT_REQUIRED", async () => {
        const campaignId = await newCampaign()
        await campaigns.upsertCharacterDraft(campaignId, { name: "Lyra" }, ids.ana)
        await expect(interviews.startInterview(campaignId, "character", ids.ana)).rejects.toMatchObject({ status: 409, code: "SCENARIO_PENDING" })
        await finishScenario(campaignId)
        await expect(interviews.startInterview(campaignId, "character", ids.owner)).rejects.toMatchObject({ status: 409, code: "CHARACTER_DRAFT_REQUIRED" })
    })

    it("rigor narrativo: gera só o perfil narrativo, sem ficha, e o jogador fica pronto para jogar", async () => {
        const campaignId = await newCampaign("narrativo")
        await finishScenario(campaignId)
        await campaigns.upsertCharacterDraft(campaignId, { name: "Lyra" }, ids.ana)
        await expect(campaigns.assertMemberCanPlay(campaignId, ids.ana)).rejects.toMatchObject({ status: 409, code: "INTERVIEW_REQUIRED" })

        const { turn } = await interviews.startInterview(campaignId, "character", ids.ana)
        await run(turn!)
        expect(streamCalls.at(-1)!.instructions).toContain("Aethra")
        let character = await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean()
        expect(character!.interview).toMatchObject({ status: "in-progress", scriptVersion: 0 })
        scripted.push(proposalReply())
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Uma ladra élfica." }, ids.ana))
        generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ name: "Lyra Ventobravo", profile: { identidade: "Elfa ladra", origem: "Órfã do porto" }, sheet: null }) })

        const detail = await completeInterview(campaignId, "character", ids.ana)
        const me = detail.members.find((member) => member.userId === ids.ana)!
        expect(me.ready).toBe(true)
        expect(me.character).toMatchObject({ name: "Lyra Ventobravo", interviewStatus: "done", sheetSlug: null })
        expect(me.character!.profile).toMatchObject({ identidade: "Elfa ladra", origem: "Órfã do porto", condicao: "a definir durante a história" })
        character = await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean()
        expect(character!.sheetId).toBeNull()
        expect(createBlankSheet).not.toHaveBeenCalled()
        expect(releaseInterviewSession).toHaveBeenLastCalledWith(campaignId, "character-interview", expect.any(String))
        await expect(campaigns.assertMemberCanPlay(campaignId, ids.ana)).resolves.toBeUndefined()
        expect((await MaddoxCampaignModel.findById(campaignId).lean())!.scriptVersions.character).toBe(0)
    })

    it("rigor equilibrado: também cria a ficha D&D com atributos e a referência do catálogo por nome", async () => {
        const raceId = new mongoose.Types.ObjectId()
        await RaceModel.collection.insertOne({ _id: raceId, name: "Élfo", status: "active" })
        const campaignId = await newCampaign("equilibrado")
        await finishScenario(campaignId)
        await campaigns.upsertCharacterDraft(campaignId, { name: "Lyra", portraitUrl: "/uploads/lyra.png" }, ids.ana)
        const { turn } = await interviews.startInterview(campaignId, "character", ids.ana)
        await run(turn!)
        expect(streamCalls.at(-1)!.instructions).toContain("ficha do D&D")
        scripted.push(proposalReply())
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Elfa ladina." }, ids.ana))
        generateAiText.mockResolvedValueOnce({
            text: JSON.stringify({
                name: null,
                profile: { identidade: "Elfa" },
                sheet: { race: "elfo", class: "Ladino", origin: "Criminoso", attributes: { strength: 8, dexterity: 17, constitution: 12, intelligence: 13, wisdom: 10, charisma: 99 } },
            }),
        })
        const detail = await completeInterview(campaignId, "character", ids.ana)
        expect(createBlankSheet).toHaveBeenCalledWith(ids.ana, "ana", "Lyra")
        const character = await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean()
        const sheet = await CharacterSheet.findById(character!.sheetId).lean()
        expect(sheet).toMatchObject({ name: "Lyra", race: "elfo", class: "Ladino", origin: "Criminoso", level: 1, dexterity: 17, strength: 8, photo: "/uploads/lyra.png" })
        expect(String(sheet!.raceRef)).toBe(String(raceId))
        // Atributo fora do intervalo (1–30) é descartado.
        expect(sheet!.charisma).not.toBe(99)
        expect(detail.members.find((member) => member.userId === ids.ana)!.character!.sheetSlug).toBe("ana/lyra")
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ sheet: "ficha criada" }) }))
    })

    it("campos longos da ficha (idade, peso, olhos) são gravados inteiros; renomear depois propaga à ficha", async () => {
        const campaignId = await newCampaign("equilibrado")
        await finishScenario(campaignId)
        await campaigns.upsertCharacterDraft(campaignId, { name: "Lyra" }, ids.ana)
        await run((await interviews.startInterview(campaignId, "character", ids.ana)).turn!)
        scripted.push(proposalReply())
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Pronto." }, ids.ana))
        const weight = "aproximadamente 85 kg, constituição robusta"
        const eyes = "castanhos escuros com reflexos dourados ao sol"
        const age = "por volta de cento e vinte anos, jovem para uma elfa"
        const identidade = "Elfa. ".repeat(1500).trim()
        const origin = "Criminosa do porto de Valdrenn. ".repeat(80).trim()
        expect(origin.length).toBeGreaterThan(2500)
        generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ name: "L".repeat(200), profile: { identidade }, sheet: { race: "Elfo", origin, weight, eyes, age } }) })
        await completeInterview(campaignId, "character", ids.ana)
        // Origem acima do limite da ficha: a ficha guarda 2.000 caracteres e o resultado da entrevista, o texto inteiro.
        const sheetAfter = await CharacterSheet.findById((await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean())!.sheetId).lean()
        expect(sheetAfter!.origin).toBe(origin.slice(0, 2000))
        expect(sheetAfter!.origin).toHaveLength(2000)
        const result = (await MaddoxInterviewModel.findOne({ campaignId, kind: "character" }).lean())!.result as { sheet: { origin: string } }
        expect(result.sheet.origin).toBe(origin)
        const character = await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean()
        // Nome fora do limite é ignorado (fica o do esboço), sem invalidar o resto.
        expect(character!.name).toBe("Lyra")
        expect((character!.profile as unknown as Record<string, string>).identidade).toBe(identidade)
        expect(await CharacterSheet.findById(character!.sheetId).lean()).toMatchObject({ weight, eyes, age, race: "Elfo" })

        await campaigns.upsertCharacterDraft(campaignId, { name: "Lira", portraitUrl: "/uploads/lira.png" }, ids.ana)
        expect(await CharacterSheet.findById(character!.sheetId).lean()).toMatchObject({ name: "Lira", photo: "/uploads/lira.png" })
        expect((await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean())!.name).toBe("Lira")
    })
})
