import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose, { Types } from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * DND-51: o "Pergunte ao mestre" corrige a ficha. O mestre lê a ficha e a entrevista e grava pela lista fechada da ficha,
 * com a fonte do catálogo lida na resposta e a escolha do jogador (trecho dele). Nunca escolhe o atributo de conjuração
 * por conta própria. A correção é auditada, avisa a ficha aberta, aparece na mesa e muda as opções de Ação.
 */

const recordAudit = vi.fn<(entry: Record<string, unknown>) => Promise<undefined>>(async () => undefined)
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR" } }))
const sheetPusher = vi.hoisted(() => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({ CharacterSheetPusherService: { getInstance: () => sheetPusher } }))
vi.mock("@/features/maddox/server/combat-classifier", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/combat-classifier")>()), resolveProfiles: vi.fn(async () => new Map()) }))

const { MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxInterviewModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterSpell } = await import("@/features/character-sheets/models/character-spell")
const { CharacterAttack } = await import("@/features/character-sheets/models/character-attack")
const runs = await import("@/features/maddox/server/question-runs")
const tools = await import("@/features/maddox/server/question-sheet-tools")
const { recordCatalogRead } = await import("@/features/maddox/server/catalog-reads")
const { loadCharacterOptions } = await import("@/features/maddox/server/tactical-options")
const { MADDOX_SHEET_FIX_TASK_RULES, narratorTaskText } = await import("@/features/maddox/server/narrator-prompt")
const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")

let mongo: MongoMemoryServer
const RELATO = "não queria carisma como atributo de conjuração, e sim sabedoria. E também não está aparecendo o truque rajada de veneno e nem o outro que eu escolhi na entrevista nas minhas ações"
const SERPENTINA = "Você sabe Rajada de Veneno. Você pode lançar amizade animal um número ilimitado de vezes com este traço. Inteligência, Sabedoria, ou Carisma é sua habilidade de feitiços para esses feitiços quando você os lança com esse traço (escolha quando selecionar esta corrida)."
const INICIADO = "Dois Truques. Você aprende dois truques à sua escolha na lista de magias de Clérigo, Druida ou Mago. Inteligência, Sabedoria ou Carisma é seu atributo de conjuração para as magias deste talento (escolha quando selecionar este talento)."

interface Table {
    campaignId: Types.ObjectId
    owner: string
    player: string
    nala: { _id: Types.ObjectId; sheetId: Types.ObjectId }
    other: { _id: Types.ObjectId; sheetId: Types.ObjectId }
    rajada: Types.ObjectId
    orientacao: Types.ObjectId
}

async function spell(name: string, extra: Record<string, unknown> = {}) {
    const _id = new Types.ObjectId()
    await mongoose.connection.collection("spells").insertOne({ _id, name, description: `${name}.`, circle: 0, school: "Conjuração", component: ["V", "S"], castingTime: "Ação", status: "active", ...extra })
    return _id
}

async function sheet(name: string) {
    const _id = new Types.ObjectId()
    await CharacterSheet.collection.insertOne({ _id, slug: `ficha-${String(_id)}`, userId: "player", name, level: 1, strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10, spellcastingAttribute: null, hpMax: 9, hpCurrent: 9, spellSlots: {}, resourceCharges: [], createdAt: new Date(), updatedAt: new Date() })
    return _id
}

async function table(): Promise<Table> {
    const owner = "owner-1"
    const player = "player-1"
    const campaignId = new Types.ObjectId()
    await MaddoxCampaignModel.collection.insertOne({ _id: campaignId, name: "Mina Perdida", ownerId: owner, rigor: "equilibrado", status: "active", turn: { number: 2, phase: "players" }, createdAt: new Date(), updatedAt: new Date() })
    const memberId = new Types.ObjectId()
    const nalaSheet = await sheet("Nala")
    const otherSheet = await sheet("Uther")
    const nala = { _id: new Types.ObjectId(), sheetId: nalaSheet }
    const other = { _id: new Types.ObjectId(), sheetId: otherSheet }
    await MaddoxCharacterModel.collection.insertMany([
        { _id: nala._id, campaignId, memberId, userId: player, name: "Nala", status: "active", sheetId: nalaSheet, createdAt: new Date(), updatedAt: new Date() },
        { _id: other._id, campaignId, memberId: new Types.ObjectId(), userId: "player-2", name: "Uther", status: "active", sheetId: otherSheet, createdAt: new Date(), updatedAt: new Date() },
    ])
    await MaddoxInterviewModel.collection.insertOne({
        _id: new Types.ObjectId(),
        campaignId,
        kind: "character",
        memberId,
        characterId: nala._id,
        status: "done",
        messages: [
            { id: "m1", role: "maddox", content: "O Iniciado em Magia pede dois truques e uma magia de 1º círculo.", proposal: false },
            { id: "m2", role: "user", content: "orientação e mensagem de truques e detectar veneno e doença", proposal: false },
        ],
        build: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    })
    const rajada = await spell("Rajada de Veneno", { baseDice: { quantidade: 1, tipo: "d12" }, saveAttribute: "constitution" })
    const orientacao = await spell("Orientação")
    return { campaignId, owner, player, nala, other, rajada, orientacao }
}

let jobSeq = 0
async function ask(t: Table, question: string, asker: { userId: string; characterId: Types.ObjectId | null } = { userId: t.player, characterId: t.nala._id }) {
    const jobId = `job-${++jobSeq}`
    const message = await MaddoxCampaignMessageModel.create({ campaignId: t.campaignId, turnNumber: 2, phase: "players", kind: "question", userId: asker.userId, characterId: asker.characterId, characterName: "Nala", content: question })
    const run = runs.openQuestionRun({
        campaignId: String(t.campaignId),
        jobId,
        turnNumber: 2,
        questionId: String(message._id),
        askerUserId: asker.userId,
        askerCharacterId: asker.characterId ? String(asker.characterId) : null,
        askerIsOwner: asker.userId === t.owner,
        playerTexts: [question, ...(await runs.interviewPlayerTexts(t.campaignId, asker.characterId))],
    })
    // O mestre leu a regra no catálogo durante a resposta.
    recordCatalogRead(run.reads, "Habilidade", "serpentina", { name: "Conjuração Serpentina", description: SERPENTINA })
    recordCatalogRead(run.reads, "Talento", "iniciado", { name: "Iniciado em Magia", description: INICIADO })
    return { jobId, run, questionId: message._id }
}

const SERPENTINA_ATTR = { ref: "Habilidade:serpentina", quote: "Inteligência, Sabedoria, ou Carisma é sua habilidade de feitiços" }
const SERPENTINA_SPELL = { ref: "Habilidade:serpentina", quote: "Você sabe Rajada de Veneno" }
const INICIADO_SPELLS = { ref: "Talento:iniciado", quote: "Você aprende dois truques à sua escolha" }

const optionsOf = async (t: Table) => {
    const views = await loadCharacterOptions([{ actorKey: "c:nala", characterId: String(t.nala._id), memberId: "m", userId: t.player, name: "Nala", sheetId: String(t.nala.sheetId), conditions: [], flags: {} as never, economy: { action: true, bonus: true, reaction: true, attacksLeft: 0, attackAction: false, slotSpellCast: false, lightAttack: false, lightWeaponId: null, sneakAttackUsed: false, lightExtraUsed: false, cleave: null, cleaveUsed: false }, concentration: null, stable: false, dead: false, hpZero: false, left: false, ready: null }])
    return views.get("c:nala")!.options
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_question_sheet_fix" })
})
afterAll(async () => {
    await mongoose.disconnect()
    await mongo.stop()
})
beforeEach(async () => {
    await mongoose.connection.db!.dropDatabase()
    recordAudit.mockClear()
    sheetPusher.publishSheetPatched.mockClear()
    sheetPusher.publishCollectionChanged.mockClear()
})

