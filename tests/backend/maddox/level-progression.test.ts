import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose, { Types } from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * DND-56: progressão de nível das Campanhas Maddox. Modo Marco (decisão do marco pelo JEV ou pela geração curta, declaração
 * do grupo inteiro para maior nível + 1, recusas), modo Experiência (XP concedida, limiar, subidas acumuladas e as que
 * esperam o fim do combate tático, XP dos monstros pelo ND), capítulos, "Avaliar marco" no "Pergunte ao mestre", o
 * Personagem Opex decidindo a subida e a trava da ficha de campanha.
 */

const recordAudit = vi.fn(async () => undefined)
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/core/database/db", () => ({ default: vi.fn(async () => undefined) }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/opex-table", () => ({ driveOpex: vi.fn(async () => undefined) }))
const sheetPusher = vi.hoisted(() => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({ CharacterSheetPusherService: { getInstance: () => sheetPusher } }))
const ai = vi.hoisted(() => ({ askMilestoneJev: vi.fn(async () => 0.9 as number | null), askMilestoneNarrator: vi.fn(async (): Promise<unknown> => ({ atingido: true, motivo: "O grupo venceu a emboscada." })), askSpellSwap: vi.fn(async () => ({ permite: false })) }))
vi.mock("@/features/maddox/server/level-up-ai", () => ai)
const settingsState = vi.hoisted(() => ({ jev: false }))
vi.mock("@/features/maddox/server/settings", async () => {
    const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
    return { loadMaddoxSettings: vi.fn(async () => ({ settings: { ...DEFAULT_MADDOX_SETTINGS, jev: { ...DEFAULT_MADDOX_SETTINGS.jev, "level-milestone": settingsState.jev } } })) }
})
const opex = vi.hoisted(() => ({ decide: vi.fn(async (): Promise<unknown> => ({ pv: "rolagem", truques: [], magias: [] })) }))
vi.mock("@/features/maddox/server/opex-player", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/maddox/server/opex-player")>()),
    loadOpexModel: vi.fn(async () => ({ settings: {}, model: { provider: "openai", model: "x", agent: null, variant: null } })),
    opexPromptContext: vi.fn(async () => ({ instructions: "", ownerGuidance: "", memories: "", table: [], basePrompt: "", campaign: { name: "Phandelver", rigor: "fiel-dnd", setting: "", openingSituation: "", state: { scene: "", location: "", situation: "", pendingDecision: "" } }, character: null })),
    decideOpex: opex.decide,
}))

vi.mock("@/features/owlbear/server/auth", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/owlbear/server/auth")>()),
    requireOwlbearSheetAccess: vi.fn(async () => ({ session: { userId: "dono" } })),
}))

const { MaddoxCampaignModel, MaddoxCampaignMessageModel, MaddoxCampaignMemberModel, MaddoxCharacterModel, MaddoxCombatModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const levels = await import("@/features/maddox/server/level-ups")
const { evaluateLevelMilestone } = await import("@/features/maddox/server/level-milestone")
const { enqueueMaddoxJob, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")
const { milestoneOnEvent } = await import("@/features/maddox/server/progression-actions")
const runs = await import("@/features/maddox/server/question-runs")
const { grantCombatExperience } = await import("@/features/maddox/server/combat-experience")
const { runOpexLevelUp, retryOpexLevelUp } = await import("@/features/maddox/server/level-up-opex")
const { MADDOX_LEVEL_UP_OPEX_FAILURE } = await import("@/features/maddox/constants")
const { applySheetLevelUp, campaignPatchRefusal, getSheetLevelUp } = await import("@/features/character-sheets/level-up/level-up-service")

const { patchSheet, patchSheetWithAccess } = await import("@/features/character-sheets/api/character-sheets-service")
const { CampaignSheetPatchError } = await import("@/features/character-sheets/level-up/level-up-service")
const { findOpexTool } = await import("@/features/opex-agent/server/tools/registry")
const owlbearRoutes = await import("@/features/owlbear/server/character-sheet-routes")
const { autoLevelUps, opexLevelUpKey } = await import("@/features/maddox/server/level-up-opex")
const { isOpexRunning, waitForOpexIdle } = await import("@/features/maddox/server/opex-runtime")
const { restoreSnapshot } = await import("@/features/maddox/server/turn-snapshots")
const { sheetExperienceNumber } = await import("@/lib/db/migrations/sheet-experience-number")
const { listJournalChapters } = await import("@/features/maddox/server/journal")
const { NextRequest } = await import("next/server")

let mongo: MongoMemoryServer
const mention = (id: Types.ObjectId, label: string, type = "Habilidade") => `<p><span data-type="mention" data-id="${String(id)}" data-entity-type="${type}" data-label="${label}" class="mention">${label}</span></p>`

interface Table {
    campaignId: Types.ObjectId
    owner: string
    members: { memberId: Types.ObjectId; characterId: Types.ObjectId; sheetId: Types.ObjectId; name: string; userId: string; kind: "human" | "opex" }[]
}

async function catalog() {
    const surto = new Types.ObjectId()
    await mongoose.connection.collection("traits").insertOne({ _id: surto, name: "Surto de Ação", description: "Ação extra.", status: "active" })
    const classId = new Types.ObjectId()
    await mongoose.connection.collection("characterclasses").insertOne({ _id: classId, name: "Guerreiro", hitDice: "d10", status: "active", savingThrows: [], armorProficiencies: [], weaponProficiencies: [], spellcasting: false, subclasses: [], traits: [{ level: 2, description: mention(surto, "Surto de Ação") }] })
    return classId
}

async function table(options: { rigor?: string; mode?: "marco" | "experiencia" | null; levels?: number[]; kinds?: ("human" | "opex")[]; setting?: string } = {}): Promise<Table> {
    const classId = await catalog()
    const owner = "dono"
    const campaignId = new Types.ObjectId()
    const rigor = options.rigor ?? "fiel-dnd"
    await MaddoxCampaignModel.collection.insertOne({
        _id: campaignId,
        name: "Phandelver",
        ownerId: owner,
        rigor,
        status: "active",
        setting: options.setting ?? "Aventura oficial Phandelver and Below.",
        startingLevel: 1,
        turn: { number: 5, phase: "players" },
        ...(options.mode === null ? {} : { progression: { mode: options.mode ?? "marco", declared: [], pendingMilestone: null } }),
        createdAt: new Date(),
        updatedAt: new Date(),
    })
    const names = ["Nala", "Uther", "Vaelyra"]
    const members: Table["members"] = []
    for (const [index, level] of (options.levels ?? [1, 1, 1]).entries()) {
        const kind = options.kinds?.[index] ?? (index === 0 ? "human" : "opex")
        const memberId = new Types.ObjectId()
        const userId = index === 0 ? owner : kind === "opex" ? `opex:${String(memberId)}` : `player-${index}`
        const characterId = new Types.ObjectId()
        const sheetId = new Types.ObjectId()
        await CharacterSheet.collection.insertOne({ _id: sheetId, slug: `f-${String(sheetId)}`, userId: kind === "opex" ? owner : userId, name: names[index], level, experience: 0, classRef: classId, class: mention(classId, "Guerreiro", "Classe"), hpMax: 12, hpCurrent: 12, hitDiceTotal: "d10", strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10, classFeatures: "", speciesTraits: "", featuresNotes: "", spellSlots: {}, resourceCharges: [], createdAt: new Date(), updatedAt: new Date() })
        await MaddoxCampaignMemberModel.collection.insertOne({ _id: memberId, campaignId, userId, kind, role: index === 0 ? "owner" : "player", status: "joined", characterId, ...(kind === "opex" ? { opex: { ownerUserId: owner, prompt: "", addedAt: new Date() } } : {}) })
        await MaddoxCharacterModel.collection.insertOne({ _id: characterId, campaignId, memberId, userId, name: names[index], status: "active", sheetId, interview: { status: "done", scriptVersion: 1 }, createdAt: new Date(), updatedAt: new Date() })
        members.push({ memberId, characterId, sheetId, name: names[index]!, userId, kind })
    }
    return { campaignId, owner, members }
}

const campaignOf = async (id: Types.ObjectId) => (await MaddoxCampaignModel.findById(id).lean())!

/** Roda `work` dentro de um job da fila (narração ou resposta), como o narrador. */
async function inJob<T>(campaignId: Types.ObjectId, kind: "narration" | "answer", work: (jobId: string) => Promise<T>): Promise<T> {
    let result: T | undefined
    let failure: unknown = null
    await enqueueMaddoxJob(String(campaignId), "teste", async ({ jobId }) => {
        try {
            result = await work(jobId)
        } catch (error) {
            failure = error
        }
    }, { kind, turnNumber: 5, round: 0 })
    await waitForCampaignIdle(String(campaignId))
    if (failure) throw failure
    return result as T
}

const tool = (name: string) => findMaddoxTool(name)!

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_level_progression" })
})
afterAll(async () => {
    await mongoose.disconnect()
    await mongo.stop()
})
beforeEach(async () => {
    await mongoose.connection.db!.dropDatabase()
    settingsState.jev = false
    ai.askMilestoneJev.mockReset().mockResolvedValue(0.9)
    ai.askMilestoneNarrator.mockReset().mockResolvedValue({ atingido: true, motivo: "O grupo venceu a emboscada." })
    opex.decide.mockReset().mockResolvedValue({ pv: "rolagem", truques: [], magias: [] })
    recordAudit.mockClear()
})

