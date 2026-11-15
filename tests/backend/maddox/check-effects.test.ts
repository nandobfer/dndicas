import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose, { Types } from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * DND-69: efeitos de teste. Caso real (campanha "Tibia"): Lizwan conjurou Orientação antes do teste de Sobrevivência e o
 * teste saiu só com o d20 + a ficha. Agora `apply_check_effect` grava o efeito na ficha (conferido no catálogo) e a
 * rolagem do `request_check` soma o 1d4 como dado próprio; o que não pode entrar aparece com o motivo.
 */

const serverDice: number[][] = []
vi.mock("@/features/dice-roller/server/dice-engine", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/features/dice-roller/server/dice-engine")>()
    return {
        ...actual,
        rollDice: (input: Parameters<typeof actual.rollDice>[0], options: Parameters<typeof actual.rollDice>[1] = {}) => {
            const values = serverDice.shift() ?? []
            let index = 0
            return actual.rollDice(input, { ...options, randomInt: options.randomInt ?? ((min: number, max: number) => values[index++] ?? Math.floor((min + max - 1) / 2)) })
        },
    }
})
const recordAudit = vi.fn(async (_entry: Record<string, unknown>) => undefined)
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" } }))
vi.mock("@/core/database/db", () => ({ default: vi.fn(async () => undefined) }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({
    CharacterSheetPusherService: { getInstance: () => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }) },
}))
vi.mock("@/features/maddox/server/combat-prep-ai", async () => (await import("../../helpers/combat-prep-mock")).combatPrepAiModule)
vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)

const { campaignMemoriesStore } = await import("../../helpers/campaign-memories-mock")
const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterSpell } = await import("@/features/character-sheets/models/character-spell")
const { Spell } = await import("@/features/spells/models/spell")
const { Trait } = await import("@/features/traits/database/trait")
const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")
const effects = await import("@/features/maddox/server/check-effects")
const checks = await import("@/features/maddox/server/game-checks")
const { enqueueMaddoxJob, waitForCampaignIdle, takeDraftChecks } = await import("@/features/maddox/server/game-live")
const runs = await import("@/features/maddox/server/question-runs")
const { readCheckEffects } = await import("@/features/maddox/check-effects")

let mongo: MongoMemoryServer

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri())
})
afterAll(async () => {
    await mongoose.disconnect()
    await mongo.stop()
})
beforeEach(async () => {
    await mongoose.connection.db!.dropDatabase()
    campaignMemoriesStore.reset()
    recordAudit.mockClear()
    serverDice.length = 0
})

const GUIDANCE_TEXT = "<p>Você toca uma criatura voluntária e escolhe uma perícia.</p><p>Até que a magia termine, a criatura adiciona 1d4 a qualquer teste de atributo usando a perícia escolhida.</p>"
const GUIDANCE_QUOTE = "a criatura adiciona 1d4 a qualquer teste de atributo usando a perícia escolhida"

