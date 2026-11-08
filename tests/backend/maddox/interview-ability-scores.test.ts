import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { ModelMessage } from "ai"
import type { AiStreamRequest } from "@/lib/ai/stream"
import type { MaddoxSettings } from "@/features/maddox/schemas"
import type { MaddoxInterviewStreamLine } from "@/features/maddox/interview-types"
import { fighterBuild, seedSheetCatalog, setInterviewBuild } from "./helpers/sheet-catalog"
import { nameMaddoxCharacter } from "../../helpers/maddox-character"

/**
 * Atributos na entrevista de personagem (Maddox 5), de ponta a ponta: o entrevistador (provedor direto, `streamText`
 * roteirizado) chama as ferramentas de verdade; as rolagens passam pelo motor de dados (mockado com dados fixos) e o
 * card enviado vira os atributos da ficha.
 */

process.env.AUTH_SECRET ||= "segredo-de-teste-do-maddox"

type Step = { type: "delta"; text: string } | { type: "error"; message: string } | { type: "call"; name: string; input: unknown }

const recordAudit = vi.fn(async () => undefined)
const availability = { available: true, reason: null as string | null }
const state: { settings: MaddoxSettings | null } = { settings: null }
const scripted: Step[][] = []
const calls: { via: "tools" | "stream"; instructions: string; messages: ModelMessage[]; toolNames: string[] }[] = []
const toolResults: { name: string; output?: unknown; error?: string }[] = []
const generateAiText = vi.fn()
const createBlankSheet = vi.fn()
const diceQueue: number[][] = []
const rollGeneralDice = vi.fn(async (request: { terms: { dice: string; quantity: number }[] }) => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    const results = diceQueue.shift() ?? [3, 3, 3, 3]
    return { rollId: `roll-${Math.random()}`, terms: [{ dice: "d6", quantity: request.terms[0]!.quantity, results }], mode: "normal", diceTotal: 0, modifier: 0, total: 0, createdAt: new Date().toISOString() }
})