describe("declaração da subida (modo Marco)", () => {
    it("sobe o grupo inteiro para maior nível + 1, igualando quem está abaixo, e grava o card", async () => {
        const t = await table({ levels: [1, 2, 1] })
        const result = await levels.declareGroupLevelUp(t.campaignId, { reason: "Fim da emboscada.", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        expect(result).toEqual({ level: 3, steps: 5 })
        const campaign = await campaignOf(t.campaignId)
        const nala = campaign.levelUps!.filter((step) => String(step.characterId) === String(t.members[0]!.characterId)).map((step) => [step.fromLevel, step.toLevel, step.status])
        expect(nala).toEqual([[1, 2, "pending"], [2, 3, "pending"]])
        expect(campaign.progression!.declared).toEqual([expect.objectContaining({ level: 3, reason: "Fim da emboscada.", trigger: "combat-end", offMilestone: false })])
        const card = await MaddoxCampaignMessageModel.findOne({ campaignId: t.campaignId, kind: "level-up" }).lean()
        expect(card!.levelUp).toMatchObject({ toLevel: 3, reason: "Fim da emboscada.", source: "marco" })
        expect(card!.levelUp!.levelUpIds).toHaveLength(5)
    })

    it("recusa nível repetido, combate tático, acima do 20, modo Experiência e grau sem ficha", async () => {
        const t = await table()
        await levels.declareGroupLevelUp(t.campaignId, { reason: "a", trigger: "manual", offMilestone: true, turnNumber: 5 })
        // O nível do grupo avança mesmo com pendências: a próxima declaração é para o 3.
        await expect(levels.checkDeclaration(await campaignOf(t.campaignId))).resolves.toMatchObject({ target: 3 })
        await MaddoxCampaignModel.updateOne({ _id: t.campaignId }, { $push: { "progression.declared": { id: "x", level: 3, reason: "", trigger: "manual", offMilestone: true, turnNumber: 5, messageId: null, at: new Date() } } })
        await expect(levels.checkDeclaration(await campaignOf(t.campaignId))).resolves.toMatchObject({ target: 4 })
        await MaddoxCombatModel.collection.insertOne({ campaignId: t.campaignId, status: "active", mode: "tactical", title: "Goblins", combatants: [] })
        await expect(levels.checkDeclaration(await campaignOf(t.campaignId))).rejects.toThrow("só é declarada depois do combate tático")
        const top = await table({ levels: [20, 20, 19] })
        await expect(levels.checkDeclaration(await campaignOf(top.campaignId))).rejects.toThrow("nível 20")
        const xp = await table({ mode: "experiencia" })
        await expect(levels.checkDeclaration(await campaignOf(xp.campaignId))).rejects.toThrow("modo Experiência")
        const narrative = await table({ rigor: "narrativo", mode: null })
        await expect(levels.checkDeclaration(await campaignOf(narrative.campaignId))).rejects.toThrow("não tem nível")
    })

    it("campanha antiga sem o campo fica em Marco", async () => {
        const t = await table({ mode: null })
        expect(levels.progressionModeOf(await campaignOf(t.campaignId))).toBe("marco")
        await expect(levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "manual", offMilestone: true, turnNumber: 5 })).resolves.toEqual({ level: 2, steps: 3 })
    })
})