describe("DND-51 — o mestre corrige a ficha pelo Pergunte ao mestre", () => {
    it("o pedido do relato: Sabedoria, Rajada de Veneno e o truque da entrevista entram na ficha e nas opções de Ação", async () => {
        const t = await table()
        const { jobId } = await ask(t, RELATO)
        const result = await tools.updateCharacterSheetFromQuestion(jobId, {
            personagem: "Nala",
            alteracoes: [
                { type: "spellcasting-attribute", attribute: "wisdom", reason: "Você escolheu Sabedoria.", source: SERPENTINA_ATTR, choice: { quote: "e sim sabedoria" } },
                { type: "spell-add", catalogSpellId: String(t.rajada), reason: "Truque da Conjuração Serpentina.", source: SERPENTINA_SPELL },
                { type: "spell-add", catalogSpellId: String(t.orientacao), reason: "Truque escolhido no Iniciado em Magia.", source: INICIADO_SPELLS, choice: { quote: "orientação e mensagem de truques" } },
            ],
        })
        expect(result.recusadas).toEqual([])
        expect(result.aplicadas).toHaveLength(3)

        const stored = await CharacterSheet.findById(t.nala.sheetId).lean<{ spellcastingAttribute: string }>()
        expect(stored!.spellcastingAttribute).toBe("wisdom")
        const spells = await CharacterSpell.find({ sheetId: t.nala.sheetId }).lean()
        expect(spells.map((item) => String(item.catalogSpellId)).sort()).toEqual([String(t.rajada), String(t.orientacao)].sort())
        // Truque com dano ganha o ataque automático com o bônus de Sabedoria (+3) e proficiência (+2).
        const attack = await CharacterAttack.findOne({ sheetId: t.nala.sheetId, notes: `auto:spell:${String(t.rajada)}` }).lean()
        expect(attack!.attackBonus).toBe("+5")

        // Auditoria por alteração, em nome de quem perguntou, e a ficha aberta avisada.
        const audits = recordAudit.mock.calls.map(([entry]) => entry)
        expect(audits).toHaveLength(3)
        expect(audits.every((entry) => entry.userId === t.player && (entry.depois as Record<string, unknown>).origin === "question")).toBe(true)
        expect(sheetPusher.publishSheetPatched).toHaveBeenCalled()
        expect(sheetPusher.publishCollectionChanged).toHaveBeenCalledWith(expect.objectContaining({ collection: "spells", action: "created" }))

        // Linha pública na mesa.
        const line = await MaddoxCampaignMessageModel.findOne({ campaignId: t.campaignId, kind: "sheet-change" }).lean()
        expect(line!.content).toContain("Ficha de Nala corrigida")
        expect(line!.content).toContain("Sabedoria")

        // As opções de Ação passam a trazer os truques, com a CD de Sabedoria (8 + 2 + 3).
        const options = await optionsOf(t)
        const rajada = options.action.find((option) => option.label === "Rajada de Veneno")
        expect(rajada?.save?.dc).toBe(13)
        expect(options.action.some((option) => option.label === "Orientação")).toBe(true)
    })

    it("nunca escolhe o atributo de conjuração pelo jogador: sem o trecho dele, recusa e manda perguntar", async () => {
        const t = await table()
        const { jobId } = await ask(t, "não aparece a rajada de veneno nas minhas ações")
        const result = await tools.updateCharacterSheetFromQuestion(jobId, {
            personagem: "Nala",
            alteracoes: [
                { type: "spellcasting-attribute", attribute: "charisma", reason: "Carisma.", source: SERPENTINA_ATTR },
                { type: "spellcasting-attribute", attribute: "charisma", reason: "Carisma.", source: SERPENTINA_ATTR, choice: { quote: "eu escolho carisma" } },
                { type: "spell-add", catalogSpellId: String(t.rajada), reason: "Truque da espécie.", source: SERPENTINA_SPELL },
            ],
        })
        expect(result.faltaEscolhaDoJogador).toHaveLength(2)
        expect(result.recusadas.map((item) => item.alteracao)).toEqual([1, 2])
        expect(result.orientacao).toMatch(/Pergunte ao jogador/)
        expect((await CharacterSheet.findById(t.nala.sheetId).lean<{ spellcastingAttribute: string | null }>())!.spellcastingAttribute).toBeNull()
        // O truque nomeado pela regra não é escolha: entra.
        expect(await CharacterSpell.countDocuments({ sheetId: t.nala.sheetId, catalogSpellId: t.rajada })).toBe(1)
    })

    it("o truque escolhido de uma lista exige a escolha do jogador; a regra precisa ter sido lida no catálogo", async () => {
        const t = await table()
        const { jobId } = await ask(t, "falta um truque")
        const result = await tools.updateCharacterSheetFromQuestion(jobId, {
            personagem: "Nala",
            alteracoes: [
                { type: "spell-add", catalogSpellId: String(t.orientacao), reason: "Iniciado em Magia.", source: INICIADO_SPELLS },
                { type: "spell-add", catalogSpellId: String(t.orientacao), reason: "Sem fonte." },
            ],
        })
        expect(result.aplicadas).toEqual([])
        expect(result.recusadas).toHaveLength(2)
        expect(await CharacterSpell.countDocuments({ sheetId: t.nala.sheetId })).toBe(0)
    })

    it("o jogador só corrige o próprio personagem; o dono corrige qualquer um; fora de uma pergunta não funciona", async () => {
        const t = await table()
        const { jobId } = await ask(t, "corrige a ficha do Uther")
        await expect(tools.updateCharacterSheetFromQuestion(jobId, { personagem: "Uther", alteracoes: [{ type: "ability", attribute: "strength", value: 14, reason: "x" }] })).rejects.toThrow(/próprio personagem/)
        const owner = await ask(t, "corrige a ficha do Uther", { userId: t.owner, characterId: null })
        const result = await tools.updateCharacterSheetFromQuestion(owner.jobId, { personagem: "Uther", alteracoes: [{ type: "item-add", name: "Corda de cânhamo", quantity: 1, reason: "Comprou na vila." }] })
        expect(result.aplicadas).toHaveLength(1)
        runs.closeQuestionRun(owner.jobId)
        await expect(tools.updateCharacterSheetFromQuestion(owner.jobId, { personagem: "Uther", alteracoes: [] })).rejects.toThrow(/Pergunte ao mestre/)
    })

    it("lê a ficha e a entrevista (as falas do jogador com a escolha)", async () => {
        const t = await table()
        const { jobId } = await ask(t, RELATO)
        const read = await tools.readCharacterSheet(jobId, "Nala")
        expect(read.ficha).toContain("Conjuração: nenhum atributo")
        const interview = await tools.readCharacterInterview(jobId, "Nala")
        expect(interview.falasDoJogador).toEqual(["orientação e mensagem de truques e detectar veneno e doença"])
    })
})

