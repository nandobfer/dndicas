import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { ModelMessage } from "ai"
import type { AiStreamRequest } from "@/lib/ai/stream"
import type { MaddoxSettings } from "@/features/maddox/schemas"
import type { MaddoxInterviewStreamLine } from "@/features/maddox/interview-types"
import { seedSheetCatalog, type SheetCatalogIds } from "./helpers/sheet-catalog"
import { nameMaddoxCharacter } from "../../helpers/maddox-character"

/**
 * Ficha completa pela entrevista de personagem (Maddox 5), de ponta a ponta: o entrevistador (`streamText` roteirizado)
 * grava as escolhas com `update_character_build`, abre o card de PV e a conclusão monta a ficha no servidor a partir do
 * catálogo real (MongoDB em memória): menções, dado de vida, PV, proficiências, traços, talentos, itens, ataques e magias.
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
// O retrato do personagem (DND-31) é coberto em interviews.test.ts: aqui a geração em segundo plano não roda.
vi.mock("@/features/maddox/server/character-portrait", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/character-portrait")>()), scheduleCharacterPortrait: vi.fn() }))
vi.mock("@/features/character-sheets/api/character-sheets-service", () => ({ createBlankSheet }))
// Catálogo real sobre o MongoDB em memória (menções e as ferramentas search_catalog/get_catalog_entity).
vi.mock("@/features/dice-roller/server/dice-roll-service", () => ({ rollGeneralDice }))
vi.mock("@/features/dice-roller/server/dice-target", () => ({ resolveGeneralDiceTarget: (input: { userId: string }) => ({ scope: "user", userId: input.userId }) }))

const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
const { MaddoxCampaignModel, MaddoxCampaignMemberModel, MaddoxCharacterModel, MaddoxInterviewModel, MaddoxInterviewScriptModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const campaigns = await import("@/features/maddox/server/campaigns")
const interviews = await import("@/features/maddox/server/interviews")
const scoresService = await import("@/features/maddox/server/interview-scores-service")
const { completeInterview } = await import("@/features/maddox/server/interview-consolidation")
const hitPointsService = await import("@/features/maddox/server/interview-hit-points")
const { computeCharacterSheet, writeCharacterSheet } = await import("@/features/maddox/server/sheet-builder")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const { CharacterAttack } = await import("@/features/character-sheets/models/character-attack")
const { CharacterSpell } = await import("@/features/character-sheets/models/character-spell")

let mongo: MongoMemoryServer
const ids = { owner: "", ana: "" }

const say = (text: string): Step => ({ type: "delta", text })
const call = (name: string, input: unknown = {}): Step => ({ type: "call", name, input })
const PROPOSAL = "Síntese pronta. Confirma?\n[[MADDOX_PROPOSTA_DE_CONCLUSAO]]"

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
async function characterInterview(rigor: "narrativo" | "equilibrado" | "rigoroso" | "fiel-dnd" = "fiel-dnd", startingLevel: number | null = null, startingStage: string | null = null) {
    const campaign = await campaigns.createCampaign({ name: "Brumas", rigor }, ids.owner)
    const { token } = await campaigns.getInviteLink(campaign.id, ids.owner)
    await campaigns.joinByInvite(token, ids.ana)
    const scenario = await interviews.startInterview(campaign.id, "scenario", ids.owner)
    await run(scenario.turn!)
    scripted.push([say(PROPOSAL)])
    await run(await interviews.sendInterviewMessage(campaign.id, "scenario", { content: "Sombrio." }, ids.owner))
    generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ setting: { universo: "Aethra", canone: "", contexto: "", regras: "", tom: "" }, openingSituation: "Numa taverna.", campaignName: null, startingLevel, startingStage }) })
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


let cat: SheetCatalogIds

/** Card de atributos aberto e enviado (compra de pontos) e o bônus do Soldado aplicado: FOR 17, CON 14. */
async function attributesWithSoldierBonus(campaignId: string) {
    await openCard(campaignId)
    scripted.push([say("Anotado.")])
    await run(await scoresService.submitAbilityScores(campaignId, "character", { method: "point-buy", scores: { strength: 15, dexterity: 13, constitution: 13, intelligence: 8, wisdom: 12, charisma: 10 } }, ids.ana))
    scripted.push([call("apply_ability_bonus", { antecedente: "Soldado", bonus: { "Força": 2, "Constituição": 1 } }), say("Bônus aplicado.")])
    await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Soldado, +2 Força e +1 Constituição." }, ids.ana))
}