describe("decisão do marco", () => {
    it("com a chave do JEV ligada, o JEV decide com o cenário, os 3 personagens e o acontecimento", async () => {
        settingsState.jev = true
        const t = await table()
        const decision = await evaluateLevelMilestone(await campaignOf(t.campaignId), "combat-end", "Emboscada na Trilha Triboar")
        expect(decision).toMatchObject({ reached: true, via: "jev" })
        expect(ai.askMilestoneNarrator).not.toHaveBeenCalled()
        const facts = (ai.askMilestoneJev.mock.calls[0] as unknown as [{ facts: Record<string, string> }])[0].facts
        expect(facts["Personagens ativos"]).toContain("3 personagem(ns)")
        expect(facts["Nível atual do grupo"]).toBe("1")
        expect(facts["Cenário (aventura oficial ou mundo próprio)"]).toContain("Aventura oficial")
        expect(facts.Acontecimento).toBe("fim de combate: Emboscada na Trilha Triboar")
    })

    it("chave desligada: a geração curta decide; JEV indisponível também cai nela; negativa traz o motivo", async () => {
        const t = await table()
        ai.askMilestoneNarrator.mockResolvedValueOnce({ atingido: false, motivo: "Ainda falta história." })
        await expect(evaluateLevelMilestone(await campaignOf(t.campaignId), "quest-completed", "A carroça")).resolves.toEqual({ reached: false, reason: "Ainda falta história.", via: "narrator" })
        expect(ai.askMilestoneJev).not.toHaveBeenCalled()
        settingsState.jev = true
        ai.askMilestoneJev.mockRejectedValueOnce(new Error("sem chave"))
        await expect(evaluateLevelMilestone(await campaignOf(t.campaignId), "combat-end", "")).resolves.toMatchObject({ reached: true, via: "narrator" })
        settingsState.jev = false
        ai.askMilestoneNarrator.mockResolvedValueOnce("lixo")
        await expect(evaluateLevelMilestone(await campaignOf(t.campaignId), "combat-end", "")).resolves.toBeNull()
    })

    it("positiva no acontecimento da geração vira orientação; sem declarar, vai para a próxima narração", async () => {
        const t = await table()
        const note = await inJob(t.campaignId, "narration", async (jobId) => {
            const result = await milestoneOnEvent({ campaignId: t.campaignId, turnNumber: 5, jobId }, "combat-end", "Emboscada")
            await levels.commitProgression(t.campaignId, jobId, 5)
            return result
        })
        expect(note).toMatchObject({ marcoDeNivel: { atingido: true, motivo: "O grupo venceu a emboscada." } })
        expect((await campaignOf(t.campaignId)).progression!.pendingMilestone).toMatchObject({ trigger: "combat-end", reason: "O grupo venceu a emboscada." })
        // A narração seguinte declara: o marco pendente sai e a declaração não é "fora de marco".
        await inJob(t.campaignId, "narration", async (jobId) => {
            await runMaddoxTool(tool("declare_level_up"), { campaignId: t.campaignId, turnNumber: 6, jobId }, { motivo: "Vitória." })
            await levels.commitProgression(t.campaignId, jobId, 6)
        })
        const campaign = await campaignOf(t.campaignId)
        expect(campaign.progression!.pendingMilestone).toBeNull()
        expect(campaign.progression!.declared).toEqual([expect.objectContaining({ level: 2, offMilestone: false, trigger: "combat-end" })])
    })

    it("declarar fora de marco registra o motivo; a ferramenta só vale na narração", async () => {
        const t = await table()
        await inJob(t.campaignId, "narration", async (jobId) => {
            await expect(runMaddoxTool(tool("declare_level_up"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { motivo: "Recompensa do rei." })).resolves.toMatchObject({ declarado: true, nivel: 2, foraDeMarco: true })
            await expect(runMaddoxTool(tool("declare_level_up"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { motivo: "De novo." })).rejects.toThrow("já foi declarada nesta narração")
            await levels.commitProgression(t.campaignId, jobId, 5)
        })
        expect((await campaignOf(t.campaignId)).progression!.declared).toEqual([expect.objectContaining({ reason: "Recompensa do rei.", offMilestone: true })])
        await inJob(t.campaignId, "answer", async (jobId) => {
            await expect(runMaddoxTool(tool("declare_level_up"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { motivo: "x" })).rejects.toThrow("só na narração")
        })
    })
})

describe("Avaliar marco de nível (Pergunte ao mestre)", () => {
    const ask = (t: Table, jobId: string) =>
        runs.openQuestionRun({ campaignId: String(t.campaignId), jobId, turnNumber: 5, questionId: String(new Types.ObjectId()), askerUserId: t.members[0]!.userId, askerCharacterId: String(t.members[0]!.characterId), askerIsOwner: false, playerTexts: ["não deveríamos ter subido?"] })

    it("positiva aciona a subida do grupo; negativa explica; durante o combate tático recusa", async () => {
        const t = await table()
        const result = await inJob(t.campaignId, "answer", async (jobId) => {
            ask(t, jobId)
            try {
                const output = await runMaddoxTool(tool("evaluate_level_milestone"), { campaignId: t.campaignId, turnNumber: 5, jobId }, {})
                await levels.commitProgression(t.campaignId, jobId, 5)
                return output
            } finally {
                runs.closeQuestionRun(jobId)
            }
        })
        expect(result).toMatchObject({ atingido: true, nivel: 2 })
        expect((await campaignOf(t.campaignId)).levelUps).toHaveLength(3)

        const other = await table()
        ai.askMilestoneNarrator.mockResolvedValueOnce({ atingido: false, motivo: "Só uma escaramuça." })
        await expect(inJob(other.campaignId, "answer", async (jobId) => {
            ask(other, jobId)
            try {
                return await runMaddoxTool(tool("evaluate_level_milestone"), { campaignId: other.campaignId, turnNumber: 5, jobId }, {})
            } finally {
                runs.closeQuestionRun(jobId)
            }
        })).resolves.toMatchObject({ atingido: false, motivo: "Só uma escaramuça." })

        await MaddoxCombatModel.collection.insertOne({ campaignId: other.campaignId, status: "active", mode: "tactical", title: "Goblins", combatants: [] })
        await expect(inJob(other.campaignId, "answer", async (jobId) => {
            ask(other, jobId)
            try {
                return await runMaddoxTool(tool("evaluate_level_milestone"), { campaignId: other.campaignId, turnNumber: 5, jobId }, {})
            } finally {
                runs.closeQuestionRun(jobId)
            }
        })).rejects.toThrow("só é avaliada depois do combate")
    })
})

describe("capítulos", () => {
    it("funciona em todos os graus; no grau sem ficha não roda a decisão do marco", async () => {
        const t = await table({ rigor: "narrativo", mode: null })
        const output = await inJob(t.campaignId, "narration", async (jobId) => {
            const result = await runMaddoxTool(tool("end_chapter"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { titulo: "A Trilha Triboar", resumo: "O grupo chegou a Phandalin." })
            await levels.commitProgression(t.campaignId, jobId, 5)
            return result
        })
        expect(output).toEqual({ encerrado: true, titulo: "A Trilha Triboar" })
        expect(ai.askMilestoneNarrator).not.toHaveBeenCalled()
        expect((await campaignOf(t.campaignId)).chapters).toEqual([expect.objectContaining({ title: "A Trilha Triboar", summary: "O grupo chegou a Phandalin.", turnNumber: 5 })])
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: t.campaignId, kind: "chapter" })).toBe(1)

        const marco = await table()
        const withMilestone = await inJob(marco.campaignId, "narration", (jobId) => runMaddoxTool(tool("end_chapter"), { campaignId: marco.campaignId, turnNumber: 5, jobId }, { titulo: "Fim do ato", resumo: "." }))
        expect(withMilestone).toMatchObject({ marcoDeNivel: { atingido: true } })
    })
})

describe("modo Experiência", () => {
    it("Conceder experiência (sem teto): XP, card e subidas acumuladas por limiar", async () => {
        const t = await table({ mode: "experiencia" })
        await inJob(t.campaignId, "narration", async (jobId) => {
            await expect(runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["Nala"], valor: 1_000, motivo: "Salvou a vila." })).resolves.toMatchObject({ concedido: true, personagens: ["Nala"] })
            await expect(runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["Nala", "Fulano"], valor: 10, motivo: "x" })).rejects.toThrow("Personagem não encontrado: Fulano")
            await levels.commitProgression(t.campaignId, jobId, 5)
        })
        expect((await CharacterSheet.findById(t.members[0]!.sheetId).lean())!.experience).toBe(1_000)
        const card = await MaddoxCampaignMessageModel.findOne({ campaignId: t.campaignId, kind: "experience" }).lean()
        expect(card!.experience).toMatchObject({ source: "grant", reason: "Salvou a vila.", total: 1_000, entries: [expect.objectContaining({ characterName: "Nala", amount: 1_000, total: 1_000 })] })
        // 1.000 XP = nível 3: duas subidas, em ordem.
        expect((await campaignOf(t.campaignId)).levelUps!.map((step) => [step.fromLevel, step.toLevel, step.status, step.source])).toEqual([[1, 2, "pending", "experiencia"], [2, 3, "pending", "experiencia"]])
        expect(levels.currentSteps(await campaignOf(t.campaignId)).map((step) => step.toLevel)).toEqual([2])
        await inJob(t.campaignId, "narration", async (jobId) => {
            await expect(runMaddoxTool(tool("declare_level_up"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { motivo: "x" })).rejects.toThrow("modo Experiência")
        })
    })

    it("o limiar atingido durante o combate tático espera o fim do combate", async () => {
        const t = await table({ mode: "experiencia" })
        await MaddoxCombatModel.collection.insertOne({ campaignId: t.campaignId, status: "active", mode: "tactical", title: "Goblins", combatants: [] })
        await levels.grantExperience(t.campaignId, [{ characterId: t.members[1]!.characterId, amount: 300 }], "Feito", "grant", 5)
        expect((await campaignOf(t.campaignId)).levelUps!.map((step) => step.status)).toEqual(["waiting-combat"])
        await levels.releaseCombatLevelUps(t.campaignId)
        expect((await campaignOf(t.campaignId)).levelUps!.map((step) => step.status)).toEqual(["pending"])
    })

    it("XP dos monstros derrotados no combate tático, pelo ND, dividida entre os participantes", async () => {
        const t = await table({ mode: "experiencia" })
        const goblin = new Types.ObjectId()
        const custom = new Types.ObjectId()
        await mongoose.connection.collection("monsters").insertMany([{ _id: goblin, name: "Goblin", challengeRating: "1/4", status: "active" }, { _id: custom, name: "Sem ND", status: "active" }])
        const combat = {
            _id: new Types.ObjectId(),
            campaignId: t.campaignId,
            status: "ended",
            mode: "tactical",
            title: "Emboscada",
            combatants: [
                { name: "Goblin A", nameKey: "goblin a", side: "inimigo", quantity: 1, outcome: "morto", tactical: { defeated: true, stats: { source: "catalog", monsterId: String(goblin) } } },
                { name: "Goblin B", nameKey: "goblin b", side: "inimigo", quantity: 1, outcome: "fugiu", tactical: { defeated: false, stats: { source: "catalog", monsterId: String(goblin) } } },
                { name: "Goblin C", nameKey: "goblin c", side: "inimigo", quantity: 1, outcome: "ileso", tactical: { defeated: false, stats: { source: "catalog", monsterId: String(goblin) } } },
                { name: "Ogro", nameKey: "ogro", side: "inimigo", quantity: 1, outcome: "morto", tactical: { defeated: true, stats: { source: "custom", monsterId: String(custom) } } },
            ],
            tactical: { characters: t.members.map((member) => ({ characterId: String(member.characterId), left: false })) },
        }
        await MaddoxCombatModel.collection.insertOne(combat)
        const stored = (await MaddoxCombatModel.findById(combat._id).lean())!
        // DND-70: o Ogro (sem ND) não some em silêncio: a parte oficial sai e a dele fica pendente para o mestre.
        await expect(grantCombatExperience(t.campaignId, stored, 5)).resolves.toEqual({ granted: 99, pending: [{ name: "Ogro", quantity: 1 }] })
        await expect(grantCombatExperience(t.campaignId, stored, 5)).resolves.toEqual({ granted: 0, pending: [] })
        for (const member of t.members) expect((await CharacterSheet.findById(member.sheetId).lean())!.experience).toBe(33)
        expect((await MaddoxCampaignMessageModel.findOne({ kind: "experience", "experience.total": { $gt: 0 } }).lean())!.experience).toMatchObject({ source: "combat", total: 99, combatId: combat._id })
        expect((await MaddoxCombatModel.findById(combat._id).lean())!.experiencePending).toMatchObject({ adversaries: [{ name: "Ogro", quantity: 1 }] })
    })

    it("combate narrativo e modo Marco não dão XP automática", async () => {
        const t = await table({ mode: "marco" })
        const combat = { _id: new Types.ObjectId(), campaignId: t.campaignId, status: "ended", mode: "tactical", title: "x", combatants: [], tactical: { characters: [] } }
        await MaddoxCombatModel.collection.insertOne(combat)
        await expect(grantCombatExperience(t.campaignId, (await MaddoxCombatModel.findById(combat._id).lean())!, 5)).resolves.toEqual({ granted: 0, pending: [] })
    })
})

