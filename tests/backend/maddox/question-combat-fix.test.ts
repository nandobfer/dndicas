import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * DND-59 — o "Pergunte ao mestre" e o lembrete corrigem o combate tático NA HORA (`question-combat-tools.ts`): condição,
 * card pendente (modo, alvo, cancelar), adversário e economia/flags do personagem. Fora da execução de uma resposta, as
 * ferramentas recusam; o texto livre do Diário avisa que não muda o combate; o Rolar espera a revisão do mestre; e o
 * Esconder-se antes da luta faz o personagem começar Invisível.
 */

const dice = { players: new Map<string, number[][]>() }
const scripted = (queue: number[][] | undefined) => {
    const values = queue?.shift() ?? []
    let index = 0
    return (min: number, max: number) => values[index++] ?? Math.floor((min + max - 1) / 2)
}

vi.mock("@/features/maddox/server/combat-prep-ai", async () => (await import("../../helpers/combat-prep-mock")).combatPrepAiModule)
vi.mock("@/features/dice-roller/server/dice-roll-service", () => ({
    rollGeneralDice: async (input: never, target: { targetId: string }) => {
        const { rollDice } = await import("@/features/dice-roller/server/dice-engine")
        return rollDice(input, { randomInt: scripted(dice.players.get(target.targetId.replace("user:", ""))) })
    },
}))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({
    CharacterSheetPusherService: { getInstance: () => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }) },
}))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({
        settings: { enabled: true, main: { provider: "gemini", model: "m", agent: null, variant: null, temperature: null, maxOutputTokens: null }, instructions: "Maddox.", avatar: { url: null }, opencode: {}, jev: {} },
        isDefault: false,
        updatedAt: null,
    })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/features/ai/server/memory-block", () => ({ memoryBlock: vi.fn(async () => "") }))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: vi.fn(async () => undefined) }))
vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def, stepCountIs: (count: number) => ({ count }) }))

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCombatModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const actions = await import("@/features/maddox/server/tactical-actions")
const tactical = await import("@/features/maddox/server/tactical-combat")
const runs = await import("@/features/maddox/server/question-runs")
const fixTools = await import("@/features/maddox/server/question-combat-tools")
const masterTools = await import("@/features/maddox/server/master-tools")
const live = await import("@/features/maddox/server/game-live")
const stealth = await import("@/features/maddox/server/stealth-start")
const { monsterStatsFromCustom } = await import("@/features/maddox/server/combat-monsters")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const { ItemModel } = await import("@/features/items/database/item")
const { recordAudit } = await import("@/lib/db")

let mongo: MongoMemoryServer
const oid = () => new mongoose.Types.ObjectId()