describe("DND-51 — ida e volta na mesma conversa", () => {
    it("a réplica do jogador segue a conversa (pergunta → resposta → réplica) e entra na tarefa da resposta", async () => {
        const t = await table()
        const first = await MaddoxCampaignMessageModel.create({ campaignId: t.campaignId, turnNumber: 2, phase: "players", kind: "question", userId: t.player, characterId: t.nala._id, characterName: "Nala", content: RELATO })
        const answer = await MaddoxCampaignMessageModel.create({ campaignId: t.campaignId, turnNumber: 2, phase: "players", kind: "answer", content: "Qual dos truques do Iniciado em Magia você escolheu?", replyToId: first._id })
        const reply = await MaddoxCampaignMessageModel.create({ campaignId: t.campaignId, turnNumber: 2, phase: "players", kind: "question", userId: t.player, characterId: t.nala._id, characterName: "Nala", content: "Orientação", replyToId: answer._id })
        const thread = await runs.questionThread(t.campaignId, reply._id)
        expect(thread.map((entry) => [entry.role, entry.content])).toEqual([
            ["player", RELATO],
            ["maddox", "Qual dos truques do Iniciado em Magia você escolheu?"],
            ["player", "Orientação"],
        ])
        const text = narratorTaskText({ kind: "answer", turnNumber: 2, characterName: "Nala", question: "Orientação", declarations: [], thread: thread.slice(0, -1), sheetFix: true })
        expect(text).toContain("Conversa até aqui")
        expect(text).toContain("- Maddox: Qual dos truques do Iniciado em Magia você escolheu?")
        expect(text).toContain(MADDOX_SHEET_FIX_TASK_RULES)
        expect(text).toMatch(/NÃO avance a cena/)
        // Sem ficha (grau narrativo), as regras de correção não entram.
        expect(narratorTaskText({ kind: "answer", turnNumber: 2, characterName: "Nala", question: "Oi", declarations: [] })).not.toContain(MADDOX_SHEET_FIX_TASK_RULES)
    })
})