describe("DND-70: XP de adversário fora do catálogo e XP no Pergunte ao mestre", () => {
    /** O combate do caso real: uma fera de bloco próprio (sem ND), derrotada. */
    async function beastCombat(t: Table, extra: Record<string, unknown> = {}) {
        const combat = {
            _id: new Types.ObjectId(),
            campaignId: t.campaignId,
            status: "ended",
            mode: "tactical",
            title: "A besta da estrada sul",
            combatants: [{ name: "A besta da estrada sul", nameKey: "a besta da estrada sul", side: "inimigo", quantity: 1, outcome: "morto", tactical: { defeated: true, stats: { source: "custom", monsterId: null } } }],
            tactical: { characters: t.members.slice(0, 2).map((member) => ({ characterId: String(member.characterId), name: member.name, left: false })) },
            ...extra,
        }
        await MaddoxCombatModel.collection.insertOne(combat)
        return combat
    }
    const ask = (t: Table, jobId: string, asker = 0, owner = false) =>
        runs.openQuestionRun({ campaignId: String(t.campaignId), jobId, turnNumber: 5, questionId: String(new Types.ObjectId()), askerUserId: t.members[asker]!.userId, askerCharacterId: String(t.members[asker]!.characterId), askerIsOwner: owner, playerTexts: ["por que não nos deu experiência após o combate?"] })
    /** Uma resposta do "Pergunte ao mestre": a ferramenta roda no job e a gravação sai depois da fala. */
    const answer = <T,>(t: Table, work: (jobId: string) => Promise<T>, asker = 0, owner = false) =>
        inJob(t.campaignId, "answer", async (jobId) => {
            ask(t, jobId, asker, owner)
            try {
                const output = await work(jobId)
                await levels.commitProgression(t.campaignId, jobId, 5)
                return output
            } finally {
                runs.closeQuestionRun(jobId)
            }
        })
    const xpOf = async (member: Table["members"][number]) => (await CharacterSheet.findById(member.sheetId).lean())!.experience

    it("combate só com a fera de bloco próprio: não queima o combate, grava a pendência e o card de XP pendente", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        const combat = await beastCombat(t)
        await expect(grantCombatExperience(t.campaignId, (await MaddoxCombatModel.findById(combat._id).lean())!, 34)).resolves.toEqual({ granted: 0, pending: [{ name: "A besta da estrada sul", quantity: 1 }] })
        const stored = (await MaddoxCombatModel.findById(combat._id).lean())!
        expect(stored.experiencePending).toMatchObject({ adversaries: [{ name: "A besta da estrada sul", quantity: 1 }], turnNumber: 34 })
        expect(stored.experienceResolved ?? null).toBeNull()
        const card = (await MaddoxCampaignMessageModel.findOne({ campaignId: t.campaignId, kind: "experience" }).lean())!
        expect(card.experience).toMatchObject({ source: "combat", total: 0, entries: [], combatId: combat._id, pending: [{ name: "A besta da estrada sul", quantity: 1 }] })
        expect(levels.experienceCardDto(card.experience!)).toMatchObject({ pending: [{ name: "A besta da estrada sul", quantity: 1 }], combatId: String(combat._id), estimated: false })
        const { pendingCombatExperience } = await import("@/features/maddox/server/combat-experience")
        await expect(pendingCombatExperience(t.campaignId)).resolves.toEqual([expect.objectContaining({ combatId: String(combat._id), title: "A besta da estrada sul", legacy: false, characterNames: ["Nala", "Uther"] })])
    })

    it("a parte oficial que divide para 0 vira pendência (nada some em silêncio)", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        const rat = new Types.ObjectId()
        await mongoose.connection.collection("monsters").insertOne({ _id: rat, name: "Rato", challengeRating: "0", status: "active", experienceOverride: 1 })
        const combat = await beastCombat(t, { combatants: [{ name: "Rato", nameKey: "rato", side: "inimigo", quantity: 1, outcome: "morto", tactical: { defeated: true, stats: { source: "catalog", monsterId: String(rat) } } }] })
        await expect(grantCombatExperience(t.campaignId, (await MaddoxCombatModel.findById(combat._id).lean())!, 5)).resolves.toEqual({ granted: 0, pending: [{ name: "Rato", quantity: 1 }] })
    })

    it("a narração seguinte recebe a pendência; o mestre estima e concede uma vez só, para quem lutou", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        const combat = await beastCombat(t)
        await grantCombatExperience(t.campaignId, (await MaddoxCombatModel.findById(combat._id).lean())!, 34)
        const { pendingCombatExperience } = await import("@/features/maddox/server/combat-experience")
        const { progressionTaskLines } = await import("@/features/maddox/server/narrator-prompt")
        const lines = progressionTaskLines({ milestone: null, levelUps: [], pendingCombatXp: await pendingCombatExperience(t.campaignId) })!
        expect(lines).toContain("XP PENDENTE do combate \"A besta da estrada sul\"")
        expect(lines).toContain(String(combat._id))
        await inJob(t.campaignId, "narration", async (jobId) => {
            const input = { personagens: ["grupo"], valor: 50, motivo: "Fera comparável a uma pantera (ND 1/2): 100 XP divididos.", combate: String(combat._id).slice(-6) }
            await expect(runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 35, jobId }, input)).resolves.toMatchObject({ concedido: true, combate: "A besta da estrada sul", personagens: ["Nala", "Uther"] })
            await expect(runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 35, jobId }, input)).rejects.toThrow("já foi concedida nesta geração")
            await levels.commitProgression(t.campaignId, jobId, 35)
        })
        expect(await xpOf(t.members[0]!)).toBe(50)
        expect(await xpOf(t.members[1]!)).toBe(50)
        expect(await xpOf(t.members[2]!)).toBe(0)
        const stored = (await MaddoxCombatModel.findById(combat._id).lean())!
        expect(stored.experienceResolved).toMatchObject({ by: "master", amount: 50, total: 100, reason: "Fera comparável a uma pantera (ND 1/2): 100 XP divididos." })
        const granted = (await MaddoxCampaignMessageModel.findOne({ campaignId: t.campaignId, kind: "experience", "experience.total": 100 }).lean())!
        expect(granted.experience).toMatchObject({ source: "grant", estimated: true, combatId: combat._id })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ event: "experience-granted", combatId: String(combat._id), estimated: true }) }))
        // Liquidada: sai da lista e uma nova concessão para o mesmo combate é recusada com o motivo.
        await expect(pendingCombatExperience(t.campaignId)).resolves.toEqual([])
        await inJob(t.campaignId, "narration", async (jobId) => {
            await expect(runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 36, jobId }, { personagens: ["grupo"], valor: 50, motivo: "x", combate: String(combat._id) })).rejects.toThrow("já foi concedida (50 XP por personagem)")
        })
    })

    it("Pergunte ao mestre: o jogador comum liquida a pendência do combate para o grupo e a XP vai para a ficha", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso", kinds: ["human", "human", "opex"] })
        const combat = await beastCombat(t)
        await grantCombatExperience(t.campaignId, (await MaddoxCombatModel.findById(combat._id).lean())!, 34)
        const { progressionToolNames } = await import("@/features/maddox/server/master-tools")
        expect(progressionToolNames({ mode: "experiencia", answer: true })).toEqual(["grant_experience"])
        expect(progressionToolNames({ mode: "marco", answer: true })).toEqual(["evaluate_level_milestone"])
        await answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["grupo"], valor: 50, motivo: "Fera comparável a ND 1/2.", combate: String(combat._id) }), 1)
        expect(await xpOf(t.members[0]!)).toBe(50)
        expect(await xpOf(t.members[1]!)).toBe(50)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ event: "experience-granted", requestedBy: t.members[1]!.userId }) }))
    })

    it("Pergunte ao mestre sem combate: jogador comum só no próprio personagem; o dono em qualquer um", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso", kinds: ["human", "human", "opex"] })
        await expect(answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["Nala"], valor: 10, motivo: "x" }), 1)).rejects.toThrow("só pode receber XP no próprio personagem")
        await expect(answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["grupo"], valor: 10, motivo: "x" }), 1)).rejects.toThrow("só pode receber XP no próprio personagem")
        await answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["Uther"], valor: 25, motivo: "Ideia que salvou o grupo." }), 1)
        expect(await xpOf(t.members[1]!)).toBe(25)
        await answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["Vaelyra"], valor: 40, motivo: "Correção do dono." }), 0, true)
        expect(await xpOf(t.members[2]!)).toBe(40)
        expect(await xpOf(t.members[0]!)).toBe(0)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: t.campaignId, kind: "experience", "experience.source": "grant" })).toBe(2)
    })

    it("recusas com motivo: modo Marco, grau sem ficha, ficha não concluída e combate ainda ativo", async () => {
        const marco = await table({ mode: "marco" })
        await expect(answer(marco, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: marco.campaignId, turnNumber: 5, jobId }, { personagens: ["Nala"], valor: 10, motivo: "x" }), 0, true)).rejects.toThrow("modo Marco: não há XP. O grupo sobe pelos marcos da história; para avaliar agora, use evaluate_level_milestone")
        const narrative = await table({ rigor: "narrativo", mode: null })
        await expect(answer(narrative, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: narrative.campaignId, turnNumber: 5, jobId }, { personagens: ["Nala"], valor: 10, motivo: "x" }), 0, true)).rejects.toThrow("não tem experiência nem nível")
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        await MaddoxCharacterModel.updateOne({ _id: t.members[1]!.characterId }, { $set: { "interview.status": "in-progress" } })
        await expect(answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["Uther"], valor: 10, motivo: "x" }), 0, true)).rejects.toThrow("Uther ainda não tem ficha concluída")
        await expect(answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["Nala"], valor: 0, motivo: "x" }), 0, true)).rejects.toThrow("Entrada inválida")
        const active = await beastCombat(t, { status: "active" })
        await expect(answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["grupo"], valor: 10, motivo: "x", combate: String(active._id) }), 0, true)).rejects.toThrow("ainda não terminou")
        expect(await xpOf(t.members[0]!)).toBe(0)
    })

    it("combate queimado antes da DND-70 (experienceGranted sem card) é pendência legada; o dos ratos, com card, não", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        const burned = await beastCombat(t, { experienceGranted: true })
        const rats = await beastCombat(t, { title: "Ratos no porão de Halvar", experienceGranted: true })
        await MaddoxCampaignMessageModel.create({ campaignId: t.campaignId, turnNumber: 13, phase: "master", kind: "experience", content: "", experience: { source: "combat", reason: 'Combate "Ratos no porão de Halvar"', total: 74, entries: [] } })
        const { pendingCombatExperience } = await import("@/features/maddox/server/combat-experience")
        const pending = await pendingCombatExperience(t.campaignId)
        expect(pending.map((item) => item.combatId)).toEqual([String(burned._id)])
        expect(pending[0]).toMatchObject({ legacy: true, adversaries: [{ name: "A besta da estrada sul", quantity: 1 }] })
        await expect(answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["grupo"], valor: 50, motivo: "x", combate: String(rats._id) }), 0, true)).rejects.toThrow("não tem XP pendente")
        await answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["grupo"], valor: 50, motivo: "Fera comparável a ND 1/2.", combate: String(burned._id) }), 0, true)
        expect(await xpOf(t.members[0]!)).toBe(50)
        await expect(pendingCombatExperience(t.campaignId)).resolves.toEqual([])
    })

    it("pendência sem participante com ficha concluída não fica na tarefa para sempre e a recusa explica o motivo", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        const gone = await beastCombat(t, { experienceGranted: true, tactical: { characters: t.members.slice(0, 2).map((member) => ({ characterId: String(member.characterId), name: member.name, left: true })) } })
        const notReady = await beastCombat(t, { title: "Lobos", experienceGranted: true, tactical: { characters: [{ characterId: String(t.members[2]!.characterId), name: t.members[2]!.name, left: false }] } })
        await MaddoxCharacterModel.updateOne({ _id: t.members[2]!.characterId }, { $set: { "interview.status": "in-progress" } })
        const { pendingCombatExperience } = await import("@/features/maddox/server/combat-experience")
        await expect(pendingCombatExperience(t.campaignId)).resolves.toEqual([])
        await expect(answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["grupo"], valor: 50, motivo: "x", combate: String(notReady._id) }), 0, true)).rejects.toThrow('Nenhum participante do combate "Lobos" tem ficha concluída')
        expect(String(gone._id)).not.toBe(String(notReady._id))
    })

    it("combate em processamento pela etapa automática nunca parece legado (sem corrida com a XP oficial)", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        const goblin = new Types.ObjectId()
        await mongoose.connection.collection("monsters").insertOne({ _id: goblin, name: "Goblin", challengeRating: "1/4", status: "active" })
        const combat = await beastCombat(t, { title: "Goblins", combatants: [{ name: "Goblin", nameKey: "goblin", side: "inimigo", quantity: 2, outcome: "morto", tactical: { defeated: true, stats: { source: "catalog", monsterId: String(goblin) } } }] })
        const { pendingCombatExperience } = await import("@/features/maddox/server/combat-experience")
        // A pendência é lida enquanto a XP oficial ainda está sendo gravada (claim feito, card ainda não).
        const spy = vi.spyOn(levels, "grantExperience")
        let during: unknown = null
        const create = MaddoxCampaignMessageModel.create.bind(MaddoxCampaignMessageModel)
        const createSpy = vi.spyOn(MaddoxCampaignMessageModel, "create").mockImplementationOnce((async (...args: Parameters<typeof create>) => {
            during = await pendingCombatExperience(t.campaignId)
            return create(...args)
        }) as never)
        await expect(grantCombatExperience(t.campaignId, (await MaddoxCombatModel.findById(combat._id).lean())!, 5)).resolves.toEqual({ granted: 100, pending: [] })
        createSpy.mockRestore()
        spy.mockRestore()
        expect(during).toEqual([])
        expect((await MaddoxCombatModel.findById(combat._id).lean())!.experienceProcessedAt).toBeInstanceOf(Date)
        await expect(pendingCombatExperience(t.campaignId)).resolves.toEqual([])
    })

    it("falha depois de somar fichas mantém o combate resolvido (não duplica); falha antes de somar reabre a pendência", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        const combat = await beastCombat(t)
        await grantCombatExperience(t.campaignId, (await MaddoxCombatModel.findById(combat._id).lean())!, 34)
        const { pendingCombatExperience } = await import("@/features/maddox/server/combat-experience")
        // Antes de qualquer ficha: a pendência volta e o mestre pode tentar de novo.
        const incSpy = vi.spyOn(CharacterSheet.collection, "findOneAndUpdate").mockRejectedValueOnce(new Error("banco fora do ar"))
        await answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["grupo"], valor: 50, motivo: "Fera ND 1/2.", combate: String(combat._id) }), 0, true)
        incSpy.mockRestore()
        expect((await MaddoxCombatModel.findById(combat._id).lean())!.experienceResolved ?? null).toBeNull()
        expect(await xpOf(t.members[0]!)).toBe(0)
        await expect(pendingCombatExperience(t.campaignId)).resolves.toHaveLength(1)
        // Depois de somar as fichas (o card falha): o combate fica resolvido com o total parcial e sai das pendências.
        const createSpy = vi.spyOn(MaddoxCampaignMessageModel, "create").mockRejectedValueOnce(new Error("card falhou") as never)
        await answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["grupo"], valor: 50, motivo: "Fera ND 1/2.", combate: String(combat._id) }), 0, true)
        createSpy.mockRestore()
        expect(await xpOf(t.members[0]!)).toBe(50)
        expect(await xpOf(t.members[1]!)).toBe(50)
        expect((await MaddoxCombatModel.findById(combat._id).lean())!.experienceResolved).toMatchObject({ by: "master", amount: 50, total: 100, partial: true })
        await expect(pendingCombatExperience(t.campaignId)).resolves.toEqual([])
        await expect(answer(t, (jobId) => runMaddoxTool(tool("grant_experience"), { campaignId: t.campaignId, turnNumber: 5, jobId }, { personagens: ["grupo"], valor: 50, motivo: "x", combate: String(combat._id) }), 0, true)).rejects.toThrow("já foi concedida")
        expect(await xpOf(t.members[0]!)).toBe(50)
    })

    it("falha da etapa automática depois do claim: os derrotados viram pendência (nada some em silêncio)", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        const goblin = new Types.ObjectId()
        await mongoose.connection.collection("monsters").insertOne({ _id: goblin, name: "Goblin", challengeRating: "1/4", status: "active" })
        const combat = await beastCombat(t, { combatants: [{ name: "Goblin", nameKey: "goblin", side: "inimigo", quantity: 2, outcome: "morto", tactical: { defeated: true, stats: { source: "catalog", monsterId: String(goblin) } } }, { name: "A besta da estrada sul", nameKey: "a besta", side: "inimigo", quantity: 1, outcome: "morto", tactical: { defeated: true, stats: { source: "custom", monsterId: null } } }] })
        const { MonsterModel } = await import("@/features/monsters/models/monster")
        const find = vi.spyOn(MonsterModel, "find").mockImplementationOnce(() => {
            throw new Error("banco fora do ar")
        })
        await expect(grantCombatExperience(t.campaignId, (await MaddoxCombatModel.findById(combat._id).lean())!, 34)).rejects.toThrow("banco fora do ar")
        find.mockRestore()
        expect((await MaddoxCombatModel.findById(combat._id).lean())!.experiencePending).toMatchObject({ adversaries: [{ name: "Goblin", quantity: 2 }, { name: "A besta da estrada sul", quantity: 1 }] })
        const { pendingCombatExperience } = await import("@/features/maddox/server/combat-experience")
        await expect(pendingCombatExperience(t.campaignId)).resolves.toEqual([expect.objectContaining({ combatId: String(combat._id), legacy: false })])
        expect(await xpOf(t.members[0]!)).toBe(0)
    })

    it("se nem a pendência grava, o claim perde a marca de processamento e o combate volta a ser pendência recuperável", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        const combat = await beastCombat(t)
        const update = MaddoxCombatModel.updateOne.bind(MaddoxCombatModel)
        // Toda gravação da pendência falha (a da etapa e a do tratamento da falha); o claim e o desfazer passam.
        const updateSpy = vi.spyOn(MaddoxCombatModel, "updateOne").mockImplementation(((...args: Parameters<typeof update>) => {
            if (JSON.stringify(args[1] ?? {}).includes("experiencePending")) return Promise.reject(new Error("pendência falhou"))
            return update(...args)
        }) as never)
        await expect(grantCombatExperience(t.campaignId, (await MaddoxCombatModel.findById(combat._id).lean())!, 34)).rejects.toThrow("pendência falhou")
        updateSpy.mockRestore()
        const stored = (await MaddoxCombatModel.findById(combat._id).lean())!
        expect(stored.experienceGranted).toBe(true)
        expect(stored.experienceProcessedAt ?? null).toBeNull()
        const { pendingCombatExperience } = await import("@/features/maddox/server/combat-experience")
        await expect(pendingCombatExperience(t.campaignId)).resolves.toEqual([expect.objectContaining({ combatId: String(combat._id), legacy: true })])
    })

    it("processo caído depois do claim: claim antigo sem card nem pendência vira pendência recuperável; o recente não", async () => {
        const t = await table({ mode: "experiencia", rigor: "rigoroso" })
        const { pendingCombatExperience, MADDOX_XP_PROCESSING_STALE_MS } = await import("@/features/maddox/server/combat-experience")
        const stale = await beastCombat(t, { experienceGranted: true, experienceProcessedAt: new Date(Date.now() - MADDOX_XP_PROCESSING_STALE_MS - 60_000) })
        await beastCombat(t, { title: "Lobos", experienceGranted: true, experienceProcessedAt: new Date() })
        await expect(pendingCombatExperience(t.campaignId)).resolves.toEqual([expect.objectContaining({ combatId: String(stale._id), legacy: true })])
    })

    it("regra do narrador: fera fora do catálogo vale XP e nunca \"não posso conceder\"", async () => {
        const { progressionRule } = await import("@/features/maddox/server/narrator-prompt")
        const rule = progressionRule({ mode: "experiencia", level: 1 })
        expect(rule).toContain("Adversário fora do catálogo (fera, animal, criatura com bloco próprio) CONTINUA valendo XP")
        expect(rule).toContain("Nunca diga que não pode conceder XP")
    })
})