async function seedUser(username: string) {
    const _id = oid()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username, email: `${username}@x.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function character(campaignId: string, userId: string, name: string) {
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const sheetId = oid()
    await CharacterSheet.collection.insertOne({ _id: sheetId, slug: `${name}-${String(sheetId)}`, userId, name, level: 3, strength: 14, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10, savingThrows: {}, skills: {}, hpMax: 20, hpCurrent: 20, hpTemp: 0, deathSavesSuccess: 0, deathSavesFailure: 0, spellSlots: {}, resourceCharges: [], coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } })
    await ItemModel.collection.updateOne({ name: "Espada" }, { $setOnInsert: { _id: oid(), name: "Espada", type: "arma", status: "active", damageDice: { quantidade: 1, tipo: "d8" }, damageType: "cortante", properties: [] } }, { upsert: true })
    const sword = await ItemModel.collection.findOne({ name: "Espada" })
    await CharacterItem.collection.insertOne({ sheetId, catalogItemId: sword!._id, name: "<p>Espada</p>", quantity: 1, equipped: true, catalogItemType: "arma", notes: "" })
    const created = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name, profile: {}, interview: { status: "done", scriptVersion: 0 }, sheetId })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: created._id } })
    return { userId, memberId: String(member!._id), characterId: String(created._id), sheetId: String(sheetId), actorKey: `pc:${String(created._id)}` }
}

/** Kael (dono) e Lyra contra um Goblin, na vez do Kael. */
async function scene() {
    const owner = await seedUser("kael")
    const created = await campaigns.createCampaign({ name: "Porão", rigor: "fiel-dnd" }, owner)
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const lyraUser = await seedUser("lyra")
    await campaigns.joinByInvite(token, lyraUser)
    const kael = await character(created.id, owner, "Kael")
    const lyra = await character(created.id, lyraUser, "Lyra")
    const characters = await tactical.combatCharacters(new mongoose.Types.ObjectId(created.id))
    const goblin = tactical.combatantState("npc:gob", "goblin", monsterStatsFromCustom({ ca: 12, pv: 7, acoes: [{ nome: "Faca", tipo: "ataque", bonus: 4, dano: "1d4+2", tipoDano: "perfurante" }] }))
    const combat = await MaddoxCombatModel.create({
        campaignId: created.id,
        status: "active",
        mode: "tactical",
        title: "Porão",
        startedTurn: 1,
        combatants: [
            { name: "Goblin", nameKey: "goblin", side: "inimigo", quantity: 1, description: "", condition: "", npcId: null, outcome: null, tactical: goblin },
            { name: "Rato", nameKey: "rato", side: "inimigo", quantity: 1, description: "", condition: "", npcId: null, outcome: null, tactical: tactical.combatantState("npc:rat", "rato", monsterStatsFromCustom({ ca: 10, pv: 5, acoes: [{ nome: "Mordida", tipo: "ataque", bonus: 2, dano: "1d4", tipoDano: "perfurante" }] })) },
        ],
        tactical: {
            mode: "tactical",
            phase: "running",
            round: 1,
            activeIndex: 0,
            order: [
                { actorKey: kael.actorKey, kind: "character", name: "Kael", total: 15, d20: 14, modifier: 1, dexterity: 12, joinIndex: 0, groupKey: kael.actorKey },
                { actorKey: "npc:gob", kind: "combatant", name: "Goblin", total: 10, d20: 8, modifier: 2, dexterity: 14, joinIndex: 2, groupKey: "goblin" },
                { actorKey: "npc:rat", kind: "combatant", name: "Rato", total: 9, d20: 8, modifier: 1, dexterity: 12, joinIndex: 3, groupKey: "rato" },
                { actorKey: lyra.actorKey, kind: "character", name: "Lyra", total: 5, d20: 4, modifier: 1, dexterity: 12, joinIndex: 1, groupKey: lyra.actorKey },
            ],
            characters,
            surprise: null,
            staleEndNarrations: 0,
            queue: [],
            nextKey: null,
            queueTurn: null,
        },
        rev: 0,
    })
    await MaddoxCampaignModel.updateOne(
        { _id: created.id },
        {
            $set: {
                status: "active",
                "scenarioInterview.status": "done",
                turn: { number: 2, phase: "players", startedAt: new Date(), eligibleMemberIds: [new mongoose.Types.ObjectId(kael.memberId)], declaredMemberIds: [], generating: null, failedAt: null, checkRound: 0, awaitingChecks: false, combatActor: { combatId: combat._id, actorKey: kael.actorKey, memberId: new mongoose.Types.ObjectId(kael.memberId), offlineSince: null } },
            },
        },
    )
    return { id: created.id, owner, kael, lyra, combatId: combat._id }
}

const combatOf = async (id: string) => (await MaddoxCombatModel.findOne({ campaignId: id }).lean())!
const stateOf = async (id: string, actorKey: string) => (await combatOf(id)).tactical!.characters.find((state) => state.actorKey === actorKey)!
const enemyOf = async (id: string, key: string) => (await combatOf(id)).combatants.find((item) => item.tactical?.actorKey === key)!
const lastAction = async (id: string) => (await MaddoxCampaignMessageModel.findOne({ campaignId: id, kind: "combat-action" }).sort({ _id: -1 }).lean())!
const fixLines = async (id: string) => (await MaddoxCampaignMessageModel.find({ campaignId: id, kind: "combat-fix" }).sort({ _id: 1 }).lean()).map((message) => message.content)

let jobSeq = 0
/** Abre a execução de uma resposta (pergunta de `userId`); devolve o jobId e o fechamento. */
async function openRun(id: string, userId: string) {
    const jobId = `q-${++jobSeq}`
    const question = await MaddoxCampaignMessageModel.create({ campaignId: id, turnNumber: 2, phase: "players", kind: "question", userId, characterName: "Kael", content: "corrija" })
    runs.openQuestionRun({ campaignId: id, jobId, turnNumber: 2, questionId: String(question._id), askerUserId: userId, askerCharacterId: null, askerIsOwner: false, playerTexts: [] })
    return { jobId, close: () => runs.closeQuestionRun(jobId) }
}

async function swordOf(id: string, userId: string) {
    const options = (await game.getGameState(id, userId)).me.combat!.options!
    return options.action.find((option) => option.id.startsWith("weapon:"))!
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_question_combat_fix_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxCombatModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})))
    dice.players.clear()
    vi.mocked(recordAudit).mockClear()
})

describe("DND-59 — correções do combate pelo Pergunte ao mestre", () => {
    it("fora da execução de uma resposta, ou sem combate tático, as ferramentas recusam com o motivo", async () => {
        const { id, kael } = await scene()
        await expect(fixTools.setCombatCondition("sem-job", { alvo: "Kael", condicao: "Invisível", motivo: "x" })).rejects.toThrow('Esta ferramenta só funciona na resposta a uma pergunta do "Pergunte ao mestre" ou a um lembrete.')
        const run = await openRun(id, kael.userId)
        await expect(fixTools.setCombatCondition(run.jobId, { alvo: "Dragão", condicao: "Invisível", motivo: "x" })).rejects.toThrow('"Dragão" não está neste combate. Participantes: Kael, Goblin, Rato, Lyra.')
        await expect(fixTools.setCombatCondition(run.jobId, { alvo: "Kael", condicao: "Voando", motivo: "x" })).rejects.toThrow('Condição "Voando" desconhecida.')
        await MaddoxCombatModel.deleteMany({ campaignId: id })
        await expect(fixTools.setCombatCondition(run.jobId, { alvo: "Kael", condicao: "Invisível", motivo: "x" })).rejects.toThrow("Não há combate tático em andamento")
        run.close()
        expect(await fixLines(id)).toEqual([])
    })

    it("pela ferramenta do mestre (runMaddoxTool): a recusa vira erro para o modelo e o estado não muda", async () => {
        const { id, kael } = await scene()
        const run = await openRun(id, kael.userId)
        const tool = masterTools.findMaddoxTool("set_combat_condition")!
        await expect(masterTools.runMaddoxTool(tool, { campaignId: new mongoose.Types.ObjectId(id), turnNumber: 2, jobId: run.jobId }, { alvo: "Ninguém", condicao: "Invisível", motivo: "x" })).rejects.toThrow(masterTools.MaddoxToolError)
        expect((await stateOf(id, kael.actorKey)).conditions).toEqual([])
        const ok = await masterTools.runMaddoxTool(tool, { campaignId: new mongoose.Types.ObjectId(id), turnNumber: 2, jobId: run.jobId }, { alvo: "Goblin", condicao: "Caído", motivo: "Escorregou na farinha" })
        run.close()
        expect(ok).toMatchObject({ aplicado: true, condicoes: ["Caído"] })
        expect((await enemyOf(id, "npc:gob")).tactical!.conditions).toEqual([{ key: "prone", untilRound: null, source: "Escorregou na farinha" }])
        expect(await fixLines(id)).toEqual(["Goblin está Caído — Escorregou na farinha"])
        expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ userId: kael.userId, entidadeId: id, acao: "ATUALIZAR", depois: expect.objectContaining({ combatFix: "set_combat_condition", condition: "prone" }) }))
    })

    it("remover condição e condição com duração; a imunidade não grava nada", async () => {
        const { id, kael } = await scene()
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "combatants.0.tactical.stats.conditionImmunities": ["poisoned"] } })
        const run = await openRun(id, kael.userId)
        expect(await fixTools.setCombatCondition(run.jobId, { alvo: "Goblin", condicao: "envenenado", motivo: "veneno" })).toMatchObject({ aplicado: false, resultado: "Goblin é imune a Envenenado" })
        await fixTools.setCombatCondition(run.jobId, { alvo: "Lyra", condicao: "Amedrontado", duracaoRodadas: 2, motivo: "rugido" })
        expect((await stateOf(id, (await combatOf(id)).tactical!.characters[1]!.actorKey)).conditions).toEqual([{ key: "frightened", untilRound: 3, source: "rugido" }])
        await fixTools.setCombatCondition(run.jobId, { alvo: "Lyra", condicao: "Amedrontado", remover: true, motivo: "passou" })
        run.close()
        expect(await fixLines(id)).toEqual(["Lyra está Amedrontado por 2 rodada(s) — rugido", "Lyra não está mais Amedrontado — passou"])
    })

    it("editar o card pendente: vantagem da situação com o motivo (a rolagem sai com dois d20), troca de alvo e volta ao normal", async () => {
        const { id, kael } = await scene()
        const sword = await swordOf(id, kael.userId)
        await actions.submitCombatAction(id, { economy: "action", optionId: sword.id, targets: ["npc:gob"] }, kael.userId)
        const card = await lastAction(id)
        const run = await openRun(id, kael.userId)
        const read = await fixTools.readCombatForFix(run.jobId)
        expect(read.cardsPendentes).toEqual([expect.objectContaining({ card: String(card._id).slice(-6), ator: "Kael", passos: expect.arrayContaining([expect.objectContaining({ tipo: "attack", alvo: "Goblin", modo: "normal" })]) })])
        expect(read.economia).toEqual(expect.arrayContaining([expect.objectContaining({ personagem: "Kael", acao: false })]))
        const edited = await fixTools.editCombatAction(run.jobId, { card: String(card._id).slice(-6), modo: "vantagem", alvo: "Rato", motivo: "o rato está preso na ratoeira" })
        expect(edited).toMatchObject({ aplicado: true, modoDoAtaque: "vantagem", motivos: ["o rato está preso na ratoeira"] })
        const after = (await lastAction(id)).combatAction!
        expect(after.targets).toEqual([{ actorKey: "npc:rat", name: "Rato" }])
        expect(after.steps.map((step) => step.targetKey)).toEqual(["npc:rat", "npc:rat"])
        expect(after.steps[0]).toMatchObject({ mode: "advantage", situationalMode: { mode: "advantage", reason: "o rato está preso na ratoeira" } })
        // "normal" tira a vantagem da situação.
        await fixTools.editCombatAction(run.jobId, { ator: "Kael", modo: "normal", motivo: "a ratoeira soltou" })
        expect((await lastAction(id)).combatAction!.steps[0]).toMatchObject({ mode: "normal", situationalMode: null })
        await fixTools.editCombatAction(run.jobId, { ator: "Kael", modo: "vantagem", motivo: "preso de novo" })
        run.close()
        dice.players.set(kael.userId, [[3, 1]])
        await actions.rollCombatAction(id, String(card._id), kael.userId)
        const step = (await lastAction(id)).combatAction!.steps[0]!
        expect(step).toMatchObject({ status: "done", mode: "advantage", modeReasons: ["preso de novo"] })
        expect(step.roll!.selectedD20).toMatchObject({ kept: 3, reason: "advantage" })
        // Já rolado: não se corrige mais.
        const late = await openRun(id, kael.userId)
        await expect(fixTools.editCombatAction(late.jobId, { card: String(card._id).slice(-6), modo: "desvantagem", motivo: "x" })).rejects.toThrow()
        late.close()
    })

    it("cancelar o card pendente devolve a Ação ao jogador", async () => {
        const { id, kael } = await scene()
        const sword = await swordOf(id, kael.userId)
        await actions.submitCombatAction(id, { economy: "action", optionId: sword.id, targets: ["npc:gob"] }, kael.userId)
        expect((await stateOf(id, kael.actorKey)).economy.action).toBe(false)
        const run = await openRun(id, kael.userId)
        await fixTools.editCombatAction(run.jobId, { ator: "Kael", cancelar: true, motivo: "o alvo estava errado" })
        run.close()
        expect((await lastAction(id)).combatAction!.status).toBe("cancelled")
        expect((await stateOf(id, kael.actorKey)).economy.action).toBe(true)
        expect(await fixLines(id)).toEqual(["Card de Kael (Espada) cancelado; a ação volta — o alvo estava errado"])
    })

    it("card que já gastou espaço de magia, carga ou item no envio não é cancelado pelo mestre (o recurso não se perde)", async () => {
        const { id, kael } = await scene()
        const sword = await swordOf(id, kael.userId)
        await actions.submitCombatAction(id, { economy: "action", optionId: sword.id, targets: ["npc:gob"] }, kael.userId)
        // Como um card de magia de 1º círculo: o envio já gastou o espaço e o card nasce sem "cancelar".
        await MaddoxCampaignMessageModel.updateOne({ _id: (await lastAction(id))._id }, { $set: { "combatAction.cancellable": false, "combatAction.spellLevel": 1 } })
        const run = await openRun(id, kael.userId)
        await expect(fixTools.editCombatAction(run.jobId, { ator: "Kael", cancelar: true, motivo: "errou a magia" })).rejects.toThrow("Este card já gastou espaço de magia, carga ou item no envio: não dá para cancelar.")
        run.close()
        expect((await lastAction(id)).combatAction!.status).toBe("pending")
        expect((await stateOf(id, kael.actorKey)).economy.action).toBe(false)
        expect(await fixLines(id)).toEqual([])
    })

    it("card sendo rolado não é corrigido", async () => {
        const { id, kael } = await scene()
        const sword = await swordOf(id, kael.userId)
        await actions.submitCombatAction(id, { economy: "action", optionId: sword.id, targets: ["npc:gob"] }, kael.userId)
        await MaddoxCampaignMessageModel.updateOne({ _id: (await lastAction(id))._id }, { $set: { "combatAction.rollingStep": 0, "combatAction.rollingAt": new Date() } })
        const run = await openRun(id, kael.userId)
        await expect(fixTools.editCombatAction(run.jobId, { ator: "Kael", modo: "vantagem", motivo: "x" })).rejects.toThrow("Este card está sendo rolado agora: não dá mais para corrigir.")
        run.close()
    })

    it("corrige PV, CA e 'fora de combate' do adversário; personagem jogador é recusado", async () => {
        const { id, kael } = await scene()
        const run = await openRun(id, kael.userId)
        expect(await fixTools.correctCombatant(run.jobId, { adversario: "Goblin", pv: 3, ca: 14, motivo: "o golpe anterior acertou" })).toMatchObject({ aplicado: true, pv: "3/7", ca: 14, foraDeCombate: false })
        expect((await enemyOf(id, "npc:gob")).tactical!.stats).toMatchObject({ hp: 3, ac: 14 })
        // PV dos inimigos oculto (padrão): a linha pública traz só a faixa, nunca o número nem a CA.
        const hiddenLine = (await fixLines(id)).at(-1)!
        expect(hiddenLine).toBe(`Goblin: PV: ${(await enemyOf(id, "npc:gob")).condition}, CA corrigida — o golpe anterior acertou`)
        expect(hiddenLine).not.toMatch(/3\/7|14/)
        expect(await fixTools.correctCombatant(run.jobId, { adversario: "Goblin", pv: 0, motivo: "caiu" })).toMatchObject({ foraDeCombate: true })
        expect((await enemyOf(id, "npc:gob")).condition).toBe("caído")
        expect(await fixTools.correctCombatant(run.jobId, { adversario: "Goblin", foraDeCombate: false, motivo: "levantou" })).toMatchObject({ pv: "1/7", foraDeCombate: false })
        await expect(fixTools.correctCombatant(run.jobId, { adversario: "Kael", pv: 1, motivo: "x" })).rejects.toThrow("update_character_hit_points")
        // Com a opção "mostrar PV dos inimigos", a linha traz o PV exato (a CA continua fora).
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { showEnemyHp: true } })
        await fixTools.correctCombatant(run.jobId, { adversario: "Rato", pv: 2, ca: 11, motivo: "mordido" })
        expect((await fixLines(id)).at(-1)).toBe("Rato: PV 2/5, CA corrigida — mordido")
        run.close()
    })

    it("corrige a economia e as marcas do personagem", async () => {
        const { id, kael } = await scene()
        const run = await openRun(id, kael.userId)
        await fixTools.correctCharacterTurn(run.jobId, { personagem: "Kael", acaoBonus: false, reacao: false, esquivando: true, ajudado: true, motivo: "já tinha usado" })
        run.close()
        const state = await stateOf(id, kael.actorKey)
        expect(state.economy).toMatchObject({ action: true, bonus: false, reaction: false })
        expect(state.flags).toMatchObject({ dodging: true, helped: { byName: "Maddox", targetKey: null } })
        expect(await fixLines(id)).toEqual(["Kael: Ação bônus gasta, Reação gasta, esquivando, ajudado (vantagem no próximo ataque) — já tinha usado"])
    })

    it("as ferramentas só entram na geração com combatFix; o texto livre do Diário avisa quando cita condição que o combate não tem", async () => {
        const { id, kael } = await scene()
        const context = { campaignId: new mongoose.Types.ObjectId(id), turnNumber: 2, jobId: "x" }
        expect(Object.keys(await masterTools.buildMaddoxAiTools(context, {}))).not.toContain("set_combat_condition")
        expect(Object.keys(await masterTools.buildMaddoxAiTools(context, { combatFix: true }))).toEqual(expect.arrayContaining(["get_combat_details", "set_combat_condition", "edit_combat_action", "correct_combatant", "correct_character_turn"]))
        const state = masterTools.findMaddoxTool("update_character_state")!
        const written = (await masterTools.runMaddoxTool(state, context, { characterName: "Kael", currentState: "Escondido atrás dos sacos: condição Invisível (Furtividade 15)." })) as { aviso?: string }
        expect(written.aviso).toContain("o combate tático NÃO tem Invisível em Kael")
        await MaddoxCombatModel.updateOne({ campaignId: id }, { $set: { "tactical.characters.$[me].conditions": [{ key: "invisible", untilRound: null, source: "Esconder", dc: 15 }] } }, { arrayFilters: [{ "me.actorKey": kael.actorKey }] })
        expect(((await masterTools.runMaddoxTool(state, context, { characterName: "Kael", currentState: "Escondida e invisível." })) as { aviso?: string }).aviso).toBeUndefined()
        const story = masterTools.findMaddoxTool("update_campaign_state")!
        expect(((await masterTools.runMaddoxTool(story, context, { situation: "Lyra está caída no chão." })) as { aviso?: string }).aviso).toContain("NÃO tem Caído")
    })

    it("com o mestre revisando um pedido, o Rolar do card espera (409) e a mesa mostra a espera", async () => {
        const { id, kael } = await scene()
        const sword = await swordOf(id, kael.userId)
        await actions.submitCombatAction(id, { economy: "action", optionId: sword.id, targets: ["npc:gob"] }, kael.userId)
        let release: () => void = () => undefined
        const gate = new Promise<void>((resolve) => (release = resolve))
        void live.enqueueMaddoxJob(id, "resposta de teste", async () => gate, { kind: "answer", turnNumber: 2, round: 0 })
        expect(live.hasPendingReview(id)).toBe(true)
        expect((await game.getGameState(id, kael.userId)).turn.masterReviewing).toBe(true)
        await expect(actions.rollCombatAction(id, String((await lastAction(id))._id), kael.userId)).rejects.toMatchObject({ code: "MASTER_REVIEWING", message: "O mestre está revisando um pedido; role quando a resposta chegar." })
        release()
        await live.waitForCampaignIdle(id)
        expect(live.hasPendingReview(id)).toBe(false)
        dice.players.set(kael.userId, [[15]])
        await actions.rollCombatAction(id, String((await lastAction(id))._id), kael.userId)
        expect((await lastAction(id)).combatAction!.steps[0]!.status).toBe("done")
    })
})

describe("DND-59 — Esconder-se antes do combate", () => {
    const check = (characterId: string, characterName: string, turnNumber: number, total: number, dc = 13) => ({ characterId, characterName, turnNumber, total, dc })

    it("regra pura: o teste do turno vale sozinho; o de turno anterior só com a confirmação do narrador; quem se revelou fica de fora", () => {
        const checks = [check("a", "Lizwan", 6, 15), check("b", "Ravel", 4, 18), check("c", "Nala", 6, 9)]
        expect(stealth.decideStealthStart(checks, { turnNumber: 6 })).toEqual({ hidden: [{ characterId: "a", characterName: "Lizwan", dc: 15, turnNumber: 6 }], refused: [], unconfirmed: [checks[1]] })
        const confirmed = stealth.decideStealthStart(checks, { turnNumber: 6, hidden: ["ravel", "Nala"], revealed: ["lizwan"] })
        expect(confirmed.hidden).toEqual([{ characterId: "b", characterName: "Ravel", dc: 18, turnNumber: 4 }])
        expect(confirmed.refused).toEqual(["Nala"])
        // O teste mais recente vale (uma falha depois não apaga o sucesso, mas um sucesso novo atualiza a CD).
        expect(stealth.decideStealthStart([check("a", "Lizwan", 5, 14), check("a", "Lizwan", 6, 19)], { turnNumber: 6 }).hidden[0]!.dc).toBe(19)
    })

    it("o combate tático criado depois do teste de Furtividade (turno do combate) começa com Lyra Invisível (Esconder-se, CD = total)", async () => {
        const { id, lyra } = await scene()
        await MaddoxCombatModel.deleteMany({ campaignId: id })
        const campaignId = new mongoose.Types.ObjectId(id)
        const roll = { rollId: "r", label: "Furtividade", terms: [{ dice: "d20" as const, quantity: 1, results: [7] }], mode: "normal" as const, diceTotal: 7, modifier: 8, total: 15, createdAt: new Date().toISOString() }
        await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 6, phase: "master", kind: "check", characterId: new mongoose.Types.ObjectId(lyra.characterId), characterName: "Lyra", content: "", check: { round: 0, status: "rolled", kind: "skill", ability: "dexterity", skill: "Furtividade", dc: 13, mode: "normal", reason: "esgueirar", sheetId: lyra.sheetId, roll } })
        const checks = await stealth.loadStealthChecks(campaignId, 6)
        expect(checks).toEqual([{ characterId: lyra.characterId, characterName: "Lyra", turnNumber: 6, total: 15, dc: 13 }])
        // Fora da janela (combate terminado depois do teste): não vale.
        await MaddoxCombatModel.create({ campaignId, status: "ended", mode: "tactical", title: "Antes", startedTurn: 6, endedTurn: 6, combatants: [] })
        expect(await stealth.loadStealthChecks(campaignId, 7)).toEqual([])
        await MaddoxCombatModel.deleteMany({ campaignId })
        const decision = stealth.decideStealthStart(checks, { turnNumber: 6 })
        const goblin = { name: "Rato", side: "inimigo" as const, quantity: 1, description: "", condition: "", registerNpc: false, stats: monsterStatsFromCustom({ ca: 12, pv: 7, acoes: [{ nome: "Mordida", tipo: "ataque", bonus: 4, dano: "1d4+2", tipoDano: "perfurante" }] }) }
        await tactical.createTacticalCombat({ _id: campaignId }, 6, 0, { title: "Porão", location: "", surprise: null, combatants: [goblin], hidden: decision.hidden }, async () => null)
        await (await import("@/features/maddox/server/combat-prep")).waitForCombatPreps()
        await live.waitForCampaignIdle(id)
        expect((await stateOf(id, lyra.actorKey)).conditions).toEqual([{ key: "invisible", untilRound: null, source: "Esconder", dc: 15 }])
    })
})
