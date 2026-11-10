import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/** Combate tático ativo simulado para o `suggest_actions` (DND-30); os demais usos seguem o módulo real. */
const tacticalActive = { value: false }
vi.mock("@/features/maddox/server/tactical-combat", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/features/maddox/server/tactical-combat")>()
    return { ...actual, findActiveTactical: vi.fn(async (campaignId: mongoose.Types.ObjectId) => (tacticalActive.value ? ({ _id: campaignId } as never) : actual.findActiveTactical(campaignId))) }
})

vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)
// Configuração padrão sem banco: imagens desligadas, então o retrato automático do `save_npc` (DND-43) não pede nada.
vi.mock("@/features/maddox/server/settings", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/features/maddox/server/settings")>()
    const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
    return { ...actual, loadMaddoxSettings: vi.fn(async () => ({ settings: DEFAULT_MADDOX_SETTINGS, isDefault: true, updatedAt: null })) }
})

const { campaignMemoriesStore } = await import("../../helpers/campaign-memories-mock")

const { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel } = await import("@/features/maddox/models")
const { enqueueMaddoxJob, jobDraftChecks, takeDraftActionOptions, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { buildMaddoxAiTools, findMaddoxTool, runMaddoxTool, MaddoxToolError } = await import("@/features/maddox/server/master-tools")
const { MADDOX_ACTION_OPTION_TEXT_MAX, MADDOX_TOOL_TEXT_MAX } = await import("@/features/maddox/constants")

let mongo: MongoMemoryServer

const run = (name: string, campaignId: mongoose.Types.ObjectId, input: unknown, turnNumber = 1) => runMaddoxTool(findMaddoxTool(name)!, { campaignId, turnNumber }, input)

async function campaign() {
    return (await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "u1", rigor: "narrativo" }))._id
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_master_tools_test" })
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    campaignMemoriesStore.reset()
    tacticalActive.value = false
    await Promise.all([MaddoxCampaignModel.deleteMany({}), MaddoxNpcModel.deleteMany({}), MaddoxCharacterModel.deleteMany({})])
})