describe("Personagem Opex e a ficha da campanha", () => {
    it("o Opex decide e o servidor aplica sem clique; o card mostra concluído", async () => {
        const t = await table()
        await levels.declareGroupLevelUp(t.campaignId, { reason: "Fim da emboscada.", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        const opexStep = (await campaignOf(t.campaignId)).levelUps!.find((step) => step.kind === "opex")!
        await runOpexLevelUp(t.campaignId, opexStep._id)
        const done = (await campaignOf(t.campaignId)).levelUps!.find((step) => String(step._id) === String(opexStep._id))!
        expect(done).toMatchObject({ status: "done", doneBy: "opex", gains: expect.objectContaining({ toLevel: 2, hp: expect.objectContaining({ method: "roll" }), traits: ["Surto de Ação"] }) })
        const sheet = (await CharacterSheet.findById(t.members[1]!.sheetId).lean())!
        expect(sheet.level).toBe(2)
        // PV atual sobe junto com o máximo (DND-64): a ficha cheia (12/12) continua cheia.
        expect(sheet.hpMax).toBeGreaterThan(12)
        expect(sheet.hpCurrent).toBe(sheet.hpMax)
        expect(opex.decide).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining("Surto de Ação") }))
    })

    it("falha depois da nova tentativa: fica para o dono com o motivo amigável; o erro técnico só no registro", async () => {
        const t = await table()
        await levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        const opexStep = (await campaignOf(t.campaignId)).levelUps!.find((step) => step.kind === "opex")!
        opex.decide.mockRejectedValue(new Error("MARCADOR-PROVEDOR"))
        await runOpexLevelUp(t.campaignId, opexStep._id)
        const campaign = await campaignOf(t.campaignId)
        expect(campaign.levelUps!.find((step) => String(step._id) === String(opexStep._id))).toMatchObject({ status: "failed", error: MADDOX_LEVEL_UP_OPEX_FAILURE.generic, errorDetail: "MARCADOR-PROVEDOR" })
        const forOwner = await levels.viewerLevelUps(campaign, { memberId: String(t.members[0]!.memberId), isOwner: true })
        expect(forOwner.map((step) => [step.characterName, step.canComplete, step.canRetry])).toEqual([["Nala", true, false], ["Uther", true, true]])
        expect(forOwner.find((step) => step.characterName === "Uther")!.error).toBe(MADDOX_LEVEL_UP_OPEX_FAILURE.generic)
        expect(JSON.stringify(forOwner)).not.toContain("MARCADOR")
        const lookups = await levels.levelUpLookups(campaign)
        const forPlayer = levels.levelUpStepDto(campaign.levelUps!.find((step) => String(step._id) === String(opexStep._id))!, { memberId: "outro", isOwner: false }, lookups.actionable, lookups.sheetIds)
        expect(forPlayer.error).not.toContain("MARCADOR")
        expect(forPlayer.canComplete).toBe(false)
        expect(forPlayer.canRetry).toBe(false)
        // O dono conclui no wizard da ficha do Opex (ele é o dono da ficha).
        await applySheetLevelUp(String(t.members[1]!.sheetId), { userId: t.owner, checkOwner: true }, { targetLevel: 2, hp: { method: "average" } })
        expect((await campaignOf(t.campaignId)).levelUps!.find((step) => String(step._id) === String(opexStep._id))!.status).toBe("done")
    })

    const failOpex = async (t: Table) => {
        await levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        const opexStep = (await campaignOf(t.campaignId)).levelUps!.find((step) => step.kind === "opex")!
        await runOpexLevelUp(t.campaignId, opexStep._id)
        return (await campaignOf(t.campaignId)).levelUps!.find((step) => String(step._id) === String(opexStep._id))!
    }

    it("erro técnico de qualquer Error nunca vai ao card: só o texto genérico", async () => {
        const t = await table()
        opex.decide.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'x') — provedor"))
        const failed = await failOpex(t)
        expect(failed).toMatchObject({ status: "failed", error: MADDOX_LEVEL_UP_OPEX_FAILURE.generic })
        expect(failed.errorDetail).toContain("Cannot read properties")
    })

    it("erro de domínio (Agente Maddox indisponível) chega ao dono com o texto do domínio", async () => {
        const t = await table()
        const { DomainError } = await import("@/lib/api/route")
        opex.decide.mockRejectedValue(new DomainError(409, "O \"Agente Maddox\" não está disponível. Fale com um administrador.", "MADDOX_UNAVAILABLE"))
        const failed = await failOpex(t)
        expect(failed).toMatchObject({ status: "failed", error: "O \"Agente Maddox\" não está disponível. Fale com um administrador." })
        const forOwner = await levels.viewerLevelUps(await campaignOf(t.campaignId), { memberId: String(t.members[0]!.memberId), isOwner: true })
        expect(forOwner.find((step) => step.characterName === failed.characterName)!.error).toBe("O \"Agente Maddox\" não está disponível. Fale com um administrador.")
    })

    it("escolha recusada duas vezes pelas regras (422): o motivo da validação vai ao dono", async () => {
        const t = await table()
        const asi = new Types.ObjectId()
        await mongoose.connection.collection("traits").insertOne({ _id: asi, name: "Aumento no Valor de Atributo", description: "Talento.", status: "active" })
        await mongoose.connection.collection("characterclasses").updateMany({}, { $push: { traits: { level: 2, description: mention(asi, "Aumento no Valor de Atributo") } } as never })
        opex.decide.mockResolvedValue({ pv: "media", truques: [], magias: [], talento: { id: "inexistente", atributos: {} } })
        const failed = await failOpex(t)
        expect(failed).toMatchObject({ status: "failed", error: MADDOX_LEVEL_UP_OPEX_FAILURE.invalidChoice("Escolha um talento para confirmar o nível 2.") })
        expect(opex.decide).toHaveBeenCalledTimes(2)
        expect(opex.decide).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: expect.stringContaining("Escolha um talento para confirmar o nível 2.") }))
    })

    it("Personagem Opex que perdeu a ficha depois da declaração: motivo amigável para o dono", async () => {
        const t = await table()
        await levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        const step = (await campaignOf(t.campaignId)).levelUps!.find((item) => String(item.characterId) === String(t.members[1]!.characterId))!
        await MaddoxCharacterModel.collection.updateOne({ _id: t.members[1]!.characterId }, { $set: { sheetId: null } })
        await runOpexLevelUp(t.campaignId, step._id)
        expect((await campaignOf(t.campaignId)).levelUps!.find((item) => String(item._id) === String(step._id))).toMatchObject({ status: "failed", error: MADDOX_LEVEL_UP_OPEX_FAILURE.noSheet })
        expect(opex.decide).not.toHaveBeenCalled()
    })

    it("ficha fora do nível do degrau: o motivo em linguagem de mesa vai ao dono", async () => {
        const t = await table()
        await levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        const opexStep = (await campaignOf(t.campaignId)).levelUps!.find((step) => step.kind === "opex")!
        await CharacterSheet.collection.updateOne({ _id: t.members[1]!.sheetId }, { $set: { level: 3 } })
        await runOpexLevelUp(t.campaignId, opexStep._id)
        const failed = (await campaignOf(t.campaignId)).levelUps!.find((step) => String(step._id) === String(opexStep._id))!
        expect(failed).toMatchObject({ status: "failed", error: MADDOX_LEVEL_UP_OPEX_FAILURE.levelMismatch(3, 2) })
    })

    it("\"Tentar de novo\" do dono: o degrau volta a pendente e o Opex decide e conclui", async () => {
        const t = await table()
        await levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        const opexStep = (await campaignOf(t.campaignId)).levelUps!.find((step) => step.kind === "opex")!
        opex.decide.mockRejectedValueOnce(new Error("Attempted to call appendMentionsToHtml() from the server"))
        await runOpexLevelUp(t.campaignId, opexStep._id)
        expect((await campaignOf(t.campaignId)).levelUps!.find((step) => String(step._id) === String(opexStep._id))!.status).toBe("failed")

        await expect(retryOpexLevelUp(String(t.campaignId), String(opexStep._id), "player-x")).rejects.toMatchObject({ status: 404 })
        await MaddoxCampaignMemberModel.collection.insertOne({ campaignId: t.campaignId, userId: "player-x", kind: "human", role: "player", status: "joined" })
        await expect(retryOpexLevelUp(String(t.campaignId), String(opexStep._id), "player-x")).rejects.toMatchObject({ status: 403 })
        const nala = (await campaignOf(t.campaignId)).levelUps!.find((step) => step.kind === "human")!
        await expect(retryOpexLevelUp(String(t.campaignId), String(nala._id), t.owner)).rejects.toMatchObject({ status: 404 })

        const state = await retryOpexLevelUp(String(t.campaignId), String(opexStep._id), t.owner)
        expect(state.campaignId).toBe(String(t.campaignId))
        await waitForOpexIdle()
        const done = (await campaignOf(t.campaignId)).levelUps!.find((step) => String(step._id) === String(opexStep._id))!
        expect(done).toMatchObject({ status: "done", doneBy: "opex", error: null, errorDetail: null })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: t.owner, depois: expect.objectContaining({ opex: "retry" }) }))
        await expect(retryOpexLevelUp(String(t.campaignId), String(opexStep._id), t.owner)).rejects.toMatchObject({ status: 409 })
    })

    it("\"Tentar de novo\" com o Personagem Opex fora da mesa: recusa e o degrau fica para o wizard", async () => {
        const t = await table()
        await levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        const opexStep = (await campaignOf(t.campaignId)).levelUps!.find((step) => step.kind === "opex")!
        await MaddoxCampaignModel.collection.updateOne({ _id: t.campaignId, "levelUps._id": opexStep._id }, { $set: { "levelUps.$.status": "failed" } })
        await MaddoxCampaignMemberModel.collection.updateOne({ _id: opexStep.memberId }, { $set: { status: "left" } })
        await expect(retryOpexLevelUp(String(t.campaignId), String(opexStep._id), t.owner)).rejects.toMatchObject({ status: 409 })
        expect((await campaignOf(t.campaignId)).levelUps!.find((step) => String(step._id) === String(opexStep._id))!.status).toBe("failed")
    })

    it("ficha de campanha só sobe com a subida pendente; nível e XP (modo Experiência) não mudam pelo PATCH", async () => {
        const t = await table({ mode: "experiencia" })
        const sheetId = String(t.members[0]!.sheetId)
        await expect(applySheetLevelUp(sheetId, { userId: t.owner, checkOwner: true }, { targetLevel: 2, hp: { method: "average" } })).rejects.toThrow("XP do próximo nível")
        await expect(getSheetLevelUp(sheetId, { userId: t.owner, checkOwner: true }, null, true)).resolves.toMatchObject({ campaign: { mode: "experiencia", stepId: null, blocked: expect.any(String) } })
        await expect(campaignPatchRefusal(sheetId, { experience: 10 })).resolves.toBe("A XP desta ficha é controlada pelo Maddox.")
        await expect(campaignPatchRefusal(sheetId, { level: 3 })).resolves.toContain("subida de nível da campanha")
        await expect(campaignPatchRefusal(sheetId, { hpCurrent: 3 } as never)).resolves.toBeNull()
        await levels.grantExperience(t.campaignId, [{ characterId: t.members[0]!.characterId, amount: 300 }], "Feito", "grant", 5)
        const state = await getSheetLevelUp(sheetId, { userId: t.owner, checkOwner: true }, null, true)
        expect(state.campaign).toMatchObject({ toLevel: 2, status: "pending", blocked: null })
        await expect(applySheetLevelUp(sheetId, { userId: "outro", checkOwner: true }, { targetLevel: 2, hp: { method: "average" } })).rejects.toMatchObject({ status: 404 })
        const { gains } = await applySheetLevelUp(sheetId, { userId: t.owner, checkOwner: true }, { targetLevel: 2, hp: { method: "average" } })
        expect(gains.toLevel).toBe(2)
        expect((await campaignOf(t.campaignId)).levelUps![0]!.status).toBe("done")
    })

    it("ficha fora de campanha sobe livre", async () => {
        const classId = await catalog()
        const sheetId = new Types.ObjectId()
        await CharacterSheet.collection.insertOne({ _id: sheetId, slug: "solta", userId: "u1", name: "Solta", level: 1, experience: 0, classRef: classId, hpMax: 12, hpCurrent: 12, strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10, classFeatures: "", speciesTraits: "", featuresNotes: "", spellSlots: {}, resourceCharges: [], createdAt: new Date(), updatedAt: new Date() })
        await expect(campaignPatchRefusal(String(sheetId), { level: 4 })).resolves.toBeNull()
        await expect(applySheetLevelUp(String(sheetId), { userId: "u1", checkOwner: true }, { targetLevel: 2, hp: { method: "average" } })).resolves.toMatchObject({ gains: { toLevel: 2 } })
    })
})