/** Campanha Rigorosa: Lizwan (SAB 14, Sobrevivência treinada = +4, conhece Orientação) da jogadora e Ravel do dono. */
async function table() {
    const campaignId = new Types.ObjectId()
    const owner = String(new Types.ObjectId())
    const player = String(new Types.ObjectId())
    await MaddoxCampaignModel.collection.insertOne({ _id: campaignId, name: "Tibia", ownerId: owner, rigor: "rigoroso", status: "active", showCheckDc: true, turn: { number: 27, phase: "master", awaitingChecks: true, checkRound: 0, generating: null }, createdAt: new Date(), updatedAt: new Date() })
    const lizwan = { characterId: new Types.ObjectId(), sheetId: new Types.ObjectId(), memberId: new Types.ObjectId() }
    const ravel = { characterId: new Types.ObjectId(), sheetId: new Types.ObjectId(), memberId: new Types.ObjectId() }
    await MaddoxCharacterModel.collection.insertMany([
        { _id: lizwan.characterId, campaignId, memberId: lizwan.memberId, userId: player, name: "Lizwan", status: "active", sheetId: lizwan.sheetId, interview: { status: "done", scriptVersion: 0 } },
        { _id: ravel.characterId, campaignId, memberId: ravel.memberId, userId: owner, name: "Ravel", status: "active", sheetId: ravel.sheetId, interview: { status: "done", scriptVersion: 0 } },
    ])
    await MaddoxCampaignMemberModel.collection.insertMany([
        { _id: lizwan.memberId, campaignId, userId: player, role: "player", status: "joined", characterId: lizwan.characterId, joinedAt: new Date(1), createdAt: new Date(1) },
        { _id: ravel.memberId, campaignId, userId: owner, role: "owner", status: "joined", characterId: ravel.characterId, joinedAt: new Date(0), createdAt: new Date(0) },
    ])
    const abilities = { strength: 10, dexterity: 12, constitution: 12, intelligence: 10, charisma: 10 }
    await CharacterSheet.collection.insertMany([
        { _id: lizwan.sheetId, slug: `lizwan-${String(lizwan.sheetId)}`, userId: owner, name: "Lizwan", level: 1, ...abilities, wisdom: 14, skills: { Sobrevivência: { proficient: true, expertise: false } }, spellSlots: {}, resourceCharges: [], updatedAt: new Date() },
        { _id: ravel.sheetId, slug: `ravel-${String(ravel.sheetId)}`, userId: owner, name: "Ravel", level: 1, ...abilities, wisdom: 10, spellSlots: { "1": { total: 0, used: 0 } }, resourceCharges: [], updatedAt: new Date() },
    ])
    const guidance = new Types.ObjectId()
    await Spell.collection.insertOne({ _id: guidance, name: "Orientação", description: GUIDANCE_TEXT, circle: 0, component: ["Somático", "Verbal", "Concentração"], range: "Pessoal", duration: "Concentração, até 1 minuto", status: "active" })
    await CharacterSpell.collection.insertOne({ sheetId: lizwan.sheetId, catalogSpellId: guidance, name: "Orientação", circle: 0, prepared: true, components: [], createdAt: new Date() })
    return { campaignId, owner, player, lizwan, ravel, guidance }
}
type Table = Awaited<ReturnType<typeof table>>

const tool = (name: string, t: Table, input: Record<string, unknown>, jobId?: string) => runMaddoxTool(findMaddoxTool(name)!, { campaignId: t.campaignId, turnNumber: 27, ...(jobId ? { jobId } : {}) }, input)
const guidance = (t: Table, extra: Record<string, unknown> = {}) => tool("apply_check_effect", t, { personagem: "Lizwan", fonte: { tipo: "magia", nome: "Orientação" }, pericia: "Sobrevivência", trecho: GUIDANCE_QUOTE, motivo: "Lizwan murmura a prece antes de ler o chão", ...extra })
const effectsOf = async (sheetId: Types.ObjectId) => readCheckEffects(((await CharacterSheet.collection.findOne({ _id: sheetId })) as { checkEffects?: unknown } | null)?.checkEffects)
const sheetLines = async (t: Table) => (await MaddoxCampaignMessageModel.find({ campaignId: t.campaignId, kind: "sheet-change" }).sort({ _id: 1 }).lean()).map((item) => item.content)

/** Teste pendente da rodada 0 (e um de Ravel, que segura a rodada: a continuação do Maddox não entra no teste). */
async function pendingCheck(t: Table, input: { skill: string | null; kind?: "skill" | "ability" | "save"; ability?: string; effects?: unknown[] }) {
    const docs = await MaddoxCampaignMessageModel.insertMany([
        checks.draftCheckMessage(t.campaignId, 27, 0, { memberId: String(t.lizwan.memberId), userId: t.player, characterId: String(t.lizwan.characterId), characterName: "Lizwan", sheetId: String(t.lizwan.sheetId), kind: input.kind ?? "skill", ability: input.ability ?? "wisdom", skill: input.skill, dc: 12, mode: "normal", reason: "Ler o chão", effects: (input.effects ?? []) as never }),
        checks.draftCheckMessage(t.campaignId, 27, 0, { memberId: String(t.ravel.memberId), userId: t.owner, characterId: String(t.ravel.characterId), characterName: "Ravel", sheetId: String(t.ravel.sheetId), kind: "skill", ability: "wisdom", skill: "Percepção", dc: 12, mode: "normal", reason: "Vigiar o mato" }),
    ])
    return String(docs[0]!._id)
}