describe("ferramentas do Maddox narrador", () => {
    it("save_npc grava pelo nome sem acento e sem caixa, sem duplicar e mantendo a grafia gravada; get_npc traz as notas do mestre", async () => {
        const id = await campaign()
        expect(await run("save_npc", id, { name: "Ângela", publicDescription: "Taverneira.", masterNotes: "Espiã." })).toMatchObject({ created: true })
        expect(await run("save_npc", id, { name: "angela", status: "dead" })).toMatchObject({ created: false, name: "Ângela" })
        const npcs = await MaddoxNpcModel.find({ campaignId: id }).lean()
        expect(npcs).toHaveLength(1)
        expect(npcs[0]).toMatchObject({ name: "Ângela", publicDescription: "Taverneira.", masterNotes: "Espiã.", status: "dead" })
        expect(await run("get_npc", id, { name: "ANGELA" })).toMatchObject({ found: true, npc: { name: "Ângela", masterNotes: "Espiã." } })
        expect(await run("list_npcs", id, {})).toMatchObject({ npcs: [{ name: "Ângela" }] })
        expect((await run("list_npcs", id, {})) as { npcs: Record<string, unknown>[] }).not.toHaveProperty("npcs.0.masterNotes")
    })

    it("save_npc renomeia só com `newName` explícito e recusa um nome já usado por outro NPC", async () => {
        const id = await campaign()
        await run("save_npc", id, { name: "Ângela" })
        await run("save_npc", id, { name: "Bruno" })
        expect(await run("save_npc", id, { name: "angela", newName: "Ângela Ventobravo" })).toMatchObject({ created: false, name: "Ângela Ventobravo" })
        expect(await run("get_npc", id, { name: "angela ventobravo" })).toMatchObject({ found: true, npc: { name: "Ângela Ventobravo" } })
        expect(await run("get_npc", id, { name: "Ângela" })).toMatchObject({ found: false })
        await expect(run("save_npc", id, { name: "Bruno", newName: "ângela VENTOBRAVO" })).rejects.toThrow(/Já existe um NPC chamado/)
        expect(await MaddoxNpcModel.countDocuments({ campaignId: id })).toBe(2)
    })

    it("cada campanha só enxerga os próprios registros", async () => {
        const a = await campaign()
        const b = await campaign()
        await run("save_npc", a, { name: "Bartolomeu" })
        await run("save_memory", a, { kind: "local", title: "Farol", text: "Ao norte." })
        expect(await run("get_npc", b, { name: "Bartolomeu" })).toMatchObject({ found: false })
        expect(await run("search_memories", b, { query: "Farol" })).toEqual({ memories: [] })
    })

    it("save_memory: missão nasce ativa, atualiza por tipo + título e guarda o turno; busca por texto", async () => {
        const id = await campaign()
        await run("save_memory", id, { kind: "missao", title: "Reacender o farol", text: "Descobrir a causa." }, 2)
        await run("save_memory", id, { kind: "missao", title: "reacender o FAROL", text: "Concluída.", status: "concluida" }, 5)
        await run("save_memory", id, { kind: "local", title: "Reacender o farol", text: "Outro tipo, outro registro." }, 5)
        const quests = campaignMemoriesStore.all(String(id)).filter((item) => item.kind === "missao")
        expect(quests).toHaveLength(1)
        expect(quests[0]).toMatchObject({ status: "concluida", text: "Concluída.", turnNumber: 5 })
        const local = campaignMemoriesStore.all(String(id)).find((item) => item.kind === "local")
        expect(local!.status).toBeNull()
        expect(await run("search_memories", id, { query: "concluída" })).toMatchObject({ memories: [{ kind: "missao" }] })
        expect(await run("search_memories", id, { kind: "local" })).toMatchObject({ memories: [{ kind: "local" }] })
    })

    it("search_memories (Maddox 9): ignora acentos e caixa e acha por pedaço da palavra", async () => {
        const id = await campaign()
        await run("save_memory", id, { kind: "local", title: "Tavérna do Javali", text: "À beira da estrada." })
        for (const query of ["taverna", "TAVÉRNA", "javal", "a beira"]) expect(await run("search_memories", id, { query }), query).toMatchObject({ memories: [{ title: "Tavérna do Javali" }] })
        expect(await run("search_memories", id, { query: ".*" })).toEqual({ memories: [] })
    })

    it("estado e condição dos personagens avisam que os jogadores os leem (Maddox 9)", async () => {
        for (const name of ["update_campaign_state", "update_character_state"]) expect(findMaddoxTool(name)!.description, name).toContain("nunca grave segredos do mestre aqui")
    })

    it("teto de proteção: no limite grava inteiro; acima corta, não invalida a chamada e avisa o modelo (`truncated`)", async () => {
        const id = await campaign()
        const atLimit = await run("save_memory", id, { kind: "fato", title: "No limite", text: "x".repeat(MADDOX_TOOL_TEXT_MAX) })
        expect(atLimit).not.toHaveProperty("truncated")
        expect(campaignMemoriesStore.all(String(id)).find((item) => item.title === "No limite")!.text).toHaveLength(MADDOX_TOOL_TEXT_MAX)

        const over = await run("save_memory", id, { kind: "fato", title: "Acima", text: "y".repeat(MADDOX_TOOL_TEXT_MAX + 1) })
        expect(over).toMatchObject({ saved: true, truncated: ["text"], note: expect.stringContaining("Consolide") })
        const memory = campaignMemoriesStore.all(String(id)).find((item) => item.title === "Acima")
        expect(memory!.text).toHaveLength(MADDOX_TOOL_TEXT_MAX)
        expect(memory!.text.endsWith("…")).toBe(true)

        await MaddoxCharacterModel.create({ campaignId: id, memberId: new mongoose.Types.ObjectId(), userId: "u1", name: "Lyra" })
        expect(await run("update_character_state", id, { characterName: "Lyra", currentState: "z".repeat(MADDOX_TOOL_TEXT_MAX + 10) })).toMatchObject({ truncated: ["currentState"] })
        expect(await run("save_npc", id, { name: "Ana", masterNotes: "n".repeat(MADDOX_TOOL_TEXT_MAX + 1), publicDescription: "curta" })).toMatchObject({ truncated: ["masterNotes"] })
    })

    it("update_campaign_state grava só os campos enviados e o turno; get_campaign_state traz os personagens", async () => {
        const id = await campaign()
        await MaddoxCharacterModel.create({ campaignId: id, memberId: new mongoose.Types.ObjectId(), userId: "u1", name: "Lyra", currentState: "Ferida." })
        await run("update_campaign_state", id, { scene: "Cais", location: "Porto" }, 1)
        await run("update_campaign_state", id, { location: "Farol" }, 3)
        expect(await run("get_campaign_state", id, {})).toMatchObject({ state: { scene: "Cais", location: "Farol", updatedTurn: 3 }, characters: [{ name: "Lyra", currentState: "Ferida." }] })
    })

    it("update_character_state acha o personagem pelo nome e recusa quem não está na mesa", async () => {
        const id = await campaign()
        await MaddoxCharacterModel.create({ campaignId: id, memberId: new mongoose.Types.ObjectId(), userId: "u1", name: "Doran" })
        await run("update_character_state", id, { characterName: "doran", currentState: "Mão queimada." })
        expect((await MaddoxCharacterModel.findOne({ campaignId: id }).lean())!.currentState).toBe("Mão queimada.")
        await expect(run("update_character_state", id, { characterName: "Ninguém", currentState: "x" })).rejects.toBeInstanceOf(MaddoxToolError)
    })

    it("entrada inválida vira erro em pt-BR para o modelo", async () => {
        const id = await campaign()
        await expect(run("save_memory", id, { kind: "segredo", title: "x", text: "y" })).rejects.toThrow(/Entrada inválida para save_memory/)
    })
})