describe("DND-51 (revisão) — limites do jogador comum, PV e a trava do atributo", () => {
    const hp = (t: Table, jobId: string, personagem: string, valor: number) => runMaddoxTool(findMaddoxTool("update_character_hit_points")!, { campaignId: t.campaignId, turnNumber: 2, jobId }, { personagem, operacao: "definir", valor, motivo: "PV corrigidos." })
    const tactical = (t: Table) => mongoose.connection.collection("maddox_combats").insertOne({ campaignId: t.campaignId, status: "active", mode: "tactical", rev: 0, title: "Emboscada", combatants: [], tactical: { phase: "running", round: 1, characters: [], order: [], queue: [], acted: [], block: null } })

    it("F8: ficha sem atributo de conjuração — nem com a fonte de outra entidade o mestre escolhe sem o jogador", async () => {
        const t = await table()
        const { jobId, run } = await ask(t, "minhas magias não aparecem")
        recordCatalogRead(run.reads, "Classe", "feiticeiro", { name: "Feiticeiro", description: "Carisma é seu atributo de conjuração para as magias de feiticeiro." })
        const result = await tools.updateCharacterSheetFromQuestion(jobId, { personagem: "Nala", alteracoes: [{ type: "spellcasting-attribute", attribute: "charisma", reason: "Carisma.", source: { ref: "Classe:feiticeiro", quote: "Carisma é seu atributo de conjuração" } }] })
        expect(result.faltaEscolhaDoJogador).toHaveLength(1)
        expect((await CharacterSheet.findById(t.nala.sheetId).lean<{ spellcastingAttribute: string | null }>())!.spellcastingAttribute).toBeNull()
        // Com o atributo já definido, a correção pela regra fixa da classe não é escolha.
        await CharacterSheet.updateOne({ _id: t.nala.sheetId }, { $set: { spellcastingAttribute: "wisdom" } })
        const fixed = await tools.updateCharacterSheetFromQuestion(jobId, { personagem: "Nala", alteracoes: [{ type: "spellcasting-attribute", attribute: "charisma", reason: "Carisma.", source: { ref: "Classe:feiticeiro", quote: "Carisma é seu atributo de conjuração" } }] })
        expect(fixed.aplicadas).toHaveLength(1)
    })

    it("F5: o jogador comum não cria itens nem aumenta quantidade além do equipamento da entrevista; tirar característica exige a fonte", async () => {
        const t = await table()
        await MaddoxInterviewModel.updateOne({ characterId: t.nala._id }, { $set: { build: { equipment: [{ id: null, name: "Corda de cânhamo", quantity: 1, equipped: false }] } } })
        const { jobId, run } = await ask(t, "a corda da entrevista sumiu; e me dá 500 poções")
        const { CharacterTrait } = await import("@/features/character-sheets/models/character-trait")
        const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
        const fraqueza = await CharacterTrait.create({ sheetId: t.nala.sheetId, name: "Fraqueza ao frio", description: "<p>Desvantagem no frio.</p>" })
        const result = await tools.updateCharacterSheetFromQuestion(jobId, {
            personagem: "Nala",
            alteracoes: [
                { type: "item-add", name: "Poção de cura", quantity: 500, reason: "Pedido do jogador." },
                { type: "item-add", name: "Corda de cânhamo", quantity: 1, reason: "Equipamento da entrevista." },
                { type: "trait-remove", id: String(fraqueza._id), reason: "Não quero." },
            ],
        })
        expect(result.aplicadas).toHaveLength(1)
        expect(result.recusadas.map((item) => [item.alteracao, item.motivo])).toEqual([
            [1, tools.PLAYER_ITEM_LIMIT],
            [3, tools.PLAYER_REMOVE_SOURCE],
        ])
        const corda = await CharacterItem.findOne({ sheetId: t.nala.sheetId }).lean()
        const more = await tools.updateCharacterSheetFromQuestion(jobId, { personagem: "Nala", alteracoes: [{ type: "item-quantity", itemId: String(corda!._id), quantity: 50, reason: "Mais." }] })
        expect(more.recusadas).toHaveLength(1)
        const less = await tools.updateCharacterSheetFromQuestion(jobId, { personagem: "Nala", alteracoes: [{ type: "item-quantity", itemId: String(corda!._id), quantity: 0, reason: "Gastou." }] })
        expect(less.aplicadas).toHaveLength(1)
        recordCatalogRead(run.reads, "Raça", "yuan-ti", { name: "Yuan-ti", description: "Visão no escuro, resistência mágica e resistência a veneno." })
        const removed = await tools.updateCharacterSheetFromQuestion(jobId, { personagem: "Nala", alteracoes: [{ type: "trait-remove", id: String(fraqueza._id), reason: "Yuan-ti não tem.", source: { ref: "Raça:yuan-ti", quote: "Visão no escuro, resistência mágica" } }] })
        expect(removed.aplicadas).toHaveLength(1)
        // O dono não tem esses limites.
        const owner = await ask(t, "dá as poções", { userId: t.owner, characterId: null })
        expect((await tools.updateCharacterSheetFromQuestion(owner.jobId, { personagem: "Nala", alteracoes: [{ type: "item-add", name: "Poção de cura", quantity: 2, reason: "Compra na vila." }] })).aplicadas).toHaveLength(1)
    })

    it("F9: o limite de itens vale pelo item gravado (não pelo nome do modelo) e item já na ficha ganha quantidade, não outra linha", async () => {
        const t = await table()
        await MaddoxInterviewModel.updateOne({ characterId: t.nala._id }, { $set: { build: { equipment: [{ id: null, name: "Poção de cura", quantity: 2, equipped: false }, { id: null, name: "Corda de cânhamo", quantity: 1, equipped: false }] } } })
        const armadura = new Types.ObjectId()
        await mongoose.connection.collection("items").insertOne({ _id: armadura, name: "Armadura +3", type: "armadura", status: "active", description: "Mágica." })
        const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
        await CharacterItem.create({ sheetId: t.nala.sheetId, name: "<p>Poção de cura</p>", quantity: 2, equipped: false })
        const { jobId } = await ask(t, "me dá a corda e mais poções")
        const result = await tools.updateCharacterSheetFromQuestion(jobId, {
            personagem: "Nala",
            alteracoes: [
                // O nome casa com a corda da entrevista, mas o item gravado seria a armadura do catálogo.
                { type: "item-add", catalogItemId: String(armadura), name: "Corda de cânhamo", quantity: 1, reason: "x" },
                // Já tem as 2 poções da entrevista: mais 2 passaria do equipamento.
                { type: "item-add", name: "Poção de cura", quantity: 2, reason: "x" },
            ],
        })
        expect(result.recusadas.map((item) => [item.alteracao, item.motivo])).toEqual([
            [1, tools.PLAYER_ITEM_LIMIT],
            [2, tools.PLAYER_ITEM_LIMIT],
        ])
        expect(await CharacterItem.countDocuments({ sheetId: t.nala.sheetId })).toBe(1)
        // Pelo dono (sem limite), a poção que já existe ganha quantidade na mesma linha.
        const owner = await ask(t, "mais poções", { userId: t.owner, characterId: null })
        expect((await tools.updateCharacterSheetFromQuestion(owner.jobId, { personagem: "Nala", alteracoes: [{ type: "item-add", name: "poção de CURA", quantity: 1, reason: "x" }] })).aplicadas).toHaveLength(1)
        const rows = await CharacterItem.find({ sheetId: t.nala.sheetId }).lean()
        expect(rows.map((row) => [row.name, row.quantity])).toEqual([["<p>Poção de cura</p>", 3]])
    })

    it("F4: PV pelo Pergunte ao mestre — jogador no próprio fora do combate; nunca no de outro; no combate tático, só o dono", async () => {
        const t = await table()
        const { jobId } = await ask(t, "meus PV estão errados")
        const result = (await hp(t, jobId, "Nala", 5)) as { pv: string }
        expect(result.pv).toBe("5/9")
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: t.player, entidade: "FichaPersonagem", depois: expect.objectContaining({ origin: "question-hit-points", requestedBy: t.player }) }))
        await expect(hp(t, jobId, "Uther", 1)).rejects.toThrow(/próprio personagem/)
        await tactical(t)
        await expect(hp(t, jobId, "Nala", 9)).rejects.toThrow(/Só o dono da campanha corrige PV/)
        expect((await CharacterSheet.findById(t.nala.sheetId).lean<{ hpCurrent: number }>())!.hpCurrent).toBe(5)
        const owner = await ask(t, "corrige os PV da Nala", { userId: t.owner, characterId: null })
        expect(((await hp(t, owner.jobId, "Nala", 9)) as { pv: string }).pv).toBe("9/9")
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: t.owner, depois: expect.objectContaining({ origin: "question-hit-points", requestedBy: t.owner }) }))
    })
})