describe("trava da ficha de campanha em todos os caminhos de escrita (F1)", () => {
    const owlbear = (method: "PATCH" | "GET" | "POST", sheetId: string, body?: unknown, query = "") =>
        new NextRequest(`http://localhost/api/owlbear/character-sheets/${sheetId}${method === "PATCH" ? "" : "/level-up"}${query}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) })

    it("serviço de PATCH (dono e acesso Owlbear) recusa nível e XP do modo Experiência; outros campos passam", async () => {
        const t = await table({ mode: "experiencia" })
        const sheetId = String(t.members[0]!.sheetId)
        await expect(patchSheet(sheetId, t.owner, { level: 20 })).rejects.toBeInstanceOf(CampaignSheetPatchError)
        await expect(patchSheetWithAccess(sheetId, { experience: 355_000 })).rejects.toThrow("A XP desta ficha é controlada pelo Maddox.")
        await expect(patchSheetWithAccess(sheetId, { hpCurrent: 3 })).resolves.toMatchObject({ hpCurrent: 3 })
        expect((await CharacterSheet.findById(sheetId).lean())).toMatchObject({ level: 1, experience: 0 })
    })

    it("PATCH do Owlbear responde 409 com a mensagem e não grava", async () => {
        const t = await table({ mode: "experiencia" })
        const sheetId = String(t.members[0]!.sheetId)
        const res = await owlbearRoutes.patchOwlbearSheet(owlbear("PATCH", sheetId, { experience: 355_000, level: 20 }), sheetId)
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({ error: expect.stringContaining("subida de nível da campanha") })
        expect((await CharacterSheet.findById(sheetId).lean())).toMatchObject({ level: 1, experience: 0 })
    })

    it("update_sheet do Agente Opex recusa nível e XP da ficha de campanha", async () => {
        const t = await table({ mode: "experiencia" })
        const sheetId = String(t.members[0]!.sheetId)
        const tool = findOpexTool("update_sheet")!
        const context = { scope: { kind: "user", actor: { id: t.owner } } } as never
        await expect(tool.execute({ id: sheetId, fieldsJson: JSON.stringify({ experience: 355_000 }) } as never, context)).rejects.toThrow("A XP desta ficha é controlada pelo Maddox.")
        await expect(tool.execute({ id: sheetId, fieldsJson: JSON.stringify({ level: 20 }) } as never, context)).rejects.toThrow("subida de nível da campanha")
        expect((await CharacterSheet.findById(sheetId).lean())).toMatchObject({ level: 1, experience: 0 })
    })

    it("GET/POST de subida pelo Owlbear: sem pendência, 409; com pendência, sobe", async () => {
        const t = await table()
        const sheetId = String(t.members[0]!.sheetId)
        const status = await owlbearRoutes.getOwlbearLevelUp(owlbear("GET", sheetId, undefined, "?situacao=1"), sheetId)
        expect(status.status).toBe(200)
        expect(await status.json()).toMatchObject({ campaign: { mode: "marco", stepId: null } })
        const refused = await owlbearRoutes.postOwlbearLevelUp(owlbear("POST", sheetId, { targetLevel: 2, hp: { method: "average" } }), sheetId)
        expect(refused.status).toBe(409)
        expect((await owlbearRoutes.postOwlbearLevelUp(owlbear("POST", sheetId, { targetLevel: "x" }), sheetId)).status).toBe(400)
        await levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "manual", offMilestone: true, turnNumber: 5 })
        const done = await owlbearRoutes.postOwlbearLevelUp(owlbear("POST", sheetId, { targetLevel: 2, hp: { method: "average" } }), sheetId)
        expect(done.status).toBe(200)
        expect(await done.json()).toMatchObject({ gains: { toLevel: 2 } })
        expect((await CharacterSheet.findById(sheetId).lean())!.level).toBe(2)
    })
})

describe("subida do Opex interrompida (F2)", () => {
    const deciding = async (t: Table) => {
        await levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        const step = (await campaignOf(t.campaignId)).levelUps!.find((item) => item.kind === "opex")!
        await MaddoxCampaignModel.collection.updateOne({ _id: t.campaignId, "levelUps._id": step._id }, { $set: { "levelUps.$.status": "deciding", "levelUps.$.decidingAt": new Date(Date.now() - 60 * 60_000) } })
        return step
    }
    const opexMap = async (t: Table) => new Map((await MaddoxCampaignMemberModel.find({ campaignId: t.campaignId, kind: "opex" }).lean()).map((member) => [String(member._id), member as never]))

    it("`deciding` sem execução neste processo (reinício) volta a ser decidido e conclui", async () => {
        const t = await table()
        const step = await deciding(t)
        expect(isOpexRunning(opexLevelUpKey(step._id))).toBe(false)
        await autoLevelUps(await campaignOf(t.campaignId), await opexMap(t))
        await waitForOpexIdle()
        expect((await campaignOf(t.campaignId)).levelUps!.find((item) => String(item._id) === String(step._id))).toMatchObject({ status: "done", doneBy: "opex" })
        expect(opex.decide).toHaveBeenCalled()
    })

    it("Personagem Opex fora da mesa: o degrau interrompido vai para o dono", async () => {
        const t = await table()
        const step = await deciding(t)
        await autoLevelUps(await campaignOf(t.campaignId), new Map())
        const campaign = await campaignOf(t.campaignId)
        expect(campaign.levelUps!.find((item) => String(item._id) === String(step._id))).toMatchObject({ status: "failed", error: MADDOX_LEVEL_UP_OPEX_FAILURE.interrupted })
        const forOwner = await levels.viewerLevelUps(campaign, { memberId: String(t.members[0]!.memberId), isOwner: true })
        expect(forOwner.find((item) => item.characterName === step.characterName)).toMatchObject({ canComplete: true })
        expect(opex.decide).not.toHaveBeenCalled()
    })

    it("a decisão em andamento marca `decidingAt`", async () => {
        const t = await table()
        await levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        const step = (await campaignOf(t.campaignId)).levelUps!.find((item) => item.kind === "opex")!
        let seen: unknown = null
        opex.decide.mockImplementationOnce(async () => {
            seen = (await campaignOf(t.campaignId)).levelUps!.find((item) => String(item._id) === String(step._id))
            return { pv: "media", truques: [], magias: [] }
        })
        await runOpexLevelUp(t.campaignId, step._id)
        expect(seen).toMatchObject({ status: "deciding", decidingAt: expect.any(Date) })
    })
})

describe("caminhos laterais da progressão (F3)", () => {
    it("quem conclui a ficha depois de uma declaração recebe as subidas pendentes até o nível declarado", async () => {
        const t = await table()
        const late = t.members[2]!
        await MaddoxCharacterModel.collection.updateOne({ _id: late.characterId }, { $set: { "interview.status": "in-progress" } })
        await levels.declareGroupLevelUp(t.campaignId, { reason: "a", trigger: "manual", offMilestone: true, turnNumber: 5 })
        await levels.declareGroupLevelUp(t.campaignId, { reason: "b", trigger: "manual", offMilestone: true, turnNumber: 6 })
        expect((await campaignOf(t.campaignId)).levelUps!.filter((step) => String(step.characterId) === String(late.characterId))).toHaveLength(0)
        await MaddoxCharacterModel.collection.updateOne({ _id: late.characterId }, { $set: { "interview.status": "done" } })
        await expect(levels.catchUpLevelUps(t.campaignId, late.characterId)).resolves.toBe(2)
        const steps = (await campaignOf(t.campaignId)).levelUps!.filter((step) => String(step.characterId) === String(late.characterId))
        expect(steps.map((step) => [step.fromLevel, step.toLevel, step.status])).toEqual([[1, 2, "pending"], [2, 3, "pending"]])
        const card = await MaddoxCampaignMessageModel.findById(steps[0]!.messageId).lean()
        expect(card!.levelUp!.toLevel).toBe(3)
        expect(card!.levelUp!.levelUpIds.map(String)).toEqual(expect.arrayContaining(steps.map((step) => String(step._id))))
        await expect(levels.catchUpLevelUps(t.campaignId, late.characterId)).resolves.toBe(0)
        const xp = await table({ mode: "experiencia" })
        await expect(levels.catchUpLevelUps(xp.campaignId, xp.members[0]!.characterId)).resolves.toBe(0)
    })

    it("voltar a um turno repõe progressão, subidas e capítulos; retrato antigo sem progressão não mexe", async () => {
        const t = await table()
        const base = { campaignId: t.campaignId, state: {}, npcs: [], characters: [], sheets: [], combats: [], combatIds: [], preps: [], messages: [], opexRuns: [] }
        const before = await campaignOf(t.campaignId)
        const snapshot = { ...base, progression: { progression: before.progression ?? null, levelUps: before.levelUps ?? [], chapters: before.chapters ?? [] } }
        await levels.declareGroupLevelUp(t.campaignId, { reason: "a", trigger: "manual", offMilestone: true, turnNumber: 5 })
        await MaddoxCampaignModel.collection.updateOne({ _id: t.campaignId }, { $push: { chapters: { _id: new Types.ObjectId(), title: "Ato", summary: "", turnNumber: 5, createdAt: new Date() } } as never })
        await restoreSnapshot({ ...base, progression: null } as never)
        expect((await campaignOf(t.campaignId)).levelUps).toHaveLength(3)
        await restoreSnapshot(snapshot as never)
        const after = await campaignOf(t.campaignId)
        expect(after.levelUps ?? []).toHaveLength(0)
        expect(after.chapters ?? []).toHaveLength(0)
        expect(after.progression!.declared).toEqual([])
    })

    it("migração da XP texto → número (\"\" → 0, \"300\" → 300, número intacto)", async () => {
        const ids = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()]
        await CharacterSheet.collection.insertMany([
            { _id: ids[0], slug: "a", userId: "u", name: "A", experience: "" },
            { _id: ids[1], slug: "b", userId: "u", name: "B", experience: "300" },
            { _id: ids[2], slug: "c", userId: "u", name: "C", experience: 900 },
        ])
        await sheetExperienceNumber()
        const rows = await CharacterSheet.collection.find({ _id: { $in: ids } }).toArray()
        expect(Object.fromEntries(rows.map((row) => [row.name, row.experience]))).toEqual({ A: 0, B: 300, C: 900 })
        await sheetExperienceNumber()
        expect((await CharacterSheet.collection.findOne({ _id: ids[1] }))!.experience).toBe(300)
    })

    it("Diário: capítulos do mais recente para o mais antigo", async () => {
        const t = await table()
        await MaddoxCampaignModel.collection.updateOne({ _id: t.campaignId }, { $set: { chapters: [
            { _id: new Types.ObjectId(), title: "Primeiro", summary: "Início.", turnNumber: 2, createdAt: new Date(1_000) },
            { _id: new Types.ObjectId(), title: "Segundo", summary: "Meio.", turnNumber: 7, createdAt: new Date(2_000) },
        ] } })
        const result = await listJournalChapters(String(t.campaignId), t.owner)
        expect(result.items.map((item) => [item.title, item.summary, item.turnNumber])).toEqual([["Segundo", "Meio.", 7], ["Primeiro", "Início.", 2]])
    })
})