describe("DND-69 — Orientação entra no teste", () => {
    it("o efeito gravado soma 1d4 como dado próprio: total = d20 + d4 + ficha, com a parcela do efeito", async () => {
        const t = await table()
        const applied = (await guidance(t)) as Record<string, unknown>
        expect(applied).toMatchObject({ saved: true, personagem: "Lizwan" })
        const stored = await effectsOf(t.lizwan.sheetId)
        expect(stored).toHaveLength(1)
        expect(stored[0]).toMatchObject({ name: "Orientação", dice: { count: 1, die: "d4" }, skill: "Sobrevivência", concentration: true, singleUse: false, casterName: "Lizwan", source: { kind: "spell", ref: `Magia:${String(t.guidance)}` } })
        expect((await sheetLines(t))[0]).toContain("Efeito de teste em Lizwan: Orientação +1d4 em testes de Sobrevivência (concentração de Lizwan)")
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FichaPersonagem", entidadeId: String(t.lizwan.sheetId) }))

        const checkId = await pendingCheck(t, { skill: "Sobrevivência" })
        serverDice.push([17, 3])
        const { roll } = await checks.rollCheck(String(t.campaignId), checkId, t.player)
        expect(roll.terms.map((term) => `${term.quantity}${term.dice}`)).toEqual(["1d20", "1d4"])
        expect(roll.modifier).toBe(4)
        expect(roll.total).toBe(17 + 3 + 4)
        const saved = await MaddoxCampaignMessageModel.findById(checkId).lean()
        expect(saved!.check!.effects).toEqual([expect.objectContaining({ name: "Orientação", dice: "1d4", status: "applied", results: [3], reason: null })])
        // Concentração, não uso único: continua ativa para o próximo teste.
        expect(await effectsOf(t.lizwan.sheetId)).toHaveLength(1)
    })

    it("teste de outra perícia: o efeito não entra e o motivo fica no teste", async () => {
        const t = await table()
        await guidance(t)
        const checkId = await pendingCheck(t, { skill: "Furtividade", ability: "dexterity" })
        serverDice.push([10])
        const { roll } = await checks.rollCheck(String(t.campaignId), checkId, t.player)
        expect(roll.terms).toHaveLength(1)
        const saved = await MaddoxCampaignMessageModel.findById(checkId).lean()
        expect(saved!.check!.effects).toEqual([expect.objectContaining({ name: "Orientação", status: "skipped", reason: "vale só em testes de Sobrevivência" })])
    })

    it("efeito da prévia que terminou antes da rolagem: não entra, com o motivo", async () => {
        const t = await table()
        const checkId = await pendingCheck(t, { skill: "Sobrevivência", effects: [{ id: "x1", name: "Orientação", dice: "1d4", status: "expected", results: null, reason: null }] })
        serverDice.push([10])
        const { roll } = await checks.rollCheck(String(t.campaignId), checkId, t.player)
        expect(roll.total).toBe(14)
        const saved = await MaddoxCampaignMessageModel.findById(checkId).lean()
        expect(saved!.check!.effects).toEqual([expect.objectContaining({ id: "x1", status: "skipped", reason: "o efeito terminou antes da rolagem" })])
    })

    it("vantagem continua valendo com o dado extra: o descarte é só do d20", async () => {
        const t = await table()
        await guidance(t)
        const checkId = await pendingCheck(t, { skill: "Sobrevivência" })
        await MaddoxCampaignMessageModel.updateOne({ _id: checkId }, { $set: { "check.mode": "advantage" } })
        // Ordem do motor: o d20 mantido, o descartado e depois o d4.
        serverDice.push([15, 5, 2])
        const { roll } = await checks.rollCheck(String(t.campaignId), checkId, t.player)
        expect(roll.mode).toBe("advantage")
        expect(roll.selectedD20).toMatchObject({ kept: 15, discarded: 5 })
        expect(roll.terms[1]).toMatchObject({ dice: "d4", results: [2] })
        expect(roll.total).toBe(15 + 2 + 4)
    })
})

