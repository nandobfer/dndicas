import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { ModelMessage } from "ai"
import type { AiStreamRequest } from "@/lib/ai/stream"
import type { MaddoxSettings } from "@/features/maddox/schemas"
import type { MaddoxInterviewStreamLine } from "@/features/maddox/interview-types"
import { fighterBuild, seedSheetCatalog, type SheetCatalogIds } from "./helpers/sheet-catalog"

/**
 * Modo fiel ao D&D (Maddox 8), critério de aceite: uma campanha em cada extremo do slider. No Fiel ao D&D o cenário só
 * grava povos e classes do catálogo e a criação de personagem só aceita os do mundo; no Narrativo nada disso se aplica.
 * Catálogo real sobre o MongoDB em memória; o entrevistador é roteirizado (`streamText`/`streamAi` mockados).
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
    return { rollId: `roll-${Math.random()}`, terms: [{ dice: request.terms[0]!.dice, quantity: request.terms[0]!.quantity, results }], mode: "normal", diceTotal: 0, modifier: 0, total: 0, createdAt: new Date().toISOString() }
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
vi.mock("@/features/character-sheets/api/character-sheets-service", () => ({ createBlankSheet }))
// Catálogo real sobre o MongoDB em memória (menções e as ferramentas search_catalog/get_catalog_entity).
vi.mock("@/features/dice-roller/server/dice-roll-service", () => ({ rollGeneralDice }))
vi.mock("@/features/dice-roller/server/dice-target", () => ({ resolveGeneralDiceTarget: (input: { userId: string }) => ({ scope: "user", userId: input.userId }) }))

const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
const { MaddoxCampaignModel, MaddoxCampaignMemberModel, MaddoxCharacterModel, MaddoxInterviewModel, MaddoxInterviewScriptModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const campaigns = await import("@/features/maddox/server/campaigns")
const interviews = await import("@/features/maddox/server/interviews")
const { completeInterview } = await import("@/features/maddox/server/interview-consolidation")

let mongo: MongoMemoryServer
let cat: SheetCatalogIds
const ids = { owner: "", ana: "", dwarf: "" }

const say = (text: string): Step => ({ type: "delta", text })
const call = (name: string, input: unknown = {}): Step => ({ type: "call", name, input })
const PROPOSAL = "Síntese pronta. Confirma?\n[[MADDOX_PROPOSTA_DE_CONCLUSAO]]"
const lastTool = (name: string) => [...toolResults].reverse().find((result) => result.name === name)!
const errorOf = async (promise: Promise<unknown>) => promise.then(() => null, (error: { status?: number; code?: string; message: string }) => error)
const scenarioDoc = async () => (await MaddoxInterviewModel.findOne({ kind: "scenario" }).lean())!
const characterDoc = async () => (await MaddoxInterviewModel.findOne({ kind: "character" }).lean())!

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

const send = async (campaignId: string, kind: "scenario" | "character", userId: string, content: string, steps: Step[]) => {
    scripted.push(steps)
    return run(await interviews.sendInterviewMessage(campaignId, kind, { content }, userId))
}

/** Campanha com a Ana convidada e a entrevista de cenário aberta. */
async function scenarioInterview(rigor: "narrativo" | "fiel-dnd") {
    const campaign = await campaigns.createCampaign({ name: "Brumas", rigor }, ids.owner)
    const { token } = await campaigns.getInviteLink(campaign.id, ids.owner)
    await campaigns.joinByInvite(token, ids.ana)
    const { turn } = await interviews.startInterview(campaign.id, "scenario", ids.owner)
    await run(turn!)
    return campaign.id
}

async function completeScenario(campaignId: string, universo: string) {
    generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ setting: { universo, canone: "", contexto: "", regras: "", tom: "" }, openingSituation: "Numa taverna.", campaignName: null, startingLevel: 1, startingStage: "recém-iniciados" }) })
    return completeInterview(campaignId, "scenario", ids.owner)
}

async function startCharacter(campaignId: string) {
    await campaigns.upsertCharacterDraft(campaignId, { name: "Lyra", portraitUrl: null }, ids.ana)
    const { turn } = await interviews.startInterview(campaignId, "character", ids.ana)
    await run(turn!)
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_faithful_mode_test" })
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
    generateAiText.mockReset()
    createBlankSheet.mockReset()
    createBlankSheet.mockImplementation(async (userId: string, username: string, name: string) => (await CharacterSheet.create({ userId, username, name, slug: `${username}/${name.toLowerCase()}` })).toObject())
    cat = await seedSheetCatalog()
    const dwarf = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("races").insertOne({ _id: dwarf, name: "Anão", originalName: "Dwarf", description: "<p>Robustos.</p>", size: "Médio", speed: "9 metros", status: "active", traits: [] })
    ids.dwarf = String(dwarf)
})

