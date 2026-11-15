import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose, { Types } from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * DND-66: bônus de CA nomeados e múltiplos na ficha, aplicados e removidos pelo Maddox (`add_armor_class_bonus` /
 * `remove_armor_class_bonus`), vencidos sozinhos (rodadas, concentração, fim do combate, descanso) e usados pelo ataque
 * do adversário (a CA da ficha é relida na hora da rolagem). Caso real: Escudo da Fé de Ravel em Lizwan (CA 15 → 17).
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
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({
    CharacterSheetPusherService: { getInstance: () => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }) },
}))
vi.mock("@/features/maddox/server/combat-prep-ai", async () => (await import("../../helpers/combat-prep-mock")).combatPrepAiModule)
vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)
vi.mock("@/features/maddox/server/settings", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/features/maddox/server/settings")>()
    const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
    return { ...actual, loadMaddoxSettings: vi.fn(async () => ({ settings: DEFAULT_MADDOX_SETTINGS, isDefault: true, updatedAt: null })) }
})

const { campaignMemoriesStore } = await import("../../helpers/campaign-memories-mock")
const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCombatModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")
const acBonuses = await import("@/features/maddox/server/armor-class-bonuses")
const tactical = await import("@/features/maddox/server/tactical-combat")
const { monsterAction } = await import("@/features/maddox/server/tactical-master")
const { enqueueMaddoxJob, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const runs = await import("@/features/maddox/server/question-runs")
const { freshEconomy } = await import("@/features/maddox/combat-rules")

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

const characterState = (actorKey: string, characterId: Types.ObjectId, name: string, sheetId: Types.ObjectId | null, extra: Record<string, unknown> = {}) => ({
    actorKey,
    characterId: String(characterId),
    memberId: String(new Types.ObjectId()),
    userId: String(new Types.ObjectId()),
    name,
    sheetId: sheetId ? String(sheetId) : null,
    conditions: [],
    flags: {},
    economy: freshEconomy(),
    concentration: null,
    stable: false,
    dead: false,
    hpZero: false,
    left: false,
    ready: null,
    ...extra,
})

/** Campanha Fiel ao D&D com Lizwan (couro + DES 19 = CA 15) e Ravel; com `combat`, um combate tático contra um rato. */
async function table(options: { combat?: boolean; rigor?: string } = {}) {
    const campaignId = new Types.ObjectId()
    const owner = String(new Types.ObjectId())
    const player = String(new Types.ObjectId())
    await MaddoxCampaignModel.collection.insertOne({ _id: campaignId, name: "Porão", ownerId: owner, rigor: options.rigor ?? "fiel-dnd", status: "active", turn: { number: 3, phase: "master" }, createdAt: new Date(), updatedAt: new Date() })
    const lizwan = { characterId: new Types.ObjectId(), sheetId: new Types.ObjectId() }
    const ravel = { characterId: new Types.ObjectId(), sheetId: new Types.ObjectId() }
    await MaddoxCharacterModel.collection.insertMany([
        { _id: lizwan.characterId, campaignId, memberId: new Types.ObjectId(), userId: player, name: "Lizwan", status: "active", sheetId: lizwan.sheetId },
        { _id: ravel.characterId, campaignId, memberId: new Types.ObjectId(), userId: owner, name: "Ravel", status: "active", sheetId: ravel.sheetId },
    ])
    await MaddoxCampaignMemberModel.collection.insertMany([
        { campaignId, userId: player, role: "player", status: "joined", characterId: lizwan.characterId, joinedAt: new Date(1), createdAt: new Date(1) },
        { campaignId, userId: owner, role: "owner", status: "joined", characterId: ravel.characterId, joinedAt: new Date(0), createdAt: new Date(0) },
    ])
    const abilities = { strength: 10, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 }
    await CharacterSheet.collection.insertMany([
        { _id: lizwan.sheetId, slug: `lizwan-${String(lizwan.sheetId)}`, userId: owner, name: "Lizwan", level: 1, dexterity: 19, ...abilities, hpMax: 9, hpCurrent: 9, armorClassBonuses: [], unarmoredDefense: { enabled: false, base: 10, attributes: [] }, updatedAt: new Date() },
        { _id: ravel.sheetId, slug: `ravel-${String(ravel.sheetId)}`, userId: owner, name: "Ravel", level: 1, dexterity: 10, ...abilities, hpMax: 12, hpCurrent: 12, armorClassBonuses: [], updatedAt: new Date() },
    ])
    await CharacterItem.collection.insertOne({ sheetId: lizwan.sheetId, name: "<p>Armadura de couro</p>", equipped: true, quantity: 1, catalogItemId: null, catalogItemType: "armadura", catalogAcType: "base", catalogAc: 11, catalogArmorType: "leve" })
    let combatId: Types.ObjectId | null = null
    if (options.combat) {
        combatId = new Types.ObjectId()
        const rat = {
            name: "Rato gigante",
            nameKey: "rato gigante",
            side: "inimigo",
            quantity: 1,
            description: "",
            condition: "",
            npcId: null,
            outcome: null,
            tactical: {
                actorKey: "npc:rato",
                groupKey: "rato",
                stats: { source: "custom", monsterId: null, ac: 12, hpMax: 7, hp: 7, tempHp: 0, initiativeBonus: 2, dexterity: 15, saves: { strength: -2, dexterity: 2, constitution: 0, intelligence: -4, wisdom: 0, charisma: -3 }, resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [], actions: [{ name: "Mordida", kind: "attack", bonus: 5, dc: null, ability: null, damage: null, damageType: null, halfOnSave: false, ranged: false, recharge: null, available: true }], multiattack: 1 },
                conditions: [],
                flags: {},
                economy: freshEconomy(),
                concentration: null,
                defeated: false,
            },
        }
        await MaddoxCombatModel.collection.insertOne({
            _id: combatId,
            campaignId,
            status: "active",
            mode: "tactical",
            title: "Ratos no porão",
            location: "Porão",
            startedTurn: 1,
            endedTurn: null,
            masterTurns: 0,
            combatants: [rat],
            rev: 0,
            tactical: {
                mode: "tactical",
                phase: "running",
                round: 1,
                activeIndex: 2,
                order: [
                    { actorKey: `pc:${lizwan.characterId}`, kind: "character", name: "Lizwan", total: 21, d20: 17, modifier: 4, dexterity: 19, joinIndex: 0, groupKey: `pc:${lizwan.characterId}` },
                    { actorKey: `pc:${ravel.characterId}`, kind: "character", name: "Ravel", total: 9, d20: 9, modifier: 0, dexterity: 10, joinIndex: 1, groupKey: `pc:${ravel.characterId}` },
                    { actorKey: "npc:rato", kind: "combatant", name: "Rato gigante", total: 5, d20: 3, modifier: 2, dexterity: 15, joinIndex: 2, groupKey: "rato" },
                ],
                characters: [
                    characterState(`pc:${lizwan.characterId}`, lizwan.characterId, "Lizwan", lizwan.sheetId),
                    characterState(`pc:${ravel.characterId}`, ravel.characterId, "Ravel", ravel.sheetId, { concentration: { spell: "Escudo da Fé", sinceRound: 1 } }),
                ],
                surprise: null,
                staleEndNarrations: 0,
                queue: ["npc:rato"],
                nextKey: null,
                queueTurn: 3,
                block: { kind: "npc", actorKey: "npc:rato", waits: 0, startRound: 0 },
                acted: [],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        })
    }
    return { campaignId, owner, player, lizwan, ravel, combatId }
}

type Table = Awaited<ReturnType<typeof table>>
const tool = (name: string, t: Table, input: Record<string, unknown>, jobId?: string) => runMaddoxTool(findMaddoxTool(name)!, { campaignId: t.campaignId, turnNumber: 3, ...(jobId ? { jobId } : {}) }, input)
const add = (t: Table, input: Record<string, unknown>, jobId?: string) => tool("add_armor_class_bonus", t, { personagem: "Lizwan", origem: "magia", motivo: "Ravel conjurou", ...input }, jobId)
const bonusesOf = async (sheetId: Types.ObjectId) => ((await CharacterSheet.collection.findOne({ _id: sheetId }))?.armorClassBonuses ?? []) as { name: string; value: number; duration: { kind: string } }[]
const linesOf = async (t: Table) => (await MaddoxCampaignMessageModel.find({ campaignId: t.campaignId, kind: "sheet-change" }).sort({ _id: 1 }).lean()).map((line) => line.content)

describe("DND-66 — bônus de CA nomeados pelo Maddox", () => {
    it("Escudo da Fé + Cobertura parcial somam na CA; remover um não afeta o outro; linha na mesa e auditoria", async () => {
        const t = await table()
        expect(await acBonuses.loadArmorClass(String(t.lizwan.sheetId))).toBe(15)
        const first = await add(t, { nome: "Escudo da Fé", valor: 2, duracao: "permanente" })
        expect(first).toMatchObject({ saved: true, personagem: "Lizwan", caAntes: 15, ca: 17, bonusDeCA: ["Escudo da Fé +2 (permanente)"] })
        const second = await add(t, { nome: "Cobertura parcial", valor: 2, origem: "situacao", duracao: "momento", momento: "sair de trás dos barris" })
        expect(second).toMatchObject({ ca: 19, bonusDeCA: ["Escudo da Fé +2 (permanente)", "Cobertura parcial +2 (até sair de trás dos barris)"] })
        const summary = (await acBonuses.loadArmorClassSummaries([String(t.lizwan.sheetId)])).get(String(t.lizwan.sheetId))!
        expect(summary.parts?.map((part) => `${part.label} ${part.value}`)).toEqual(["Armadura de couro 11", "Destreza +4", "Escudo da Fé +2", "Cobertura parcial +2"])

        const removed = await tool("remove_armor_class_bonus", t, { personagem: "Lizwan", nome: "cobertura PARCIAL", motivo: "Saiu de trás dos barris" })
        expect(removed).toMatchObject({ ca: 17, bonusDeCA: ["Escudo da Fé +2 (permanente)"] })
        expect((await bonusesOf(t.lizwan.sheetId)).map((bonus) => bonus.name)).toEqual(["Escudo da Fé"])
        expect(await linesOf(t)).toEqual([
            "CA de Lizwan: 15 → 17 (Escudo da Fé +2, permanente — Ravel conjurou)",
            "CA de Lizwan: 17 → 19 (Cobertura parcial +2, até sair de trás dos barris — Ravel conjurou)",
            "CA de Lizwan: 19 → 17 (Cobertura parcial +2 removido — Saiu de trás dos barris)",
        ])
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FichaPersonagem", entidadeId: String(t.lizwan.sheetId), depois: expect.objectContaining({ by: "maddox", armorClass: 17, removed: "Cobertura parcial" }) }))
    })

    it("mesmo nome substitui (não acumula); remover um bônus inexistente devolve os atuais e não muda a ficha", async () => {
        const t = await table()
        await add(t, { nome: "Escudo da Fé", valor: 2, duracao: "permanente" })
        expect(await add(t, { nome: "escudo da fe", valor: 3, duracao: "permanente" })).toMatchObject({ ca: 18, bonusDeCA: ["escudo da fe +3 (permanente)"] })
        const before = await CharacterSheet.collection.findOne({ _id: t.lizwan.sheetId })
        await expect(tool("remove_armor_class_bonus", t, { personagem: "Lizwan", nome: "Armadura Arcana", motivo: "x" })).rejects.toThrow('Lizwan não tem o bônus de CA "Armadura Arcana". Bônus atuais: escudo da fe +3 (permanente).')
        expect(await CharacterSheet.collection.findOne({ _id: t.lizwan.sheetId })).toEqual(before)
    })

    it("recusa duração de combate sem combate e valor 0; jogador comum não mexe na CA de outro personagem", async () => {
        const t = await table()
        await expect(add(t, { nome: "Escudo da Fé", valor: 2, duracao: "fim-do-combate" })).rejects.toThrow("Não há combate em andamento")
        await expect(add(t, { nome: "Escudo da Fé", valor: 2, duracao: "concentracao", conjurador: "Ravel" })).rejects.toThrow("Não há combate tático em andamento")
        await expect(add(t, { nome: "Nada", valor: 0, duracao: "permanente" })).rejects.toThrow()
        const jobId = "job-question"
        runs.openQuestionRun({ campaignId: String(t.campaignId), jobId, turnNumber: 3, questionId: String(new Types.ObjectId()), askerUserId: t.owner, askerCharacterId: String(t.ravel.characterId), askerIsOwner: false, playerTexts: [] })
        try {
            await expect(add(t, { nome: "Escudo da Fé", valor: 2, duracao: "permanente" }, jobId)).rejects.toThrow("Quem perguntou só pode mudar a CA do próprio personagem.")
            // Revisão F1: o jogador comum não grava bônus permanente (ou até o descanso) de item/magia/talento sem a fonte do catálogo.
            for (const [origem, duracao] of [["item", "permanente"], ["magia", "descanso-longo"], ["talento", "descanso-curto"]] as const) {
                await expect(tool("add_armor_class_bonus", t, { personagem: "Ravel", nome: "Anel de Proteção +3", valor: 3, origem, duracao, motivo: "Tenho um anel" }, jobId)).rejects.toThrow("update_character_sheet")
            }
            expect(await bonusesOf(t.ravel.sheetId)).toEqual([])
            expect(await tool("add_armor_class_bonus", t, { personagem: "Ravel", nome: "Cobertura parcial", valor: 2, origem: "situacao", duracao: "permanente", motivo: "Atrás do muro" }, jobId)).toMatchObject({ saved: true, personagem: "Ravel" })
            expect(await tool("add_armor_class_bonus", t, { personagem: "Ravel", nome: "Escudo da Fé", valor: 2, origem: "magia", duracao: "momento", momento: "o fim da cena", motivo: "Bênção" }, jobId)).toMatchObject({ saved: true })
        } finally {
            runs.closeQuestionRun(jobId)
        }
        const ownerJob = "job-owner"
        runs.openQuestionRun({ campaignId: String(t.campaignId), jobId: ownerJob, turnNumber: 3, questionId: String(new Types.ObjectId()), askerUserId: t.owner, askerCharacterId: String(t.ravel.characterId), askerIsOwner: true, playerTexts: [] })
        try {
            expect(await tool("add_armor_class_bonus", t, { personagem: "Ravel", nome: "Anel de Proteção", valor: 1, origem: "item", duracao: "permanente", motivo: "O dono corrige" }, ownerJob)).toMatchObject({ saved: true, ca: 15 })
        } finally {
            runs.closeQuestionRun(ownerJob)
        }
        expect(await bonusesOf(t.lizwan.sheetId)).toEqual([])
    })
})

describe("DND-66 — lista fechada da ficha (Pergunte ao mestre, preparação)", () => {
    it("bônus permanente de regra exige a fonte lida; temporário de situação não; Defesa sem Armadura com fonte", async () => {
        const t = await table()
        const sheetTools = await import("@/features/maddox/server/question-sheet-tools")
        const { recordCatalogRead } = await import("@/features/maddox/server/catalog-reads")
        const jobId = "job-sheet"
        const run = runs.openQuestionRun({ campaignId: String(t.campaignId), jobId, turnNumber: 3, questionId: String(new Types.ObjectId()), askerUserId: t.player, askerCharacterId: String(t.lizwan.characterId), askerIsOwner: false, playerTexts: ["minha CA está errada"] })
        try {
            const featId = String(new Types.ObjectId())
            const first = await sheetTools.updateCharacterSheetFromQuestion(jobId, { personagem: "Lizwan", alteracoes: [{ type: "ac-bonus-upsert", name: "Estilo de Luta: Defesa", value: 1, origin: "talento", reason: "Estilo de luta" }] })
            expect(first.aplicadas).toEqual([])
            expect(first.recusadas[0]!.motivo).toContain("get_catalog_entity")
            recordCatalogRead(run.reads, "Talento", featId, { name: "Defesa", description: "Enquanto estiver usando armadura, você recebe +1 de bônus na CA." })
            const second = await sheetTools.updateCharacterSheetFromQuestion(jobId, {
                personagem: "Lizwan",
                alteracoes: [
                    { type: "ac-bonus-upsert", name: "Estilo de Luta: Defesa", value: 1, origin: "talento", reason: "Estilo de luta", source: { ref: `Talento:${featId}`, quote: "você recebe +1 de bônus na CA" } },
                    { type: "ac-bonus-upsert", name: "Cobertura parcial", value: 2, origin: "situacao", duration: "momento", moment: "sair dos barris", reason: "Atrás dos barris" },
                ],
            })
            expect(second.aplicadas).toEqual(["Bônus de CA Estilo de Luta: Defesa: não existia → Estilo de Luta: Defesa +1 (permanente)", "Bônus de CA Cobertura parcial: não existia → Cobertura parcial +2 (até sair dos barris)"])
            expect(await acBonuses.loadArmorClass(String(t.lizwan.sheetId))).toBe(18)
            const removed = await sheetTools.updateCharacterSheetFromQuestion(jobId, { personagem: "Lizwan", alteracoes: [{ type: "ac-bonus-remove", name: "Cobertura parcial", reason: "Saiu" }, { type: "ac-bonus-remove", name: "Nada", reason: "x" }] })
            expect(removed.aplicadas).toEqual(["Bônus de CA Cobertura parcial: Cobertura parcial +2 (até sair dos barris) → removido"])
            expect(removed.naoAplicadas[0]).toContain("não existe (atuais: Estilo de Luta: Defesa +1 (permanente))")
            expect(await acBonuses.loadArmorClass(String(t.lizwan.sheetId))).toBe(16)
        } finally {
            runs.closeQuestionRun(jobId)
        }
    })
})

describe("DND-66 — duração: rodadas, concentração, fim do combate e descanso", () => {
    it("rodadas saem quando a rodada vira; concentração sai quando o conjurador perde a concentração", async () => {
        const t = await table({ combat: true })
        expect(await add(t, { nome: "Escudo da Fé", valor: 2, duracao: "concentracao", conjurador: "Ravel" })).toMatchObject({ ca: 17, bonusDeCA: ["Escudo da Fé +2 (concentração de Ravel)"] })
        expect(await add(t, { nome: "Cobertura parcial", valor: 2, origem: "situacao", duracao: "rodadas", rodadas: 1 })).toMatchObject({ ca: 19 })

        // Gravação do combate sem mudar nada: nenhum bônus vence.
        await tactical.mutateTactical(t.campaignId, () => undefined)
        expect((await bonusesOf(t.lizwan.sheetId)).map((bonus) => bonus.name)).toEqual(["Escudo da Fé", "Cobertura parcial"])

        await tactical.mutateTactical(t.campaignId, (combat) => {
            combat.tactical.round = 2
        })
        expect((await bonusesOf(t.lizwan.sheetId)).map((bonus) => bonus.name)).toEqual(["Escudo da Fé"])

        await tactical.mutateTactical(t.campaignId, (combat) => {
            combat.tactical.characters.find((state) => state.name === "Ravel")!.concentration = null
        })
        expect(await bonusesOf(t.lizwan.sheetId)).toEqual([])
        expect(await linesOf(t)).toEqual([
            "CA de Lizwan: 15 → 17 (Escudo da Fé +2, concentração de Ravel — Ravel conjurou)",
            "CA de Lizwan: 17 → 19 (Cobertura parcial +2, 1 rodada (até a rodada 1) — Ravel conjurou)",
            "CA de Lizwan: 19 → 17 (Cobertura parcial +2 terminou: acabaram as rodadas)",
            "CA de Lizwan: 17 → 15 (Escudo da Fé +2 terminou: a concentração terminou)",
        ])
    })

    it("fim do combate tira os bônus ligados a ele e não vaza para o próximo combate; descanso tira os de descanso", async () => {
        const t = await table({ combat: true })
        await add(t, { nome: "Escudo da Fé", valor: 2, duracao: "fim-do-combate" })
        await add(t, { nome: "Bênção do templo", valor: 1, origem: "outro", duracao: "descanso-longo" })
        await add(t, { nome: "Anel de Proteção", valor: 1, origem: "item", duracao: "permanente" })
        expect(await acBonuses.loadArmorClass(String(t.lizwan.sheetId))).toBe(19)

        await MaddoxCombatModel.collection.updateOne({ _id: t.combatId! }, { $set: { status: "ended" } })
        await acBonuses.endCombatArmorClassBonuses(t.campaignId, t.combatId!)
        expect((await bonusesOf(t.lizwan.sheetId)).map((bonus) => bonus.name)).toEqual(["Bênção do templo", "Anel de Proteção"])
        expect((await linesOf(t)).at(-1)).toBe("CA de Lizwan: 19 → 17 (Escudo da Fé +2 terminou: fim do combate)")

        // Sobra de um combate antigo (falha no meio do fim): sai quando o combate seguinte começa.
        const stale = { id: "old", name: "Escudo da Fé", value: 2, origin: "spell", duration: { kind: "combat", combatId: String(new Types.ObjectId()) }, addedBy: "maddox" }
        await CharacterSheet.collection.updateOne({ _id: t.lizwan.sheetId }, { $push: { armorClassBonuses: stale } } as never)
        await acBonuses.staleCombatArmorClassBonuses(t.campaignId, new Types.ObjectId())
        expect((await bonusesOf(t.lizwan.sheetId)).map((bonus) => bonus.name)).toEqual(["Bênção do templo", "Anel de Proteção"])

        await acBonuses.restArmorClassBonuses(t.campaignId, [t.lizwan.characterId], "short")
        expect((await bonusesOf(t.lizwan.sheetId)).map((bonus) => bonus.name)).toEqual(["Bênção do templo", "Anel de Proteção"])
        await acBonuses.restArmorClassBonuses(t.campaignId, [t.lizwan.characterId], "long")
        expect((await bonusesOf(t.lizwan.sheetId)).map((bonus) => bonus.name)).toEqual(["Anel de Proteção"])
    })
})

describe("DND-66 — ataque do adversário usa a CA nova", () => {
    it("Escudo da Fé aplicado no mesmo job: 16 erra contra CA 17 (sem o bônus acertaria a CA 15)", async () => {
        const t = await table({ combat: true })
        const results: Record<string, unknown>[] = []
        void enqueueMaddoxJob(
            String(t.campaignId),
            "test",
            async ({ jobId }) => {
                serverDice.push([11])
                results.push(await monsterAction(t.campaignId, jobId, 3, { combatente: "Rato gigante", acao: "Mordida", alvos: ["Lizwan"] }))
                await add(t, { nome: "Escudo da Fé", valor: 2, duracao: "concentracao", conjurador: "Ravel" }, jobId)
                serverDice.push([11])
                // Segundo ataque (ataque de oportunidade) do mesmo rato, já com o bônus gravado no meio do job.
                results.push(await monsterAction(t.campaignId, jobId, 3, { combatente: "Rato gigante", acao: "Mordida", alvos: ["Lizwan"], reacao: true }))
            },
            { kind: "narration", turnNumber: 3, round: 0 },
        )
        await waitForCampaignIdle(String(t.campaignId))
        expect(results[0]).toMatchObject({ ataque: { total: 16, ca: 15, acertou: true } })
        expect(results[1]).toMatchObject({ ataque: { total: 16, ca: 17, acertou: false } })
    })
})

describe("DND-66 — revisão F4: ligações reais (mesa e fim do combate)", () => {
    it("getGameState: cada participante traz a CA calculada da ficha; o Escudo da reação soma +5; sem ficha no grau narrativo", async () => {
        const t = await table({ combat: true })
        await MaddoxCampaignModel.collection.updateOne({ _id: t.campaignId }, { $set: { status: "paused" } })
        await add(t, { nome: "Escudo da Fé", valor: 2, duracao: "concentracao", conjurador: "Ravel" })
        await MaddoxCombatModel.collection.updateOne({ _id: t.combatId!, "tactical.characters.name": "Ravel" }, { $set: { "tactical.characters.$.flags.shield": true } })
        const { getGameState } = await import("@/features/maddox/server/game")
        const state = await getGameState(String(t.campaignId), t.owner)
        const summaries = await acBonuses.loadArmorClassSummaries([String(t.lizwan.sheetId), String(t.ravel.sheetId)])
        const lizwan = state.participants.find((item) => item.characterName === "Lizwan")!
        const ravel = state.participants.find((item) => item.characterName === "Ravel")!
        expect(lizwan.armorClass).toEqual({ value: 17, formula: summaries.get(String(t.lizwan.sheetId))!.formula, parts: summaries.get(String(t.lizwan.sheetId))!.parts })
        expect(lizwan.armorClass!.parts.map((part) => part.label)).toContain("Escudo da Fé")
        expect(ravel.armorClass).toMatchObject({ value: 15, formula: "Base(10) + Escudo(5) = 15" })
        expect(ravel.armorClass!.parts.at(-1)).toEqual({ label: "Escudo (reação)", value: "+5", color: "bonus" })

        const narrative = await table({ rigor: "narrativo" })
        await MaddoxCampaignModel.collection.updateOne({ _id: narrative.campaignId }, { $set: { status: "paused" } })
        const free = await getGameState(String(narrative.campaignId), narrative.owner)
        expect(free.participants.map((item) => item.armorClass)).toEqual([undefined, undefined])
    })

    it("fim do combate pelo caminho real (finishCombatTurn → afterCombatEnded): o bônus do combate sai e o permanente fica", async () => {
        const t = await table({ combat: true })
        await add(t, { nome: "Escudo da Fé", valor: 2, duracao: "fim-do-combate" })
        await add(t, { nome: "Anel de Proteção", valor: 1, origem: "item", duracao: "permanente" })
        await MaddoxCombatModel.collection.updateOne({ _id: t.combatId! }, { $set: { status: "ended", endedTurn: 3, outcome: "vitoria", summary: "Os ratos caíram.", masterNotes: "", rewards: [], characterOutcomes: [], finalScene: "", endedAt: new Date() } })
        const { finishCombatTurn } = await import("@/features/maddox/server/combat")
        await finishCombatTurn({ _id: t.campaignId, rigor: "fiel-dnd", ownerId: t.owner } as never, 3, 0)
        expect((await bonusesOf(t.lizwan.sheetId)).map((bonus) => bonus.name)).toEqual(["Anel de Proteção"])
        expect(await linesOf(t)).toContain("CA de Lizwan: 18 → 16 (Escudo da Fé +2 terminou: fim do combate)")
        expect(await MaddoxCombatModel.collection.findOne({ _id: t.combatId! })).toMatchObject({ effectsApplied: true })
    })
})