// A consulta ao catálogo conecta pelo `dbConnect` do core: no teste, a conexão já é a do MongoDB em memória.
vi.mock("@/core/database/db", () => ({ default: vi.fn(async () => undefined) }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: state.settings, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ ...availability })),
}))
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ ...availability })) }))
vi.mock("@/lib/ai/stream", () => ({
    streamAi: vi.fn(async function* (request: AiStreamRequest) {
        calls.push({ via: "stream", instructions: request.instructions, messages: request.messages ?? [], toolNames: [] })
        for (const step of scripted.shift() ?? [{ type: "delta", text: "Olá!" }]) {
            if (step.type === "delta") yield { type: "delta", text: step.text }
            else if (step.type === "error") yield { type: "error", message: step.message }
        }
        yield { type: "done", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: null }, durationMs: 1 }
    }),
    generateAiText,
    prepareModel: vi.fn(async () => ({ model: {}, dispose: async () => undefined })),
    samplingOptions: () => ({}),
    describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock("ai", () => ({
    dynamicTool: (def: unknown) => def,
    stepCountIs: (count: number) => count,
    streamText: (options: { instructions: string; messages: ModelMessage[]; tools: Record<string, { execute: (input: unknown) => Promise<unknown> }> }) => {
        calls.push({ via: "tools", instructions: options.instructions, messages: options.messages, toolNames: Object.keys(options.tools) })
        const steps = scripted.shift() ?? [{ type: "delta", text: "Olá!" }]
        return {
            fullStream: (async function* () {
                for (const step of steps) {
                    if (step.type === "delta") yield { type: "text-delta", text: step.text }
                    else if (step.type === "error") yield { type: "error", error: new Error(step.message) }
                    else {
                        try {
                            toolResults.push({ name: step.name, output: await options.tools[step.name]!.execute(step.input) })
                        } catch (error) {
                            toolResults.push({ name: step.name, error: (error as Error).message })
                        }
                        yield { type: "start-step" }
                    }
                }
                yield { type: "finish", finishReason: "stop", totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
            })(),
        }
    },
}))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: vi.fn(async () => undefined) }))
vi.mock("@/lib/ai/jev", () => ({ askJevSystemOne: vi.fn() }))
vi.mock("@/features/maddox/server/opencode-sessions", () => ({ ensureMaddoxSession: vi.fn(async () => "ses"), releaseInterviewSession: vi.fn(async () => undefined) }))
// O retrato do personagem (DND-31) é coberto em interviews.test.ts: aqui a geração em segundo plano não roda.
vi.mock("@/features/maddox/server/character-portrait", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/character-portrait")>()), scheduleCharacterPortrait: vi.fn() }))
vi.mock("@/features/character-sheets/api/character-sheets-service", () => ({ createBlankSheet }))
// Catálogo real sobre o MongoDB em memória (menções e as ferramentas search_catalog/get_catalog_entity).
vi.mock("@/features/dice-roller/server/dice-roll-service", () => ({ rollGeneralDice }))
vi.mock("@/features/dice-roller/server/dice-target", () => ({ resolveGeneralDiceTarget: (input: { userId: string }) => ({ scope: "user", userId: input.userId }) }))

const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
const { MaddoxCampaignModel, MaddoxCampaignMemberModel, MaddoxCharacterModel, MaddoxInterviewModel, MaddoxInterviewScriptModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { BackgroundModel } = await import("@/features/backgrounds/models/background")
const campaigns = await import("@/features/maddox/server/campaigns")
const interviews = await import("@/features/maddox/server/interviews")
const scoresService = await import("@/features/maddox/server/interview-scores-service")
const { completeInterview } = await import("@/features/maddox/server/interview-consolidation")

let mongo: MongoMemoryServer
const ids = { owner: "", ana: "" }

const say = (text: string): Step => ({ type: "delta", text })
const call = (name: string, input: unknown = {}): Step => ({ type: "call", name, input })
const PROPOSAL = "Síntese pronta. Confirma?\n[[MADDOX_PROPOSTA_DE_CONCLUSAO]]"
/** Cinco 4d6 de 17, 14, 12, 9 e 12 (soma 64): a sexta é 8. */
const FIVE_ROLLS = [
    [6, 6, 5, 1],
    [5, 5, 4, 1],
    [4, 4, 4, 2],
    [3, 3, 3, 3],
    [6, 5, 1, 1],
]

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

/** Campanha com cenário concluído e a entrevista de personagem da Ana aberta (abertura sem card). */
async function characterInterview(rigor: "narrativo" | "equilibrado" | "rigoroso" | "fiel-dnd" = "fiel-dnd") {
    const campaign = await campaigns.createCampaign({ name: "Brumas", rigor }, ids.owner)
    const { token } = await campaigns.getInviteLink(campaign.id, ids.owner)
    await campaigns.joinByInvite(token, ids.ana)
    const scenario = await interviews.startInterview(campaign.id, "scenario", ids.owner)
    await run(scenario.turn!)
    scripted.push([say(PROPOSAL)])
    await run(await interviews.sendInterviewMessage(campaign.id, "scenario", { content: "Sombrio." }, ids.owner))
    generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ setting: { universo: "Aethra", canone: "", contexto: "", regras: "", tom: "" }, openingSituation: "Numa taverna.", campaignName: null }) })
    await completeInterview(campaign.id, "scenario", ids.owner)
    const { turn } = await interviews.startInterview(campaign.id, "character", ids.ana)
    await nameMaddoxCharacter(campaign.id, ids.ana, "Lyra")
    await run(turn!)
    return campaign.id
}

/** Turno do Maddox que abre o card. */
async function openCard(campaignId: string, extra: Step[] = []) {
    scripted.push([call("request_ability_scores", { motivo: "Hora dos atributos da Lyra" }), ...extra, say("Escolha o método no card abaixo.")])
    return run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Vamos aos atributos." }, ids.ana))
}

async function rollFive(campaignId: string) {
    diceQueue.push(...FIVE_ROLLS.map((dice) => [...dice]))
    for (let index = 0; index < 5; index++) await scoresService.rollAbilityScore(campaignId, "character", ids.ana)
}

