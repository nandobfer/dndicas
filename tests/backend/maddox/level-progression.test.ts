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
    opexPromptContext: vi.fn(async () => ({ instructions: "", memories: "", basePrompt: "", campaign: { name: "Phandelver", rigor: "fiel-dnd", setting: "", openingSituation: "", state: { scene: "", location: "", situation: "", pendingDecision: "" } }, character: null })),
    decideOpex: opex.decide,
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
const { runOpexLevelUp } = await import("@/features/maddox/server/level-up-opex")
const { applySheetLevelUp, campaignPatchRefusal, getSheetLevelUp } = await import("@/features/character-sheets/level-up/level-up-service")

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
        await expect(grantCombatExperience(t.campaignId, stored, 5)).resolves.toBe(100)
        await expect(grantCombatExperience(t.campaignId, stored, 5)).resolves.toBe(0)
        for (const member of t.members) expect((await CharacterSheet.findById(member.sheetId).lean())!.experience).toBe(33)
        expect((await MaddoxCampaignMessageModel.findOne({ kind: "experience" }).lean())!.experience).toMatchObject({ source: "combat", total: 99 })
    })

    it("combate narrativo e modo Marco não dão XP automática", async () => {
        const t = await table({ mode: "marco" })
        const combat = { _id: new Types.ObjectId(), campaignId: t.campaignId, status: "ended", mode: "tactical", title: "x", combatants: [], tactical: { characters: [] } }
        await MaddoxCombatModel.collection.insertOne(combat)
        await expect(grantCombatExperience(t.campaignId, (await MaddoxCombatModel.findById(combat._id).lean())!, 5)).resolves.toBe(0)
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
        expect((await CharacterSheet.findById(t.members[1]!.sheetId).lean())!.level).toBe(2)
        expect(opex.decide).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining("Surto de Ação") }))
    })

    it("falha depois da nova tentativa: fica para o dono, com o motivo só para ele", async () => {
        const t = await table()
        await levels.declareGroupLevelUp(t.campaignId, { reason: "r", trigger: "combat-end", offMilestone: false, turnNumber: 5 })
        const opexStep = (await campaignOf(t.campaignId)).levelUps!.find((step) => step.kind === "opex")!
        opex.decide.mockRejectedValue(new Error("MARCADOR-PROVEDOR"))
        await runOpexLevelUp(t.campaignId, opexStep._id)
        const campaign = await campaignOf(t.campaignId)
        expect(campaign.levelUps!.find((step) => String(step._id) === String(opexStep._id))).toMatchObject({ status: "failed", error: expect.stringContaining("MARCADOR-PROVEDOR") })
        const forOwner = await levels.viewerLevelUps(campaign, { memberId: String(t.members[0]!.memberId), isOwner: true })
        expect(forOwner.map((step) => [step.characterName, step.canComplete])).toEqual([["Nala", true], ["Uther", true]])
        expect(forOwner.find((step) => step.characterName === "Uther")!.error).toContain("MARCADOR-PROVEDOR")
        const lookups = await levels.levelUpLookups(campaign)
        const forPlayer = levels.levelUpStepDto(campaign.levelUps!.find((step) => String(step._id) === String(opexStep._id))!, { memberId: "outro", isOwner: false }, lookups.actionable, lookups.sheetIds)
        expect(forPlayer.error).not.toContain("MARCADOR")
        expect(forPlayer.canComplete).toBe(false)
        // O dono conclui no wizard da ficha do Opex (ele é o dono da ficha).
        await applySheetLevelUp(String(t.members[1]!.sheetId), { userId: t.owner, checkOwner: true }, { targetLevel: 2, hp: { method: "average" } })
        expect((await campaignOf(t.campaignId)).levelUps!.find((step) => String(step._id) === String(opexStep._id))!.status).toBe("done")
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