describe("Maddox 8 — Fiel ao D&D: cenário e personagem só com o que está cadastrado", () => {
    it("cenário grava só povos e classes do catálogo; o personagem só aceita os do mundo", async () => {
        const campaignId = await scenarioInterview("fiel-dnd")
        // A entrevista de cenário do Fiel recebe as ferramentas do mundo e do catálogo (nenhuma da ficha).
        const opening = calls.at(-1)!
        expect(opening.via).toBe("tools")
        expect(opening.toolNames).toEqual(expect.arrayContaining(["update_world_options", "get_world_options", "search_catalog", "get_catalog_entity"]))
        expect(opening.toolNames).not.toContain("request_ability_scores")
        expect(opening.instructions).toContain("## Universo, povos e classes")
        expect(opening.instructions).toContain("Recuse com gentileza universos de fora do D&D")
        expect(opening.instructions).toContain("## Povos e classes do mundo")
        expect(opening.instructions).toContain("### Mundo: situação atual")

        // Povo inventado: a lista inteira é recusada, nada é gravado e o retorno lista as opções do catálogo.
        await send(campaignId, "scenario", ids.owner, "Humanos e kitsunes guerreiros.", [call("update_world_options", { racas: ["Humano", "Kitsune"], classes: ["Guerreiro"] }), say("Kitsune não existe no catálogo.")])
        expect(lastTool("update_world_options").error).toBe("Nada foi gravado. Povos (raças) fora do catálogo do DnDicas: “Kitsune”. Opções: Anão, Humano.")
        expect((await scenarioDoc()).world ?? null).toBeNull()

        await send(campaignId, "scenario", ids.owner, "Então humanos e anões, só guerreiros.", [call("update_world_options", { racas: ["humano", "Dwarf"], classes: ["guerreiro"] }), say("Gravado.")])
        expect(lastTool("update_world_options").output).toMatchObject({ saved: true, povos: ["Humano", "Anão"], classes: ["Guerreiro"] })
        expect(calls.at(-1)!.instructions).toContain("Povos (raças) deste mundo: todos os do catálogo do DnDicas")
        await send(campaignId, "scenario", ids.owner, "Pode fechar.", [call("get_world_options"), say(PROPOSAL)])
        expect(lastTool("get_world_options").output).toMatchObject({ povos: ["Humano", "Anão"], classes: ["Guerreiro"] })
        expect(calls.at(-1)!.instructions).toContain("Povos (raças) deste mundo: Humano, Anão.")

        // Um povo inativado depois de gravado: a conclusão recusa sem consolidar.
        await mongoose.connection.collection("races").updateOne({ _id: new mongoose.Types.ObjectId(ids.dwarf) }, { $set: { status: "inactive" } })
        expect(await errorOf(completeScenario(campaignId, "Reinos Esquecidos"))).toMatchObject({ status: 409, code: "WORLD_OPTIONS_INVALID", message: expect.stringContaining("Anão") })
        expect(generateAiText).not.toHaveBeenCalled()
        await mongoose.connection.collection("races").updateOne({ _id: new mongoose.Types.ObjectId(ids.dwarf) }, { $set: { status: "active" } })

        const detail = await completeScenario(campaignId, "Reinos Esquecidos")
        expect(detail.worldCatalog).toEqual({ races: [{ id: String(cat.race), name: "Humano" }, { id: ids.dwarf, name: "Anão" }], classes: [{ id: String(cat.fighter), name: "Guerreiro" }] })
        expect((await MaddoxCampaignModel.findById(campaignId).lean())!.worldCatalog).toEqual(detail.worldCatalog)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ interview: "cenário concluído", povos: ["Humano", "Anão"], classes: ["Guerreiro"] }) }))

        // Personagem: o prompt só oferece os povos e as classes do mundo.
        await startCharacter(campaignId)
        expect(calls.at(-1)!.instructions).toContain("Povos (raças) deste mundo: Humano, Anão.")
        expect(calls.at(-1)!.instructions).toContain("Classes deste mundo: Guerreiro.")

        // Classe do catálogo que não existe no mundo e raça fora do catálogo: recusadas, nada gravado.
        await send(campaignId, "character", ids.ana, "Uma elfa maga.", [call("update_character_build", { raca: "Elfo", classe: "Mago" }), say("Hm.")])
        const refused = lastTool("update_character_build").error!
        expect(refused).toContain("Nada foi gravado.")
        expect(refused).toContain("Raça “Elfo” não está no catálogo do DnDicas. Opções: Anão, Humano.")
        expect(refused).toContain("A classe “Mago” não existe no mundo desta campanha. Opções deste mundo: Guerreiro.")
        expect((await characterDoc()).build ?? null).toBeNull()

        await send(campaignId, "character", ids.ana, "Anã guerreira.", [call("update_character_build", { raca: "Anão", classe: "Guerreiro" }), say("Gravado.")])
        expect(lastTool("update_character_build").output).toMatchObject({ gravado: true, raca: "Anão", classe: "Guerreiro", mundo: { povos: ["Humano", "Anão"], classes: ["Guerreiro"] } })

        // Ficha fora do mundo (ex.: gravada antes de o mundo mudar): a conclusão recusa sem consolidar.
        await MaddoxInterviewModel.updateOne({ kind: "character" }, { $set: { status: "proposed", build: fighterBuild(cat, { class: { id: String(cat.wizard), name: "Mago" } }) } })
        expect(await errorOf(completeInterview(campaignId, "character", ids.ana))).toMatchObject({ status: 409, code: "CHARACTER_NOT_IN_WORLD", message: expect.stringContaining("a classe Mago não existe neste mundo (classes: Guerreiro)") })
        expect((await characterDoc()).generating).toBeNull()
    })

    it("lista vazia: todo o catálogo vale para o personagem", async () => {
        const campaignId = await scenarioInterview("fiel-dnd")
        await send(campaignId, "scenario", ids.owner, "Pode fechar.", [say(PROPOSAL)])
        expect((await completeScenario(campaignId, "Eberron")).worldCatalog).toEqual({ races: [], classes: [] })
        await startCharacter(campaignId)
        expect(calls.at(-1)!.instructions).toContain("Classes deste mundo: todas as do catálogo do DnDicas.")
        await send(campaignId, "character", ids.ana, "Humana maga.", [call("update_character_build", { raca: "Humano", classe: "Mago" }), say("Gravado.")])
        expect(lastTool("update_character_build").output).toMatchObject({ gravado: true, raca: "Humano", classe: "Mago" })
        // Mesmo sem lista, a raça precisa ser do catálogo.
        await send(campaignId, "character", ids.ana, "Kitsune.", [call("update_character_build", { raca: "Kitsune" }), say("Hm.")])
        expect(lastTool("update_character_build").error).toContain("Raça “Kitsune” não está no catálogo do DnDicas.")
    })
})