/** Card enviado mais recente (o que entra na ficha). */
const submittedCard = (doc: { messages: { abilityScores?: { status: string; bonus?: unknown } | null }[] }) => [...doc.messages].reverse().find((message) => message.abilityScores?.status === "submitted")?.abilityScores ?? null
const interviewDoc = async () => (await MaddoxInterviewModel.findOne({ kind: "character" }).lean())!
const errorOf = async (promise: Promise<unknown>) => promise.then(() => null, (error: { status?: number; code?: string; message: string }) => error)

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_ability_scores_test" })
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await mongoose.connection.db!.dropDatabase()
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxInterviewModel.init(), MaddoxInterviewScriptModel.init()])
    ids.owner = await seedUser("mestre", "Marina Dona")
    ids.ana = await seedUser("ana", "Ana Jogadora")
    availability.available = true
    availability.reason = null
    state.settings = { ...DEFAULT_MADDOX_SETTINGS, enabled: true, main: { ...DEFAULT_MADDOX_SETTINGS.main, provider: "gemini", model: "gemini-pro" } }
    scripted.length = 0
    calls.length = 0
    toolResults.length = 0
    diceQueue.length = 0
    for (const fn of [recordAudit, generateAiText, createBlankSheet, rollGeneralDice]) fn.mockClear()
    generateAiText.mockReset()
    createBlankSheet.mockReset()
    createBlankSheet.mockImplementation(async (userId: string, username: string, name: string) => (await CharacterSheet.create({ userId, username, name, slug: `${username}/${name.toLowerCase()}` })).toObject())
})