describe("request_check (Maddox 5)", () => {
    /** Roda `test` dentro de um job da fila com os metadados dados (como a geração do narrador). */
    async function inJob(campaignId: mongoose.Types.ObjectId, meta: { kind: "narration" | "answer"; round: number }, test: (jobId: string) => Promise<void>) {
        let failure: unknown = null
        await enqueueMaddoxJob(
            String(campaignId),
            "teste",
            async ({ jobId }) => {
                try {
                    await test(jobId)
                } catch (error) {
                    failure = error
                }
            },
            { ...meta, turnNumber: 2 },
        )
        await waitForCampaignIdle(String(campaignId))
        if (failure) throw failure
    }

    async function faithful(rigor: "fiel-dnd" | "narrativo" = "fiel-dnd") {
        const id = (await MaddoxCampaignModel.create({ name: "Cripta", ownerId: "u1", rigor }))._id
        const member = await MaddoxCampaignMemberModel.create({ campaignId: id, userId: "u2", role: "player", status: "joined" })
        const sheetId = new mongoose.Types.ObjectId()
        await MaddoxCharacterModel.create({ campaignId: id, memberId: member._id, userId: "u2", name: "Lyra", sheetId, interview: { status: "done", scriptVersion: 0 } })
        const other = await MaddoxCampaignMemberModel.create({ campaignId: id, userId: "u3", role: "player", status: "joined" })
        await MaddoxCharacterModel.create({ campaignId: id, memberId: other._id, userId: "u3", name: "Doran", sheetId: null, interview: { status: "done", scriptVersion: 0 } })
        return { id, memberId: String(member._id), sheetId: String(sheetId) }
    }

    const stealth = { personagem: "lyra", tipo: "pericia", pericia: "Furtividade", cd: 15, modo: "vantagem", motivo: "Passar pelos guardas" }
    const call = (id: mongoose.Types.ObjectId, jobId: string, input: unknown) => runMaddoxTool(findMaddoxTool("request_check")!, { campaignId: id, turnNumber: 2, jobId }, input)

    it("guarda o teste no job (nome sem caixa, atributo da perícia, modo e CD) e recusa um segundo para o mesmo personagem", async () => {
        const table = await faithful()
        await inJob(table.id, { kind: "narration", round: 0 }, async (jobId) => {
            const result = await call(table.id, jobId, stealth)
            expect(result).toMatchObject({ requested: true, check: "Furtividade (Destreza) para Lyra, CD 15, com vantagem" })
            expect(jobDraftChecks(String(table.id), jobId)).toEqual([
                expect.objectContaining({ memberId: table.memberId, characterName: "Lyra", sheetId: table.sheetId, kind: "skill", ability: "dexterity", skill: "Furtividade", dc: 15, mode: "advantage", reason: "Passar pelos guardas" }),
            ])
            await expect(call(table.id, jobId, stealth)).rejects.toThrow(/um teste por personagem/)
            await expect(call(table.id, jobId, { personagem: "Lyra", tipo: "resistencia", atributo: "Constituição", cd: 12, motivo: "Veneno" })).rejects.toThrow(/um teste por personagem/)
        })
    })

    it("motivo longo é gravado inteiro; só o teto de proteção corta, avisando o modelo (`truncated`)", async () => {
        const table = await faithful()
        const long = `Lyra tenta ${"esgueirar-se entre as colunas da cripta sem ser vista ".repeat(5)}`.trim()
        expect(long.length).toBeGreaterThan(200)
        await inJob(table.id, { kind: "narration", round: 0 }, async (jobId) => {
            const result = await call(table.id, jobId, { ...stealth, motivo: long })
            expect(result).not.toHaveProperty("truncated")
            expect(jobDraftChecks(String(table.id), jobId)[0]!.reason).toBe(long)
        })
        await inJob(table.id, { kind: "narration", round: 0 }, async (jobId) => {
            const result = await call(table.id, jobId, { ...stealth, motivo: "x".repeat(MADDOX_TOOL_TEXT_MAX + 50) })
            expect(result).toMatchObject({ truncated: ["motivo"] })
            expect(jobDraftChecks(String(table.id), jobId)[0]!.reason.length).toBeLessThanOrEqual(MADDOX_TOOL_TEXT_MAX)
        })
    })

    it("recusa campanha narrativa, resposta a pergunta, a última rodada, personagem sem ficha, desconhecido e perícia ausente", async () => {
        const narrative = await faithful("narrativo")
        await inJob(narrative.id, { kind: "narration", round: 0 }, async (jobId) => {
            await expect(call(narrative.id, jobId, stealth)).rejects.toThrow(/campanha é narrativa/)
        })
        const table = await faithful()
        await inJob(table.id, { kind: "answer", round: 0 }, async (jobId) => {
            await expect(call(table.id, jobId, stealth)).rejects.toThrow(/só são pedidos na narração/)
        })
        await inJob(table.id, { kind: "narration", round: 2 }, async (jobId) => {
            await expect(call(table.id, jobId, stealth)).rejects.toThrow(/Limite de testes/)
        })
        await inJob(table.id, { kind: "narration", round: 1 }, async (jobId) => {
            await expect(call(table.id, jobId, { ...stealth, personagem: "Doran" })).rejects.toThrow(/não tem ficha/)
            await expect(call(table.id, jobId, { ...stealth, personagem: "Ninguém" })).rejects.toThrow(/Nenhum personagem jogador chamado "Ninguém"/)
            await expect(call(table.id, jobId, { personagem: "Lyra", tipo: "pericia", cd: 10, motivo: "x" })).rejects.toThrow(/Informe a perícia/)
            await expect(call(table.id, jobId, { personagem: "Lyra", tipo: "atributo", cd: 10, motivo: "x" })).rejects.toThrow(/Informe o atributo/)
            await expect(call(table.id, jobId, { ...stealth, cd: 40 })).rejects.toThrow(/Entrada inválida/)
            expect(jobDraftChecks(String(table.id), jobId)).toHaveLength(0)
        })
    })
})