const lastTool = (name: string) => [...toolResults].reverse().find((result) => result.name === name)!

describe("ficha completa pela entrevista de personagem", () => {
    beforeEach(async () => {
        cat = await seedSheetCatalog()
    })

    it("Fiel, nível 3 da mesa: escolhas gravadas, card de PV (média e rolagem) e a ficha montada inteira no servidor", async () => {
        const campaignId = await characterInterview("fiel-dnd", 3)
        expect((await MaddoxCampaignModel.findById(campaignId).lean())!.startingLevel).toBe(3)
        expect(calls.at(-1)!.instructions).toContain("A mesa começa no nível 3")
        expect(calls.at(-1)!.instructions).toContain("### Ficha: situação atual")
        await attributesWithSoldierBonus(campaignId)

        // Escolha inválida: nada é gravado, com o motivo e as opções.
        scripted.push([call("update_character_build", { raca: "Humano", classe: "Guerreiro", periciasClasse: ["Arcanismo", "Percepção"] }), say("Hm.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Humano guerreiro com Arcanismo." }, ids.ana))
        expect(lastTool("update_character_build").error).toMatch(/^Nada foi gravado\. Arcanismo não está entre as perícias de Guerreiro: Acrobacia, Atletismo, Intimidação, Percepção, Sobrevivência\./)
        expect((await interviewDoc()).build ?? null).toBeNull()
        // Origem já dá Atletismo: repetir é recusado; nível diferente do da mesa também.
        scripted.push([call("update_character_build", { raca: "Humano", classe: "Guerreiro", origem: "soldier", periciasClasse: ["Atletismo", "Percepção"], nivel: 5 }), say("Hm.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Atletismo e Percepção." }, ids.ana))
        expect(lastTool("update_character_build").error).toContain("Atletismo já vem da origem")
        expect(lastTool("update_character_build").error).toContain("O nível é da mesa: 3.")

        scripted.push([
            call("update_character_build", { raca: "humano", classe: "Guerreiro", origem: "soldier", periciasClasse: ["Percepção", "Sobrevivência"], subclasse: "Campeão", estiloLuta: "Defesa" }),
            call("update_character_build", {
                equipamento: [
                    { item: "Espada longa", equipado: true },
                    { item: "Cota de malha", equipado: true },
                ],
                moedas: { po: 15 },
                idiomas: ["Comum", "Anão"],
            }),
            say("Gravei tudo."),
        ])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Percepção, Sobrevivência, Campeão, Defesa, espada e cota." }, ids.ana))
        const saved = lastTool("update_character_build").output as { nivel: number; raca: string; faltando: string[]; regras: { dadoDeVida: string; nivelDaSubclasse: number } }
        expect(saved).toMatchObject({ nivel: 3, raca: "Humano", classe: "Guerreiro", subclasse: "Campeão", origem: "Soldado", talentoDaOrigem: "Atacante Selvagem", regras: { dadoDeVida: "d10", nivelDaSubclasse: 3 } })
        expect(saved.faltando).toEqual(["pontos de vida dos níveis 2 a 3 (card de PV: `request_hit_points`)"])

        // Sem o card de PV: a conclusão espera, sem consolidar.
        scripted.push([say(PROPOSAL)])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Pode fechar." }, ids.ana))
        const consolidations = generateAiText.mock.calls.length
        expect(await errorOf(completeInterview(campaignId, "character", ids.ana))).toMatchObject({ status: 409, code: "HIT_POINTS_PENDING" })
        expect(generateAiText.mock.calls.length).toBe(consolidations)
        expect((await interviewDoc()).generating).toBeNull()

        scripted.push([call("request_hit_points", { motivo: "PV dos níveis 2 e 3" }), say("Escolha no card.")])
        const opened = await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "E os PV?" }, ids.ana))
        const done = opened.find((line) => line.type === "done")
        expect(done && done.type === "done" && done.message.hitPoints).toMatchObject({ status: "pending", level: 3, hitDie: "d10", constitutionModifier: 2, levelOne: 12, rows: [{ level: 2, average: 7, die: null }, { level: 3, average: 7, die: null }] })

        // "rolagem" num nível não rolado é recusada; o nível 3 é rolado no motor (d10 + CON) uma vez só.
        expect(await errorOf(hitPointsService.submitHitPoints(campaignId, "character", { escolhas: { "2": "media", "3": "rolagem" } }, ids.ana))).toMatchObject({ status: 400, code: "INVALID_HIT_POINTS" })
        diceQueue.push([7])
        await hitPointsService.rollHitPoint(campaignId, "character", 3, ids.ana)
        expect(rollGeneralDice).toHaveBeenLastCalledWith(expect.objectContaining({ terms: [{ dice: "d10", quantity: 1 }], modifier: 2 }), { scope: "user", userId: ids.ana })
        expect(await errorOf(hitPointsService.rollHitPoint(campaignId, "character", 3, ids.ana))).toMatchObject({ status: 409, code: "HIT_POINT_ROLLED" })
        scripted.push([say(PROPOSAL)])
        await run(await hitPointsService.submitHitPoints(campaignId, "character", { escolhas: { "2": "media", "3": "rolagem" } }, ids.ana))
        const card = interviews.interviewDto(await interviewDoc()).messages.find((message) => message.hitPoints)!.hitPoints!
        expect(card).toMatchObject({ status: "submitted", total: 28, rows: [{ level: 2, average: 7 }, { level: 3, die: 7, rolled: 9 }] })
        expect(calls.at(-1)!.messages.map((message) => JSON.stringify(message.content)).join(" ")).toContain("PV máximo 28")

        generateAiText.mockResolvedValueOnce({
            text: JSON.stringify({
                name: null,
                profile: { identidade: "Soldado" },
                sheet: {
                    appearance: "Alto, cicatriz no queixo, carrega uma {{Item:Espada longa}}.",
                    history: "Cresceu numa vila de {{Raça:Humano}}s.\n\nServiu como **sentinela**.",
                    personalityTraits: "Calado.",
                    ideals: "Dever.",
                    bonds: "A vila.",
                    flaws: "Teimoso.",
                    age: "28 anos",
                    eyes: "castanhos",
                },
            }),
        })
        await completeInterview(campaignId, "character", ids.ana)
        expect(generateAiText.mock.calls.at(-1)![0].instructions).toContain('"history"')

        const sheetId = (await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean())!.sheetId!
        const sheet = (await CharacterSheet.findById(sheetId).lean())!
        expect(sheet.race).toContain(`data-id="${String(cat.race)}" data-entity-type="Raça"`)
        expect(sheet.class).toContain(">Guerreiro</span>")
        expect(sheet.subclass).toContain(`data-id="subclass:${String(cat.fighter)}:${String(cat.champion)}"`)
        expect(sheet.origin).toContain(">Soldado</span>")
        expect(String(sheet.raceRef)).toBe(String(cat.race))
        expect(String(sheet.classRef)).toBe(String(cat.fighter))
        expect(String(sheet.subclassRef)).toBe(String(cat.champion))
        expect(String(sheet.originRef)).toBe(String(cat.soldier))
        expect(sheet).toMatchObject({
            level: 3,
            strength: 17,
            constitution: 14,
            hitDiceTotal: "d10",
            hpMax: 28,
            hpCurrent: 28,
            size: "Médio",
            movementSpeed: "9 metros",
            weaponProficiencies: "Armas Simples, Armas Marciais",
            armorTraining: { light: true, medium: true, heavy: true, shields: true },
            savingThrows: { strength: true, constitution: true, dexterity: false },
            coins: { gp: 15, sp: 0, cp: 0, ep: 0, pp: 0 },
            age: "28 anos",
            eyes: "castanhos",
            personalityTraits: "<p>Calado.</p>",
        })
        for (const skill of ["Atletismo", "Intimidação", "Percepção", "Sobrevivência"]) expect(sheet.skills[skill as "Atletismo"].proficient).toBe(true)
        expect(sheet.skills.Arcanismo.proficient).toBe(false)
        expect(sheet.classFeatures).toContain("Sopro Revigorante")
        expect(sheet.classFeatures).toContain("Surto de Ação")
        expect(sheet.classFeatures).toContain("Crítico Aprimorado")
        expect(sheet.classFeatures).not.toContain("Melhoria de Atributo")
        expect(sheet.speciesTraits).toContain("Versátil")
        expect(sheet.featuresNotes).toContain(">Atacante Selvagem</span>")
        expect(sheet.featuresNotes).toContain(">Defesa</span>")
        expect(sheet.resourceCharges.map((row) => [row.source?.entityId, row.total])).toEqual(expect.arrayContaining([[String(cat.trait.secondWind), 2], [String(cat.trait.actionSurge), 1]]))
        expect(sheet.notes).toBe("<p>Idiomas: Comum, Anão</p>")
        // História e aparência no HTML rico da ficha: parágrafos, negrito e as citações do catálogo como menções.
        expect(sheet.history).toBe(`<p>Cresceu numa vila de <span data-type="mention" data-id="${String(cat.race)}" data-entity-type="Raça" data-label="Humano" class="mention">Humano</span>s.</p><p>Serviu como <strong>sentinela</strong>.</p>`)
        expect(sheet.appearance).toBe(`<p>Alto, cicatriz no queixo, carrega uma <span data-type="mention" data-id="${String(cat.items.sword)}" data-entity-type="Item" data-label="Espada longa" class="mention">Espada longa</span>.</p>`)
        expect(JSON.stringify(sheet)).not.toContain("{{")

        const items = await CharacterItem.find({ sheetId }).lean()
        expect(items.map((item) => [String(item.catalogItemId), item.catalogItemType, item.equipped, item.catalogAc])).toEqual(
            expect.arrayContaining([
                [String(cat.items.sword), "arma", true, null],
                [String(cat.items.mail), "armadura", true, 16],
            ]),
        )
        const attacks = await CharacterAttack.find({ sheetId }).lean()
        expect(attacks).toHaveLength(1)
        expect(attacks[0]).toMatchObject({ attackBonus: "+5" })
        expect(attacks[0]!.damageType).toContain('data-faces="8"')
        expect(attacks[0]!.name).toContain(">Espada longa</span>")
    })

    it("graus narrativos: o cenário grava o estágio (sem nível), o personagem o recebe no prompt e não há ficha nem ferramentas", async () => {
        const campaignId = await characterInterview("narrativo", 4, "caçadores recém-iniciados")
        expect((await MaddoxCampaignModel.findById(campaignId).lean())!).toMatchObject({ startingLevel: null, startingStage: "caçadores recém-iniciados" })
        expect(calls.at(-1)!.via).toBe("stream")
        expect(calls.at(-1)!.instructions).toContain("A mesa começa neste estágio: caçadores recém-iniciados.")
        expect(calls.at(-1)!.instructions).not.toContain("## Construção da ficha")
        expect(await errorOf(hitPointsService.rollHitPoint(campaignId, "character", 2, ids.ana))).toMatchObject({ status: 409, code: "SHEET_DISABLED" })
        // Estágio longo vindo do modelo (bem acima de 300 caracteres): gravado inteiro, sem corte.
        const longStage = `caçadores recém-iniciados ${"com algumas missões nas costas, uma dívida antiga com a guilda e um mentor desaparecido; ".repeat(12)}`.trim()
        expect(longStage.length).toBeGreaterThan(1_000)
        const longCampaign = await characterInterview("narrativo", null, longStage)
        expect((await MaddoxCampaignModel.findById(longCampaign).lean())!.startingStage).toBe(longStage)
        expect(calls.at(-1)!.instructions).toContain(`A mesa começa neste estágio: ${longStage}`)
    })

    it("conclusão com escolhas faltando responde 409 com a lista, sem consolidar e com a trava livre", async () => {
        const campaignId = await characterInterview("fiel-dnd", 1)
        await attributesWithSoldierBonus(campaignId)
        scripted.push([call("update_character_build", { raca: "Humano", classe: "Guerreiro", origem: "Soldado" }), say(PROPOSAL)])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Humano guerreiro soldado." }, ids.ana))
        const consolidations = generateAiText.mock.calls.length
        expect(await errorOf(completeInterview(campaignId, "character", ids.ana))).toMatchObject({
            status: 409,
            code: "CHARACTER_BUILD_INCOMPLETE",
            message: "Faltam escolhas na ficha: 2 perícias da classe (entre: Acrobacia, Atletismo, Intimidação, Percepção, Sobrevivência); estilo de luta (talento da categoria Estilo de Luta); equipamento inicial; idiomas. Peça ao Maddox para concluir antes de confirmar.",
        })
        expect(generateAiText.mock.calls.length).toBe(consolidations)
        expect((await interviewDoc()).generating).toBeNull()
        // Card de PV: só na entrevista de personagem (cenário = 404) e sem card aberto não rola.
        expect(await errorOf(hitPointsService.rollHitPoint(campaignId, "scenario", 2, ids.owner))).toMatchObject({ status: 404 })
        expect(await errorOf(hitPointsService.rollHitPoint(campaignId, "character", 2, ids.ana))).toMatchObject({ status: 409, code: "NO_PENDING_HIT_POINTS" })
        // Nível 1: o card de PV não existe (PV automáticos).
        scripted.push([call("request_hit_points"), say("Ok.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "E os PV?" }, ids.ana))
        expect(lastTool("request_hit_points").error).toContain("só existe acima do nível 1")
    })

    it("Mago nível 1: truques e magias da lista e do círculo certo; magia acima do círculo recusada; ficha com espaços, magias e ataque do truque", async () => {
        const campaignId = await characterInterview("rigoroso", 1)
        await attributesWithSoldierBonus(campaignId)
        scripted.push([call("update_character_build", { raca: "Humano", classe: "Mago", origem: "Soldado", truques: ["Raio de Fogo", "Luz"], magias: ["Mísseis Mágicos", "Bola de Fogo"] }), say("Hm.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Mago." }, ids.ana))
        expect(lastTool("update_character_build").error).toContain("“Bola de Fogo” é do 3º círculo; no nível 1 o máximo é o 1º.")
        scripted.push([
            call("update_character_build", {
                raca: "Humano",
                classe: "Mago",
                origem: "Soldado",
                periciasClasse: ["Arcanismo", "História"],
                truques: ["Raio de Fogo", "Luz"],
                magias: ["Mísseis Mágicos", "Escudo Arcano"],
                equipamento: [{ item: "Pacote de Aventureiro" }],
                idiomas: ["Comum"],
            }),
            say(PROPOSAL),
        ])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Mísseis e Escudo." }, ids.ana))
        expect((lastTool("update_character_build").output as { faltando: string[] }).faltando).toEqual([])
        generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ name: null, profile: { identidade: "Maga" }, sheet: { appearance: "Óculos.", history: "Estudou." } }) })
        await completeInterview(campaignId, "character", ids.ana)
        const sheetId = (await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean())!.sheetId!
        const sheet = (await CharacterSheet.findById(sheetId).lean())!
        // d6 + CON 14 (+2) no nível 1; Inteligência conjura; espaços do nível 1.
        expect(sheet).toMatchObject({ level: 1, hpMax: 8, hitDiceTotal: "d6", spellcastingAttribute: "intelligence", spellSlots: { "1": { total: 2, used: 0 } } })
        const spells = await CharacterSpell.find({ sheetId }).lean()
        expect(spells.map((spell) => [spell.circle, spell.prepared])).toEqual([[0, true], [0, true], [1, true], [1, true]])
        expect(spells.every((spell) => spell.catalogSpellId)).toBe(true)
        const attacks = await CharacterAttack.find({ sheetId }).lean()
        expect(attacks).toHaveLength(1)
        expect(attacks[0]).toMatchObject({ notes: `auto:spell:${String(cat.spells.fireBolt)}`, attackBonus: "+1" })
        // O pacote tem cargas: entra nas cargas da ficha.
        expect(sheet.resourceCharges.some((row) => row.source?.entityId === String(cat.items.pack) && row.total === 10)).toBe(true)
    })

    it("DND-51: magias da espécie e dos talentos (com a fonte) e o atributo de conjuração escolhido pelo jogador entram na ficha", async () => {
        const campaignId = await characterInterview("fiel-dnd", 1)
        await attributesWithSoldierBonus(campaignId)
        const base = { raca: "Humano", classe: "Guerreiro", origem: "Soldado", periciasClasse: ["Percepção", "Sobrevivência"], estiloLuta: "Defesa", equipamento: [{ item: "Espada longa", equipado: true }], idiomas: ["Comum"] }
        scripted.push([call("update_character_build", { ...base, magiasExtras: [{ fonte: "Elfo", magia: "Luz" }] }), say("Hm.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Luz." }, ids.ana))
        expect(lastTool("update_character_build").error).toContain("“Elfo” não é a espécie nem um talento deste personagem")
        // Magia extra sem o atributo de conjuração (o Guerreiro não conjura): a escolha do jogador falta.
        scripted.push([call("update_character_build", { ...base, magiasExtras: [{ fonte: "Atacante Selvagem", magia: "Raio de Fogo" }, { fonte: "Humano", magia: "Luz" }] }), say("Qual atributo?")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Raio de Fogo e Luz." }, ids.ana))
        expect((lastTool("update_character_build").output as { faltando: string[] }).faltando).toEqual([expect.stringContaining("atributo de conjuração")])
        scripted.push([call("update_character_build", { atributoConjuracao: "Sabedoria" }), say(PROPOSAL)])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Sabedoria." }, ids.ana))
        const output = lastTool("update_character_build").output as { faltando: string[]; magiasExtras: { magia: string; fonte: string }[]; atributoConjuracao: string }
        expect(output.faltando).toEqual([])
        expect(output.magiasExtras).toEqual([expect.objectContaining({ magia: "Raio de Fogo", fonte: "Atacante Selvagem" }), expect.objectContaining({ magia: "Luz", fonte: "Humano" })])
        expect(output.atributoConjuracao).toBe("Sabedoria")
        generateAiText.mockResolvedValueOnce({ text: JSON.stringify({ name: null, profile: { identidade: "Guerreira" }, sheet: { appearance: "Alta.", history: "Lutou." } }) })
        await completeInterview(campaignId, "character", ids.ana)
        const sheetId = (await MaddoxCharacterModel.findOne({ userId: ids.ana }).lean())!.sheetId!
        expect((await CharacterSheet.findById(sheetId).lean())!.spellcastingAttribute).toBe("wisdom")
        const spells = await CharacterSpell.find({ sheetId }).lean()
        expect(spells.map((spell) => String(spell.catalogSpellId)).sort()).toEqual([String(cat.spells.fireBolt), String(cat.spells.light)].sort())
        // O truque com dano ganha o ataque com o atributo escolhido (Sabedoria 12: +1, proficiência +2).
        const attack = await CharacterAttack.findOne({ sheetId, notes: `auto:spell:${String(cat.spells.fireBolt)}` }).lean()
        expect(attack!.attackBonus).toBe("+3")
    })

    it("DND-51 (F7): talento sem magia cujo texto diz \"você aprende\" não cobra magias; com magia, cobra até gravar ou declarar sem magia", async () => {
        const campaignId = await characterInterview("fiel-dnd", 1)
        await attributesWithSoldierBonus(campaignId)
        const base = { raca: "Humano", classe: "Guerreiro", origem: "Soldado", periciasClasse: ["Percepção", "Sobrevivência"], estiloLuta: "Defesa", equipamento: [{ item: "Espada longa", equipado: true }], idiomas: ["Comum"] }
        await mongoose.connection.collection("feats").updateOne({ _id: cat.feats.savage }, { $set: { description: "Você aprende três idiomas e sabe falar com os animais da sua terra." } })
        scripted.push([call("update_character_build", base), say("Ok.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Guerreiro." }, ids.ana))
        expect((lastTool("update_character_build").output as { faltando: string[] }).faltando).toEqual([])
        await mongoose.connection.collection("feats").updateOne({ _id: cat.feats.savage }, { $set: { description: "Você aprende um truque à sua escolha." } })
        scripted.push([call("update_character_build", base), say("Ok.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "De novo." }, ids.ana))
        expect((lastTool("update_character_build").output as { faltando: string[] }).faltando).toEqual([expect.stringContaining("magias do talento Atacante Selvagem")])
        scripted.push([call("update_character_build", { semMagiasExtras: ["Atacante Selvagem"] }), say("Ok.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Ele não tem magia." }, ids.ana))
        expect((lastTool("update_character_build").output as { faltando: string[] }).faltando).toEqual([])
    })

    it("refazer a ficha não duplica itens, ataques nem magias", async () => {
        const campaignId = await characterInterview("fiel-dnd", 1)
        await attributesWithSoldierBonus(campaignId)
        scripted.push([
            call("update_character_build", { raca: "Humano", classe: "Guerreiro", origem: "Soldado", periciasClasse: ["Percepção", "Sobrevivência"], estiloLuta: "Defesa", equipamento: [{ item: "Espada longa", equipado: true }], idiomas: ["Comum"] }),
            say("Ok."),
        ])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Ok." }, ids.ana))
        const doc = await interviewDoc()
        const sheet = await CharacterSheet.create({ userId: ids.ana, username: "ana", name: "Lyra", slug: "ana/lyra-2" })
        const input = { sheetId: sheet._id, name: "Lyra", portraitUrl: null, doc, seed: null, ctx: { rigor: "fiel-dnd" as const, startingLevel: 1 }, reserved: [] }
        await writeCharacterSheet(input)
        await writeCharacterSheet(input)
        expect(await CharacterItem.countDocuments({ sheetId: sheet._id })).toBe(1)
        expect(await CharacterAttack.countDocuments({ sheetId: sheet._id })).toBe(1)
    })

    it("modo Experiência (DND-56): a ficha nasce no limiar de XP do nível; no Marco a XP não é tocada", async () => {
        const campaignId = await characterInterview("fiel-dnd", 1)
        await attributesWithSoldierBonus(campaignId)
        scripted.push([
            call("update_character_build", { raca: "Humano", classe: "Guerreiro", origem: "Soldado", periciasClasse: ["Percepção", "Sobrevivência"], estiloLuta: "Defesa", equipamento: [{ item: "Espada longa", equipado: true }], idiomas: ["Comum"] }),
            say("Ok."),
        ])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Ok." }, ids.ana))
        const doc = await interviewDoc()
        const sheet = await CharacterSheet.create({ userId: ids.ana, username: "ana", name: "Lyra", slug: "ana/lyra-xp" })
        const input = (progression: "marco" | "experiencia", startingLevel: number) => ({ sheetId: sheet._id, name: "Lyra", portraitUrl: null, doc, seed: null, ctx: { rigor: "fiel-dnd" as const, startingLevel, progression }, reserved: [] })
        expect((await computeCharacterSheet(input("experiencia", 3))).set.experience).toBe(900)
        expect((await computeCharacterSheet(input("experiencia", 1))).set.experience).toBe(0)
        expect((await computeCharacterSheet(input("marco", 3))).set).not.toHaveProperty("experience")
    })

    it("Fiel recusa item e raça fora do catálogo; Equilibrado aceita como próprio e não cobra o que depende do catálogo", async () => {
        const campaignId = await characterInterview("fiel-dnd", 1)
        scripted.push([call("update_character_build", { raca: "Meio-dragão", equipamento: [{ item: "Sabre de luz" }] }), say("Hm.")])
        await run(await interviews.sendInterviewMessage(campaignId, "character", { content: "Meio-dragão com sabre." }, ids.ana))
        const error = lastTool("update_character_build").error!
        expect(error).toContain("Raça “Meio-dragão” não está no catálogo do DnDicas. Opções: Humano.")
        expect(error).toContain("Item “Sabre de luz” não está no catálogo.")

        await mongoose.connection.db!.dropDatabase()
        await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxInterviewModel.init(), MaddoxInterviewScriptModel.init()])
        ids.owner = await seedUser("mestre", "Marina Dona")
        ids.ana = await seedUser("ana", "Ana Jogadora")
        cat = await seedSheetCatalog()
        const balanced = await characterInterview("equilibrado", null)
        scripted.push([call("update_character_build", { nivel: 2, raca: "Meio-dragão", classe: "Cavaleiro Rúnico", origem: "Soldado", equipamento: [{ item: "Sabre de luz" }], idiomas: ["Dracônico"] }), say("Ok.")])
        await run(await interviews.sendInterviewMessage(balanced, "character", { content: "Tudo próprio." }, ids.ana))
        const output = lastTool("update_character_build").output as { raca: string; classe: string; avisos: string[]; faltando: string[] }
        expect(output.raca).toBe("Meio-dragão (própria)")
        expect(output.avisos.join(" ")).toContain("fora do catálogo")
        expect(output.faltando).toEqual(["atributos (card de atributos)"])
    })
})