describe("Maddox 8 — Narrativo: as restrições não se aplicam", () => {
    it("cenário de anime e personagem com povo e classe inventados concluem sem recusa nem ferramentas", async () => {
        const campaignId = await scenarioInterview("narrativo")
        const opening = calls.at(-1)!
        expect(opening.via).toBe("stream")
        expect(opening.instructions).toContain("qualquer universo, setting, estilo, raça ou classe vale, conforme o roteiro")
        expect(opening.instructions).not.toContain("## Povos e classes do mundo")
        expect(opening.instructions).not.toContain("update_world_options")

        await send(campaignId, "scenario", ids.owner, "Um mundo como o de Naruto.", [say(PROPOSAL)])
        const detail = await completeScenario(campaignId, "Mundo ninja inspirado em Naruto")
        expect(detail.scenarioStatus).toBe("done")
        expect(detail.worldCatalog).toEqual({ races: [], classes: [] })

        await startCharacter(campaignId)
        const character = calls.at(-1)!
        expect(character.via).toBe("stream")
        expect(character.instructions).not.toContain("## Catálogo do DnDicas")
        expect(character.instructions).not.toContain("deste mundo")

        await send(campaignId, "character", ids.ana, "Uma kitsune ninja.", [say(PROPOSAL)])
        generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ name: "Lyra", profile: { identidade: "Kitsune ninja da Vila da Folha", capacidades: "Jutsus de raposa" }, sheet: null }) })
        const after = await completeInterview(campaignId, "character", ids.ana)
        const me = after.members.find((member) => member.userId === ids.ana)!
        expect(me.character).toMatchObject({ interviewStatus: "done" })
        expect(createBlankSheet).not.toHaveBeenCalled()
    })
})