describe("suggest_actions (DND-30)", () => {
    /** Roda `test` num job da fila e devolve as sugestões que ficaram no rascunho ao fim dele. */
    async function inJob(campaignId: mongoose.Types.ObjectId, kind: "narration" | "answer", test: (jobId: string) => Promise<void>) {
        let failure: unknown = null
        let drafts: ReturnType<typeof takeDraftActionOptions> = []
        await enqueueMaddoxJob(
            String(campaignId),
            "teste",
            async ({ jobId }) => {
                try {
                    await test(jobId)
                    drafts = takeDraftActionOptions(String(campaignId), jobId)
                } catch (error) {
                    failure = error
                }
            },
            { kind, turnNumber: 2, round: 0 },
        )
        await waitForCampaignIdle(String(campaignId))
        if (failure) throw failure
        return drafts
    }

    async function table(rigor: "narrativo" | "fiel-dnd" = "narrativo") {
        const id = (await MaddoxCampaignModel.create({ name: "Porto", ownerId: "u1", rigor }))._id
        const lyra = await MaddoxCampaignMemberModel.create({ campaignId: id, userId: "u2", role: "player", status: "joined" })
        const lyraChar = await MaddoxCharacterModel.create({ campaignId: id, memberId: lyra._id, userId: "u2", name: "Lyra", interview: { status: "done", scriptVersion: 0 } })
        const doran = await MaddoxCampaignMemberModel.create({ campaignId: id, userId: "u3", role: "player", status: "joined" })
        await MaddoxCharacterModel.create({ campaignId: id, memberId: doran._id, userId: "u3", name: "Doran", interview: { status: "done", scriptVersion: 0 } })
        return { id, lyraMember: String(lyra._id), lyraChar: String(lyraChar._id), doranMember: String(doran._id) }
    }

    const suggest = (id: mongoose.Types.ObjectId, jobId: string, input: unknown) => runMaddoxTool(findMaddoxTool("suggest_actions")!, { campaignId: id, turnNumber: 2, jobId }, input)

    it("guarda as sugestões por personagem (nome sem caixa), sem repetidas, no máximo 4, e chamar de novo substitui", async () => {
        const t = await table()
        const drafts = await inJob(t.id, "narration", async (jobId) => {
            const result = await suggest(t.id, jobId, {
                opcoes: [
                    { personagem: "lyra", acoes: ["Examino a porta", " examino   a porta ", "Chamo o guarda", "Subo no telhado", "Volto à taverna", "Espero"] },
                    { personagem: "Doran", acoes: ["Ergo o escudo"] },
                ],
            })
            expect(result).toMatchObject({ saved: [{ personagem: "Lyra", acoes: 4 }, { personagem: "Doran", acoes: 1 }] })
            expect(result).not.toHaveProperty("truncated")
            await suggest(t.id, jobId, { opcoes: [{ personagem: "Doran", acoes: ["Arrombo a porta", "Recuo"] }] })
        })
        expect(drafts).toEqual([
            { memberId: t.lyraMember, characterId: t.lyraChar, characterName: "Lyra", options: ["Examino a porta", "Chamo o guarda", "Subo no telhado", "Volto à taverna"] },
            expect.objectContaining({ memberId: t.doranMember, characterName: "Doran", options: ["Arrombo a porta", "Recuo"] }),
        ])
    })

    it("ação longa é cortada no teto de proteção, avisando o modelo, sem recusar", async () => {
        const t = await table()
        const drafts = await inJob(t.id, "narration", async (jobId) => {
            const result = await suggest(t.id, jobId, { opcoes: [{ personagem: "Lyra", acoes: ["x".repeat(MADDOX_ACTION_OPTION_TEXT_MAX + 40), "Corro"] }] })
            expect(result).toMatchObject({ truncated: ["Lyra"] })
        })
        expect(drafts[0]!.options[0]!.length).toBeLessThanOrEqual(MADDOX_ACTION_OPTION_TEXT_MAX)
        expect(drafts[0]!.options[1]).toBe("Corro")
    })

    it("recusa personagem desconhecido (com a lista), resposta a pergunta, combate tático e narração já terminada", async () => {
        const t = await table()
        const drafts = await inJob(t.id, "narration", async (jobId) => {
            await expect(suggest(t.id, jobId, { opcoes: [{ personagem: "Ninguém", acoes: ["Corro"] }] })).rejects.toThrow(/Personagem desconhecido: Ninguém\. Personagens: .*Lyra/)
            await expect(suggest(t.id, jobId, { opcoes: [{ personagem: "Lyra", acoes: ["   "] }] })).rejects.toThrow(/Nenhuma ação sugerida/)
        })
        expect(drafts).toEqual([])
        await inJob(t.id, "answer", async (jobId) => {
            await expect(suggest(t.id, jobId, { opcoes: [{ personagem: "Lyra", acoes: ["Corro"] }] })).rejects.toThrow(/só são dadas na narração/)
        })
        const tactical = await table("fiel-dnd")
        tacticalActive.value = true
        await inJob(tactical.id, "narration", async (jobId) => {
            await expect(suggest(tactical.id, jobId, { opcoes: [{ personagem: "Lyra", acoes: ["Corro"] }] })).rejects.toThrow(/combate tático/)
        })
        tacticalActive.value = false
        await expect(suggest(t.id, "job-encerrado", { opcoes: [{ personagem: "Lyra", acoes: ["Corro"] }] })).rejects.toThrow(MaddoxToolError)
    })

    it("a AI SDK só recebe a ferramenta com `actionOptions: true`", async () => {
        const t = await table()
        const context = { campaignId: t.id, turnNumber: 2, jobId: "x" }
        expect(Object.keys(await buildMaddoxAiTools(context, {}))).not.toContain("suggest_actions")
        expect(Object.keys(await buildMaddoxAiTools(context, { actionOptions: true }))).toContain("suggest_actions")
    })
})