describe("DND-69 — recusas com motivo (nunca em silêncio)", () => {
    it("magia fora da ficha, trecho fora do catálogo, sem a perícia escolhida e alcance Pessoal em outro alvo", async () => {
        const t = await table()
        await expect(tool("apply_check_effect", t, { personagem: "Ravel", fonte: { tipo: "magia", nome: "Orientação" }, pericia: "Percepção", trecho: GUIDANCE_QUOTE, motivo: "reza" })).rejects.toThrow(/não está na lista de magias da ficha de Ravel/)
        await expect(guidance(t, { trecho: "a criatura adiciona 1d8 a qualquer teste de atributo" })).rejects.toThrow(/não está no texto do catálogo/)
        await expect(guidance(t, { pericia: undefined })).rejects.toThrow(/informe a perícia/)
        await expect(guidance(t, { personagem: "Ravel", conjurador: "Lizwan" })).rejects.toThrow(/alcance Pessoal/)
        expect(await effectsOf(t.lizwan.sheetId)).toHaveLength(0)
        const lines = await sheetLines(t)
        expect(lines).toHaveLength(4)
        expect(lines.every((line) => line.includes("não entrou para"))).toBe(true)
    })

    it("magia de círculo 1 sem espaço livre é recusada e nada é gasto", async () => {
        const t = await table()
        const blessing = new Types.ObjectId()
        await Spell.collection.insertOne({ _id: blessing, name: "Favor Divino de Teste", description: "<p>O alvo adiciona 1d4 a suas salvaguardas até a magia terminar.</p>", circle: 1, component: ["Verbal", "Concentração"], range: "9 metros", duration: "Concentração, até 1 minuto", status: "active" })
        await CharacterSpell.collection.insertOne({ sheetId: t.ravel.sheetId, catalogSpellId: blessing, name: "Favor Divino de Teste", circle: 1, prepared: true, components: [], createdAt: new Date() })
        const input = { personagem: "Lizwan", conjurador: "Ravel", fonte: { tipo: "magia", nome: "Favor Divino de Teste" }, trecho: "o alvo adiciona 1d4 a suas salvaguardas", motivo: "bênção" }
        await expect(tool("apply_check_effect", t, input)).rejects.toThrow(/não tem espaço de magia de círculo 1 livre/)
        await CharacterSheet.collection.updateOne({ _id: t.ravel.sheetId }, { $set: { "spellSlots.1": { total: 2, used: 0 } } })
        await tool("apply_check_effect", t, input)
        const ravel = (await CharacterSheet.collection.findOne({ _id: t.ravel.sheetId })) as { spellSlots: Record<string, { used: number }> } | null
        expect(ravel!.spellSlots["1"]!.used).toBe(1)
        expect((await effectsOf(t.lizwan.sheetId))[0]).toMatchObject({ kinds: ["save"], skill: null, casterName: "Ravel" })
    })

    it("recurso de classe: gasta o uso, entra uma vez e some; sem usos é recusado", async () => {
        const t = await table()
        const trait = new Types.ObjectId()
        await Trait.collection.insertOne({ _id: trait, name: "Inspiração de Bardo", description: "<p>Uma vez nos próximos 10 minutos, a criatura pode rolar 1d6 e adicionar o número rolado a um teste de D20 que fizer.</p>", status: "active" })
        await CharacterSheet.collection.updateOne({ _id: t.ravel.sheetId }, { $set: { resourceCharges: [{ id: "c1", name: "Inspiração de Bardo", total: 1, used: 0, source: { kind: "class-feature", entityType: "Habilidade", entityId: String(trait) } }] } })
        const input = { personagem: "Lizwan", conjurador: "Ravel", fonte: { tipo: "recurso", nome: "Inspiração de Bardo" }, trecho: "pode rolar 1d6 e adicionar o número rolado a um teste de D20", motivo: "Ravel canta" }
        await tool("apply_check_effect", t, input)
        const ravel = (await CharacterSheet.collection.findOne({ _id: t.ravel.sheetId })) as { resourceCharges: { used: number }[] } | null
        expect(ravel!.resourceCharges[0]!.used).toBe(1)
        await expect(tool("apply_check_effect", t, input)).rejects.toThrow(/não tem mais usos de Inspiração de Bardo/)

        const checkId = await pendingCheck(t, { kind: "save", ability: "constitution", skill: null })
        serverDice.push([8, 5])
        const { roll } = await checks.rollCheck(String(t.campaignId), checkId, t.player)
        expect(roll.terms[1]).toMatchObject({ dice: "d6", results: [5] })
        expect(await effectsOf(t.lizwan.sheetId)).toHaveLength(0)
    })

    it("outra concentração de quem conjurou e o descanso encerram o efeito", async () => {
        const t = await table()
        await guidance(t)
        await guidance(t, { pericia: "Percepção" })
        const list = await effectsOf(t.lizwan.sheetId)
        expect(list).toHaveLength(1)
        expect(list[0]!.skill).toBe("Percepção")
        await effects.restCheckEffects(t.campaignId, [t.lizwan.characterId])
        expect(await effectsOf(t.lizwan.sheetId)).toHaveLength(0)
        expect((await sheetLines(t)).at(-1)).toContain("Orientação terminou — descanso concluído")
    })

    it("end_check_effect encerra pelo nome; nome inexistente devolve os ativos", async () => {
        const t = await table()
        await guidance(t)
        await expect(tool("end_check_effect", t, { personagem: "Lizwan", nome: "Bênção", motivo: "passou" })).rejects.toThrow(/Efeitos ativos: Orientação \+1d4/)
        await tool("end_check_effect", t, { personagem: "Lizwan", nome: "orientacao", motivo: "o minuto passou" })
        expect(await effectsOf(t.lizwan.sheetId)).toHaveLength(0)
    })

    it("no Pergunte ao mestre, o jogador comum só usa magia do próprio personagem", async () => {
        const t = await table()
        const jobId = "job-q1"
        runs.openQuestionRun({ campaignId: String(t.campaignId), jobId, turnNumber: 27, questionId: String(new Types.ObjectId()), askerUserId: t.player, askerCharacterId: String(t.lizwan.characterId), askerIsOwner: false, playerTexts: [] })
        try {
            await expect(tool("apply_check_effect", t, { personagem: "Lizwan", conjurador: "Ravel", fonte: { tipo: "magia", nome: "Orientação" }, pericia: "Sobrevivência", trecho: GUIDANCE_QUOTE, motivo: "x" }, jobId)).rejects.toThrow(/só pode usar magias e recursos do próprio personagem/)
            await expect(tool("apply_check_effect", t, { personagem: "Lizwan", fonte: { tipo: "magia", nome: "Orientação" }, pericia: "Sobrevivência", trecho: GUIDANCE_QUOTE, motivo: "x" }, jobId)).resolves.toMatchObject({ saved: true })
        } finally {
            runs.closeQuestionRun(jobId)
        }
    })
})