describe("atributos pelo card na entrevista de personagem", () => {
    it("fluxo completo: card pedido pelo Maddox, cinco rolagens no motor, envio, bônus do antecedente e a ficha com base + bônus", async () => {
        await BackgroundModel.collection.insertOne({ name: "Criminoso", originalName: "Criminal", suggestedAttributes: ["Destreza", "Constituição", "Inteligência"], status: "active" })
        const campaignId = await characterInterview()
        // A entrevista recebe as ferramentas e a seção de atributos (nunca pedir números digitados).
        expect(calls.at(-1)!.via).toBe("tools")
        expect(calls.at(-1)!.toolNames).toEqual(["request_ability_scores", "get_ability_scores", "apply_ability_bonus", "update_character_build", "get_character_build", "request_hit_points", "search_catalog", "get_catalog_entity"])
        expect(calls.at(-1)!.instructions).toContain("## Atributos do personagem")
        expect(calls.at(-1)!.instructions).toContain("Nunca peça ao jogador que digite números")

        const lines = await openCard(campaignId)
        expect(toolResults[0]).toMatchObject({ name: "request_ability_scores", output: { opened: true, reopened: false } })
        const done = lines.find((line) => line.type === "done")
        expect(done && done.type === "done" && done.message.abilityScores).toMatchObject({ status: "pending", reason: "Hora dos atributos da Lyra", base: null })

        await rollFive(campaignId)
        expect(rollGeneralDice).toHaveBeenCalledTimes(5)
        expect(rollGeneralDice).toHaveBeenCalledWith(expect.objectContaining({ terms: [{ dice: "d6", quantity: 4 }], modifier: 0, mode: "normal" }), { scope: "user", userId: ids.ana })
        const rolled = interviews.interviewDto(await interviewDoc()).abilityRolls!
        expect(rolled.rolls.map((roll) => roll.score)).toEqual([17, 14, 12, 9, 12])
        expect(rolled).toMatchObject({ sixth: 8, invalid: false })
        expect(await errorOf(scoresService.rollAbilityScore(campaignId, "character", ids.ana))).toMatchObject({ status: 409, code: "ROLLS_DONE" })

        // Valores que não foram rolados: 400 sem gravar nada.
        const wrong = { strength: 18, dexterity: 17, constitution: 12, intelligence: 14, wisdom: 9, charisma: 12 }
        expect(await errorOf(scoresService.submitAbilityScores(campaignId, "character", { method: "roll", scores: wrong }, ids.ana))).toMatchObject({ status: 400, code: "INVALID_SCORES" })

        const base = { strength: 8, dexterity: 17, constitution: 12, intelligence: 14, wisdom: 9, charisma: 12 }
        scripted.push([say("Ótimos números! E a origem da Lyra?")])
        const sent = await run(await scoresService.submitAbilityScores(campaignId, "character", { method: "roll", scores: base }, ids.ana))
        expect(sent.some((line) => line.type === "user")).toBe(false)
        // A fala interna vai ao modelo, nunca à tela.
        const lastToModel = calls.at(-1)!.messages.at(-1)!
        expect(lastToModel).toMatchObject({ role: "user" })
        expect(String(lastToModel.content)).toContain("[Sistema] O jogador enviou os atributos pelo card (Rolagem): Força 8, Destreza 17")
        const afterSubmit = await interviewDoc()
        expect(afterSubmit.messages.filter((message) => message.internal)).toHaveLength(1)
        const dto = interviews.interviewDto(afterSubmit)
        expect(dto.messages.some((message) => message.content.includes("[Sistema]"))).toBe(false)
        expect(dto.messages.find((message) => message.abilityScores)!.abilityScores).toMatchObject({ status: "submitted", method: "roll", base, final: base })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ method: "roll", base }) }))
        expect(calls.at(-1)!.instructions).toContain("Atributos enviados (Rolagem): Força 8, Destreza 17")

        // Bônus fora dos sugeridos é recusado; depois aplicado certo, e o Maddox consulta antes da síntese.
        scripted.push([
            call("apply_ability_bonus", { antecedente: "criminoso", bonus: { "Força": 2, Destreza: 1 } }),
            call("apply_ability_bonus", { antecedente: "criminoso", bonus: { Destreza: 2, "Inteligência": 1 } }),
            call("get_ability_scores"),
            say(PROPOSAL),
        ])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Sou uma criminosa." }, ids.ana))
        expect(toolResults.at(-3)!.error).toMatch(/só dá bônus em Destreza, Constituição, Inteligência/)
        expect(toolResults.at(-2)!.output).toMatchObject({ applied: true, antecedente: "Criminoso", catalogo: true })
        expect(toolResults.at(-1)!.output).toMatchObject({ status: "submitted", method: "Rolagem", final: { Destreza: 19, "Inteligência": 15, "Força": 8 }, rolagens: [17, 14, 12, 9, 12, 8] })

        // A consolidação devolve atributos diferentes: valem os do card.
        generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ name: null, profile: { identidade: "Ladra" }, sheet: { race: "Elfo", class: "Ladino", origin: "Criminoso", attributes: { strength: 15, dexterity: 15, constitution: 15, intelligence: 15, wisdom: 15, charisma: 15 } } }) })
        await setInterviewBuild({}, fighterBuild(await seedSheetCatalog()))
        await completeInterview(campaignId, "character", ids.ana)
        expect(generateAiText.mock.calls.at(-1)![0].instructions).toContain("Os atributos vêm do card de atributos")
        const character = await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean()
        const sheet = await CharacterSheet.findById(character!.sheetId).lean()
        expect(sheet).toMatchObject({ strength: 8, dexterity: 19, constitution: 12, intelligence: 15, wisdom: 9, charisma: 12 })
        const finished = await interviewDoc()
        expect(finished.result).toMatchObject({ abilityScores: { method: "roll", base, bonus: { background: "Criminoso", parts: { dexterity: 2, intelligence: 1 } } } })
    })

    it("conjunto padrão e compra de pontos são conferidos no servidor", async () => {
        const campaignId = await characterInterview("equilibrado")
        await openCard(campaignId)
        expect(await errorOf(scoresService.submitAbilityScores(campaignId, "character", { method: "standard", scores: { strength: 15, dexterity: 15, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 } }, ids.ana))).toMatchObject({ status: 400 })
        expect(await errorOf(scoresService.submitAbilityScores(campaignId, "character", { method: "point-buy", scores: { strength: 15, dexterity: 15, constitution: 15, intelligence: 9, wisdom: 8, charisma: 8 } }, ids.ana))).toMatchObject({ status: 400 })
        await run(await scoresService.submitAbilityScores(campaignId, "character", { method: "point-buy", scores: { strength: 15, dexterity: 15, constitution: 15, intelligence: 8, wisdom: 8, charisma: 8 } }, ids.ana))
        expect(interviews.interviewDto(await interviewDoc()).messages.find((message) => message.abilityScores)!.abilityScores).toMatchObject({ status: "submitted", method: "point-buy" })
        // Já enviado: sem card pendente, novo envio é recusado.
        expect(await errorOf(scoresService.submitAbilityScores(campaignId, "character", { method: "point-buy", scores: { strength: 15, dexterity: 15, constitution: 15, intelligence: 8, wisdom: 8, charisma: 8 } }, ids.ana))).toMatchObject({ status: 409, code: "NO_PENDING_SCORES" })
    })

    it("sem card aberto não há rolagem nem envio; sexta inválida só continua com Reiniciar", async () => {
        const campaignId = await characterInterview()
        expect(await errorOf(scoresService.rollAbilityScore(campaignId, "character", ids.ana))).toMatchObject({ status: 409, code: "NO_PENDING_SCORES" })
        await openCard(campaignId)
        expect(await errorOf(scoresService.resetAbilityRolls(campaignId, "character", ids.ana))).toMatchObject({ status: 409, code: "ROLLS_NOT_RESETTABLE" })
        diceQueue.push(...Array.from({ length: 5 }, () => [6, 6, 6, 6]))
        for (let index = 0; index < 5; index++) await scoresService.rollAbilityScore(campaignId, "character", ids.ana)
        expect(interviews.interviewDto(await interviewDoc()).abilityRolls).toMatchObject({ sixth: null, invalid: true })
        expect(await errorOf(scoresService.rollAbilityScore(campaignId, "character", ids.ana))).toMatchObject({ status: 409, code: "ROLLS_INVALID" })
        const reset = await scoresService.resetAbilityRolls(campaignId, "character", ids.ana)
        expect(reset.abilityRolls).toBeNull()
    })

    it("duas rolagens ao mesmo tempo gravam uma só", async () => {
        const campaignId = await characterInterview()
        await openCard(campaignId)
        diceQueue.push([6, 6, 6, 1], [5, 5, 5, 1])
        const results = await Promise.allSettled([scoresService.rollAbilityScore(campaignId, "character", ids.ana), scoresService.rollAbilityScore(campaignId, "character", ids.ana)])
        expect(results.filter((result) => result.status === "fulfilled").length).toBeGreaterThanOrEqual(1)
        const stored = (await interviewDoc()).abilityRolls!.rolls
        expect(stored.length).toBe(results.filter((result) => result.status === "fulfilled").length)
        for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 409, code: "ROLL_CONFLICT" })
    })

    it("envio com o Maddox respondendo: 409; entrevistador indisponível: 409 e o card segue pendente, sem fala interna", async () => {
        const campaignId = await characterInterview("equilibrado")
        await openCard(campaignId)
        const scores = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 }
        const doc = await interviewDoc()
        const { token } = await interviews.acquireInterviewLock(doc._id)
        expect(await errorOf(scoresService.submitAbilityScores(campaignId, "character", { method: "standard", scores }, ids.ana))).toMatchObject({ status: 409, code: "INTERVIEW_BUSY" })
        await interviews.releaseInterviewLock(doc._id, token)

        availability.available = false
        availability.reason = "Agente Maddox desligado"
        expect(await errorOf(scoresService.submitAbilityScores(campaignId, "character", { method: "standard", scores }, ids.ana))).toMatchObject({ status: 409, code: "MADDOX_UNAVAILABLE" })
        const after = await interviewDoc()
        expect(after.generating).toBeNull()
        expect(after.messages.some((message) => message.internal)).toBe(false)
        expect(after.messages.find((message) => message.abilityScores)!.abilityScores!.status).toBe("pending")
    })

    it("falha do provedor depois do envio: o card fica enviado e 'Tentar de novo' gera a fala seguinte", async () => {
        const campaignId = await characterInterview("equilibrado")
        await openCard(campaignId)
        scripted.push([{ type: "error", message: "provedor fora do ar" }])
        const lines = await run(await scoresService.submitAbilityScores(campaignId, "character", { method: "standard", scores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 } }, ids.ana))
        expect(lines.at(-1)).toMatchObject({ type: "error", message: "provedor fora do ar" })
        scripted.push([say("Agora sim: belos atributos.")])
        await run(await interviews.retryInterviewTurn(campaignId, "character", ids.ana))
        expect(String(calls.at(-1)!.messages.at(-1)!.content)).toContain("[Sistema] O jogador enviou os atributos")
        const dto = interviews.interviewDto(await interviewDoc())
        expect(dto.messages.at(-1)!.content).toBe("Agora sim: belos atributos.")
        expect(dto.messages.find((message) => message.abilityScores)!.abilityScores!.status).toBe("submitted")
    })

    it("geração que falha descarta o card pedido; pedir duas vezes no mesmo turno abre um card só", async () => {
        const campaignId = await characterInterview()
        scripted.push([call("request_ability_scores"), { type: "error", message: "caiu" }])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Atributos?" }, ids.ana))
        expect((await interviewDoc()).messages.some((message) => message.abilityScores)).toBe(false)
        await run(await interviews.retryInterviewTurn(campaignId, "character", ids.ana))
        scripted.length = 0
        await openCard(campaignId, [call("request_ability_scores")])
        expect(toolResults.at(-1)).toMatchObject({ output: { alreadyOpen: true } })
        expect((await interviewDoc()).messages.filter((message) => message.abilityScores)).toHaveLength(1)
    })

    it("o Maddox reabre o card com os valores atuais (o anterior fica 'reaberto'); novaRolagem apaga as rolagens", async () => {
        const campaignId = await characterInterview()
        await openCard(campaignId)
        await rollFive(campaignId)
        const base = { strength: 8, dexterity: 17, constitution: 12, intelligence: 14, wisdom: 9, charisma: 12 }
        await run(await scoresService.submitAbilityScores(campaignId, "character", { method: "roll", scores: base }, ids.ana))
        // Reabre mantendo as rolagens.
        scripted.push([call("request_ability_scores", { motivo: "Ajuste a distribuição" }), say("Reabri o card.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Quero trocar Força e Carisma." }, ids.ana))
        expect(toolResults.at(-1)).toMatchObject({ output: { opened: true, reopened: true, rollsReset: false } })
        let cards = interviews.interviewDto(await interviewDoc()).messages.filter((message) => message.abilityScores).map((message) => message.abilityScores!)
        expect(cards.map((card) => card.status)).toEqual(["superseded", "pending"])
        expect(cards[1]).toMatchObject({ prefill: { method: "roll", base } })
        expect((await interviewDoc()).abilityRolls!.rolls).toHaveLength(5)
        // Pedido de nova rolagem (card já aberto): as rolagens são apagadas quando a fala é gravada.
        scripted.push([call("request_ability_scores", { novaRolagem: true }), say("Role tudo de novo.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Posso rolar de novo?" }, ids.ana))
        expect(toolResults.at(-1)).toMatchObject({ output: { alreadyOpen: true, rollsReset: true } })
        expect((await interviewDoc()).abilityRolls).toBeNull()
        cards = interviews.interviewDto(await interviewDoc()).messages.filter((message) => message.abilityScores).map((message) => message.abilityScores!)
        expect(cards.map((card) => card.status)).toEqual(["superseded", "pending"])
    })

    it("card reaberto e não reenviado: a conclusão usa o último envio com o bônus, não os atributos da IA", async () => {
        await BackgroundModel.collection.insertOne({ name: "Criminoso", originalName: "Criminal", suggestedAttributes: ["Destreza", "Constituição", "Inteligência"], status: "active" })
        const campaignId = await characterInterview()
        await openCard(campaignId)
        const base = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 }
        await run(await scoresService.submitAbilityScores(campaignId, "character", { method: "standard", scores: base }, ids.ana))
        scripted.push([call("apply_ability_bonus", { antecedente: "Criminoso", bonus: { Destreza: 2, "Inteligência": 1 } }), say("Bônus aplicado.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Sou criminosa." }, ids.ana))
        scripted.push([call("request_ability_scores", { motivo: "Ajuste se quiser" }), say("Reabri o card.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Talvez trocar Força e Carisma." }, ids.ana))
        scripted.push([say(PROPOSAL)])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Deixa como estava. Pode concluir." }, ids.ana))
        generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ name: null, profile: { identidade: "Ladra" }, sheet: { race: "Elfo", class: "Ladino", attributes: { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 15 } } }) })
        await setInterviewBuild({}, fighterBuild(await seedSheetCatalog()))
        await completeInterview(campaignId, "character", ids.ana)
        expect(generateAiText.mock.calls.at(-1)![0].instructions).toContain("Os atributos vêm do card de atributos")
        const character = await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean()
        expect(await CharacterSheet.findById(character!.sheetId).lean()).toMatchObject({ strength: 15, dexterity: 16, constitution: 13, intelligence: 13, wisdom: 10, charisma: 8 })
        expect((await interviewDoc()).result).toMatchObject({ abilityScores: { method: "standard", base, bonus: { background: "Criminoso" } } })
    })

    it("card aberto e nunca enviado: concluir responde 409 sem consolidar; depois do envio conclui", async () => {
        const campaignId = await characterInterview("equilibrado")
        scripted.push([call("request_ability_scores"), say(PROPOSAL)])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Pode fechar." }, ids.ana))
        expect((await interviewDoc()).status).toBe("proposed")
        const consolidations = generateAiText.mock.calls.length
        expect(await errorOf(completeInterview(campaignId, "character", ids.ana))).toMatchObject({ status: 409, code: "ABILITY_SCORES_PENDING", message: "Envie os atributos pelo card antes de concluir a entrevista." })
        expect(generateAiText.mock.calls.length).toBe(consolidations)
        expect((await interviewDoc()).generating).toBeNull()
        scripted.push([say(PROPOSAL)])
        await run(await scoresService.submitAbilityScores(campaignId, "character", { method: "point-buy", scores: { strength: 15, dexterity: 15, constitution: 15, intelligence: 8, wisdom: 8, charisma: 8 } }, ids.ana))
        generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ name: null, profile: { identidade: "Guerreira" }, sheet: { race: "Humano", class: "Guerreiro", attributes: null } }) })
        await setInterviewBuild({}, fighterBuild(await seedSheetCatalog()))
        await completeInterview(campaignId, "character", ids.ana)
        const character = await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean()
        expect(await CharacterSheet.findById(character!.sheetId).lean()).toMatchObject({ strength: 15, dexterity: 15, constitution: 15, intelligence: 8 })
    })

    describe("origem do bônus e o catálogo", () => {
        const origins = [
            { name: "Soldado", originalName: "Soldier", suggestedAttributes: ["Força", "Destreza", "Constituição"], status: "active", description: "<p>Treino militar.</p>", source: "LDJ 2024" },
            { name: "Acólito", originalName: "Acolyte", suggestedAttributes: ["Inteligência", "Sabedoria", "Carisma"], status: "active", description: "Templo.", source: "LDJ 2024" },
            { name: "Herói do Povo", originalName: "Folk Hero", suggestedAttributes: ["Força", "Constituição", "Sabedoria"], status: "inactive", description: "Antiga.", source: "LDJ 2014" },
        ]
        const base = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 }

        async function submitted(rigor: "equilibrado" | "rigoroso" | "fiel-dnd") {
            await BackgroundModel.collection.insertMany(origins.map((origin) => ({ ...origin })))
            const campaignId = await characterInterview(rigor)
            await openCard(campaignId)
            scripted.push([say("Anotado.")])
            await run(await scoresService.submitAbilityScores(campaignId, "character", { method: "standard", scores: base }, ids.ana))
            toolResults.length = 0
            return campaignId
        }

        it("Fiel: o Maddox lista as origens pelo catálogo e aplica o bônus de uma delas, gravada com o nome oficial", async () => {
            const campaignId = await submitted("fiel-dnd")
            expect(calls.at(-1)!.instructions).toContain("## Catálogo do DnDicas")
            expect(calls.at(-1)!.instructions).toContain("precisam ser do catálogo")
            scripted.push([call("search_catalog", { tipos: ["Origem"] }), call("apply_ability_bonus", { antecedente: "soldier", bonus: { "Força": 2, "Constituição": 1 } }), say("Bônus aplicado.")])
            await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Quais origens existem? Quero soldado." }, ids.ana))
            const listed = toolResults[0]!.output as { itens: { nome: string }[] }
            expect(listed.itens.map((item) => item.nome).sort()).toEqual(["Acólito", "Soldado"])
            expect(toolResults[1]).toMatchObject({ name: "apply_ability_bonus", output: { applied: true, antecedente: "Soldado", catalogo: true } })
            expect(submittedCard(await interviewDoc())!.bonus).toMatchObject({ background: "Soldado", parts: { strength: 2, constitution: 1 } })
        })

        it("Fiel e Rigoroso: origem fora do catálogo (ou inativa) é recusada com as origens disponíveis e nada é gravado", async () => {
            for (const rigor of ["fiel-dnd", "rigoroso"] as const) {
                await BackgroundModel.collection.deleteMany({})
                const campaignId = await submitted(rigor)
                scripted.push([call("apply_ability_bonus", { antecedente: "Herói do Povo", bonus: { "Força": 2, "Constituição": 1 } }), say("Vou conferir.")])
                await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Herói do Povo." }, ids.ana))
                expect(toolResults[0]!.error).toBe("O antecedente “Herói do Povo” não está no catálogo do DnDicas. Origens disponíveis: Acólito, Soldado. Escolha uma delas com o jogador (consulte search_catalog) e aplique o bônus de novo.")
                expect(submittedCard(await interviewDoc())!.bonus ?? null).toBeNull()
                await MaddoxCampaignModel.deleteMany({})
                await MaddoxInterviewModel.deleteMany({})
                await MaddoxCampaignMemberModel.deleteMany({})
                await MaddoxCharacterModel.deleteMany({})
            }
        })

        it("Equilibrado: origem própria aceita os pontos livres e fica marcada como fora do catálogo", async () => {
            const campaignId = await submitted("equilibrado")
            expect(calls.at(-1)!.instructions).toContain("prefira o catálogo")
            scripted.push([call("apply_ability_bonus", { antecedente: "Órfão da Névoa", bonus: { Destreza: 2, Carisma: 1 } }), say("Origem própria anotada.")])
            await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Órfão da Névoa." }, ids.ana))
            expect(toolResults[0]).toMatchObject({ output: { applied: true, antecedente: "Órfão da Névoa", catalogo: false, nota: "Origem própria (fora do catálogo): os pontos são livres." } })
            expect(submittedCard(await interviewDoc())!.bonus).toMatchObject({ background: "Órfão da Névoa", parts: { dexterity: 2, charisma: 1 } })
        })

        it("nome sem acento ou o original encontram a origem do catálogo", async () => {
            const campaignId = await submitted("fiel-dnd")
            scripted.push([call("apply_ability_bonus", { antecedente: "acolito", bonus: { "Sabedoria": 2, Carisma: 1 } }), say("Feito.")])
            await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Acólito." }, ids.ana))
            expect(toolResults[0]).toMatchObject({ output: { antecedente: "Acólito", catalogo: true } })
            toolResults.length = 0
            scripted.push([call("apply_ability_bonus", { antecedente: "  ACOLYTE ", bonus: { "Inteligência": 1, "Sabedoria": 1, Carisma: 1 } }), say("Feito.")])
            await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "De novo." }, ids.ana))
            expect(toolResults[0]).toMatchObject({ output: { antecedente: "Acólito", catalogo: true } })
        })

        it("Fiel: bônus de origem fora do catálogo já gravado bloqueia a conclusão (409) até ser reaplicado com uma do catálogo", async () => {
            const campaignId = await submitted("fiel-dnd")
            const doc = await interviewDoc()
            const index = doc.messages.findIndex((message) => message.abilityScores?.status === "submitted")
            await MaddoxInterviewModel.updateOne({ _id: doc._id }, { $set: { [`messages.${index}.abilityScores.bonus`]: { background: "Herói do Povo", parts: { strength: 2, constitution: 1 } } } })
            scripted.push([say(PROPOSAL)])
            await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Pode fechar." }, ids.ana))
            const consolidations = generateAiText.mock.calls.length
            expect(await errorOf(completeInterview(campaignId, "character", ids.ana))).toMatchObject({ status: 409, code: "BACKGROUND_NOT_IN_CATALOG", message: "O antecedente do bônus (Herói do Povo) não está no catálogo. Peça ao Maddox para escolher uma origem do catálogo e reaplicar o bônus." })
            expect(generateAiText.mock.calls.length).toBe(consolidations)
            expect((await interviewDoc()).generating).toBeNull()

            scripted.push([call("apply_ability_bonus", { antecedente: "Soldado", bonus: { "Força": 2, "Constituição": 1 } }), say(PROPOSAL)])
            await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Troca para Soldado." }, ids.ana))
            generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ name: null, profile: { identidade: "Soldada" }, sheet: { race: "Humano", class: "Guerreiro", attributes: null } }) })
            await setInterviewBuild({}, fighterBuild(await seedSheetCatalog()))
            await completeInterview(campaignId, "character", ids.ana)
            const character = await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean()
            expect(await CharacterSheet.findById(character!.sheetId).lean()).toMatchObject({ strength: 17, constitution: 14 })
        })
    })

    it("graus sem ficha não usam card: sem ferramentas, sem seção, rolagem 409; entrevista de cenário responde 404", async () => {
        const campaignId = await characterInterview("narrativo")
        expect(calls.at(-1)!.via).toBe("stream")
        expect(calls.at(-1)!.instructions).not.toContain("## Atributos do personagem")
        expect(await errorOf(scoresService.rollAbilityScore(campaignId, "character", ids.ana))).toMatchObject({ status: 409, code: "ABILITIES_DISABLED" })
        expect(await errorOf(scoresService.rollAbilityScore(campaignId, "scenario", ids.owner))).toMatchObject({ status: 404 })
    })
})