describe("DND-69 — request_check mostra os efeitos e avisa o que foi citado sem efeito", () => {
    it("prévia com o efeito que entra; magia da ficha citada no lembrete sem efeito gera aviso", async () => {
        const t = await table()
        await MaddoxCampaignModel.updateOne({ _id: t.campaignId }, { $set: { "turn.awaitingChecks": false } })
        await MaddoxCampaignMessageModel.create({ campaignId: t.campaignId, turnNumber: 26, phase: "players", kind: "reminder", memberId: t.lizwan.memberId, userId: t.player, characterId: t.lizwan.characterId, characterName: "Lizwan", content: 'vou lançar "orientação" em mim mesma', reminder: { status: "discarded" } })
        const results: Record<string, unknown>[] = []
        const drafts: unknown[] = []
        void enqueueMaddoxJob(
            String(t.campaignId),
            "test",
            async ({ jobId }) => {
                const ask = { personagem: "Lizwan", tipo: "pericia", pericia: "Sobrevivência", cd: 12, motivo: "Ler o chão de novo" }
                results.push((await tool("request_check", t, ask, jobId)) as Record<string, unknown>)
                await guidance(t)
                results.push((await tool("request_check", t, { ...ask, personagem: "Lizwan" }, jobId).catch((error: Error) => ({ error: error.message }))) as Record<string, unknown>)
                drafts.push(...takeDraftChecks(String(t.campaignId), jobId))
            },
            { kind: "narration", turnNumber: 27, round: 0 },
        )
        await waitForCampaignIdle(String(t.campaignId))
        expect(results[0]).toMatchObject({ requested: true })
        expect(String(results[0]!.aviso)).toContain("Orientação aparece na declaração, no lembrete ou no motivo de Lizwan")
        expect(results[0]!.efeitos).toBeUndefined()
        // Um teste por personagem: o segundo pedido é recusado, mas a prévia do primeiro ficou no rascunho.
        expect(results[1]).toMatchObject({ error: expect.stringContaining("Já existe um teste") })
        expect(drafts).toHaveLength(1)
    })

    it("com o efeito já registrado, o pedido traz a prévia e não avisa", async () => {
        const t = await table()
        await guidance(t)
        const results: Record<string, unknown>[] = []
        void enqueueMaddoxJob(
            String(t.campaignId),
            "test",
            async ({ jobId }) => {
                results.push((await tool("request_check", t, { personagem: "Lizwan", tipo: "pericia", pericia: "Sobrevivência", cd: 12, motivo: "Ler o chão sob a Orientação" }, jobId)) as Record<string, unknown>)
                const [draft] = takeDraftChecks(String(t.campaignId), jobId)
                results.push({ effects: draft?.effects })
            },
            { kind: "narration", turnNumber: 27, round: 0 },
        )
        await waitForCampaignIdle(String(t.campaignId))
        expect(results[0]).toMatchObject({ check: expect.stringContaining("+ 1d4 (Orientação)"), efeitos: ["Orientação: +1d4 entra neste teste"] })
        expect(results[0]!.aviso).toBeUndefined()
        expect(results[1]!.effects).toEqual([expect.objectContaining({ name: "Orientação", status: "expected", dice: "1d4" })])
    })
})
