import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { AiStreamRequest } from "@/lib/ai/stream"
import type { MaddoxGameStateDto } from "@/features/maddox/game-types"

/**
 * Personagens Opex no combate e nos testes (DND-26): o motor (`driveOpex`) rola sozinho os testes e as rolagens do Opex
 * pelas funções de sempre (o card animado vai a todos por elas), decide as reações (falha = não reage), e na vez do Opex
 * no combate tático escolhe entre as opções da ficha, resolve as rolagens e encerra a vez. Falha do agente na vez trava
 * a mesa até o dono decidir. As funções de jogo são simuladas aqui (testadas nos testes do combate tático).
 */

const opexReplies: (string | Error)[] = []
const opexCalls: AiStreamRequest[] = []
const rollCheck = vi.fn(async () => ({ roll: {}, state: {} }))
const rollCombatRoll = vi.fn(async () => ({ roll: {}, state: {} }))
const rollCombatAction = vi.fn(async (campaignId: string, actionId: string) => {
    const { MaddoxCampaignMessageModel } = await import("@/features/maddox/models")
    await MaddoxCampaignMessageModel.updateOne({ _id: actionId }, { $set: { "combatAction.status": "resolved" } })
    return { roll: {}, state: {} }
})
const submitCombatAction = vi.fn()
const endCombatTurn = vi.fn(async (_campaignId: string, _input: unknown, _userId: string): Promise<object> => ({}))
const skipCombatTurn = vi.fn(async () => undefined)
const decideReaction = vi.fn(async () => ({}))
const gameState: { value: MaddoxGameStateDto | null; byUser: Map<string, MaddoxGameStateDto> } = { value: null, byUser: new Map() }
const publishGameChanged = vi.fn(async () => undefined)

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit: vi.fn(async () => undefined), AcaoAuditoria: { ATUALIZAR: "ATUALIZAR" } }))
vi.mock("@/features/maddox/server/settings", async () => {
    const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
    const settings = { ...DEFAULT_MADDOX_SETTINGS, enabled: true, main: { ...DEFAULT_MADDOX_SETTINGS.main, provider: "gemini" as const, model: "gemini-pro" } }
    return { loadMaddoxSettings: vi.fn(async () => ({ settings, isDefault: false, updatedAt: null })) }
})
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/lib/ai/stream", () => ({
    generateAiText: vi.fn(async (request: AiStreamRequest) => {
        opexCalls.push(request)
        const next = opexReplies.shift() ?? JSON.stringify({ escolha: "none" })
        if (next instanceof Error) throw next
        return { text: next, usage: null, durationMs: 1 }
    }),
}))
vi.mock("@/features/engramind/server/opex-characters", () => ({ opexCharacterMemoryBlock: vi.fn(async () => "") }))
vi.mock("@/features/maddox/server/narrator", () => ({ loadSheetSummaries: vi.fn(async () => new Map()), checkResultOf: () => null }))
vi.mock("@/features/maddox/server/game-checks", () => ({ rollCheck }))
vi.mock("@/features/maddox/server/tactical-actions", () => ({ rollCombatRoll, rollCombatAction, submitCombatAction, endCombatTurn, skipCombatTurn }))
vi.mock("@/features/maddox/server/combat-reactions", () => ({ decideReaction }))
vi.mock("@/features/maddox/server/game", () => ({ getGameState: vi.fn(async (_campaignId: string, userId: string) => gameState.byUser.get(userId) ?? gameState.value), publishGameChanged }))

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel } = await import("@/features/maddox/models")
const { driveOpex, retryOpexAction } = await import("@/features/maddox/server/opex-table")
const { waitForOpexIdle } = await import("@/features/maddox/server/opex-runtime")
const { opexUserIdFor } = await import("@/features/maddox/server/opex-members")

let mongo: MongoMemoryServer
const owner = "dono-1"

async function setup(phase: "players" | "master") {
    const campaign = await MaddoxCampaignModel.create({ name: "Brumas", ownerId: owner, rigor: "fiel-dnd", status: "active", turn: { number: 3, phase, eligibleMemberIds: [], declaredMemberIds: [] } })
    const _id = new mongoose.Types.ObjectId()
    const character = await MaddoxCharacterModel.create({ campaignId: campaign._id, memberId: _id, userId: opexUserIdFor(_id), name: "Tork", interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.create({ _id, campaignId: campaign._id, userId: opexUserIdFor(_id), kind: "opex", role: "player", status: "joined", characterId: character._id, opex: { ownerUserId: owner, prompt: "", interviewMode: "autonomous", addedAt: new Date(), run: null, engramind: null } })
    return { campaignId: campaign._id, memberId: _id, userId: opexUserIdFor(_id) }
}

function combatState(memberId: string, myTurn: boolean): MaddoxGameStateDto {
    return {
        combat: { title: "Emboscada", location: "Estrada", tactical: { phase: "running", round: 2, activeKey: "c:1", order: [{ actorKey: "c:1", kind: "character", side: "personagem", name: "Tork", portraitUrl: null, memberId, initiative: 15, active: true, hp: { current: 9, max: 12, temp: 0 }, band: null, conditions: [], concentration: null, defeated: false, dead: false, stable: false, dying: false }, { actorKey: "m:goblin-1", kind: "combatant", side: "inimigo", name: "Goblin", portraitUrl: null, memberId: null, initiative: 10, active: false, hp: null, band: "ferido" as never, conditions: [], concentration: null, defeated: false, dead: false, stable: false, dying: false }] } },
        me: { memberId, isOwner: false, ready: true, eligible: true, declared: false, sheet: null, combat: { myTurn, actorKey: "c:1", economy: { action: true, bonus: true, reaction: true } as never, attacksPerAction: 1, dying: false, options: { action: [{ id: "weapon:machado", category: "weapon", economy: "action", label: "Machado de batalha", detail: "+5, 1d8+3", target: "enemy", multiTarget: false, resolution: "attack" } as never], bonus: [] } } },
    } as unknown as MaddoxGameStateDto
}

async function settle() {
    for (let round = 0; round < 4; round++) {
        await waitForOpexIdle()
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_opex_combat_test" })
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await mongoose.connection.db!.dropDatabase()
    opexReplies.length = 0
    opexCalls.length = 0
    for (const fn of [rollCheck, rollCombatRoll, rollCombatAction, submitCombatAction, endCombatTurn, decideReaction, publishGameChanged]) fn.mockClear()
    submitCombatAction.mockReset()
    gameState.value = null
    gameState.byUser.clear()
    endCombatTurn.mockReset()
    endCombatTurn.mockImplementation(async () => ({}))
})

describe("Personagens Opex — testes e combate (DND-26)", () => {
    it("rola sozinho os testes, a iniciativa e o teste contra a morte do Opex pelas funções de sempre", async () => {
        const { campaignId, memberId, userId } = await setup("master")
        const check = await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 3, phase: "master", kind: "check", memberId, userId, content: "", check: { round: 0, kind: "skill", ability: "wisdom", skill: "Percepção", mode: "normal", reason: "Percepção", dc: 12, status: "pending", sheetId: null } })
        const initiative = await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 3, phase: "master", kind: "combat-roll", memberId, userId, content: "", combatRoll: { kind: "initiative", status: "pending", reason: "Iniciativa", dice: "1d20+2", mode: "normal", dc: null } })
        const death = await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 3, phase: "master", kind: "combat-roll", memberId, userId, content: "", combatRoll: { kind: "death-save", status: "pending", reason: "Teste contra a morte", dice: "1d20", mode: "normal", dc: 10 } })
        await driveOpex(campaignId)
        await settle()
        expect(rollCheck).toHaveBeenCalledWith(String(campaignId), String(check._id), userId)
        expect(rollCombatRoll).toHaveBeenCalledWith(String(campaignId), String(initiative._id), userId)
        expect(rollCombatRoll).toHaveBeenCalledWith(String(campaignId), String(death._id), userId)
        // Rolagem do dado dos inimigos não é do Opex.
        expect(opexCalls).toHaveLength(0)
    })

    it("decide a reação entre as opções; falha do agente = não reage (sem travar a mesa)", async () => {
        const { campaignId, memberId, userId } = await setup("master")
        const reaction = await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 3, phase: "master", kind: "combat-reaction", memberId, userId, content: "", combatReaction: { combatId: "c", waitRound: 0, trigger: "hit", description: "O goblin acerta Tork", status: "pending", options: [{ id: "spell:escudo", label: "Escudo" }], choice: null, deadline: new Date(Date.now() + 45_000), pendingAttack: null, sourceKey: null, outcome: null, decidedBy: null } })
        opexReplies.push(JSON.stringify({ escolha: "spell:escudo" }))
        await driveOpex(campaignId)
        await settle()
        expect(decideReaction).toHaveBeenCalledWith(String(campaignId), String(reaction._id), "spell:escudo", userId)
        expect(opexCalls[0]!.prompt).toContain("O goblin acerta Tork")

        decideReaction.mockClear()
        await MaddoxCampaignMessageModel.updateOne({ _id: reaction._id }, { $set: { "combatReaction.status": "pending" } })
        opexReplies.push(new Error("fora"), new Error("fora"))
        await driveOpex(campaignId)
        await settle()
        expect(decideReaction).toHaveBeenCalledWith(String(campaignId), String(reaction._id), "none", userId)
    })

    it("na vez dele, escolhe uma opção da ficha com o alvo, resolve as rolagens e encerra a vez", async () => {
        const { campaignId, memberId, userId } = await setup("players")
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { "turn.combatActor": { memberId, actorKey: "c:1", startedAt: new Date() } } })
        gameState.value = combatState(String(memberId), true)
        submitCombatAction.mockImplementation(async () => {
            await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 3, phase: "players", kind: "combat-action", memberId, userId, content: "", combatAction: { status: "pending", summary: "" } })
            return {}
        })
        opexReplies.push(JSON.stringify({ acoes: [{ economia: "action", opcao: "weapon:machado", alvos: ["m:goblin-1"] }], movimento: "Avanço até o goblin." }))
        await driveOpex(campaignId)
        await settle()
        expect(opexCalls[0]!.prompt).toContain('id="weapon:machado"')
        expect(opexCalls[0]!.prompt).toContain('"m:goblin-1": Goblin (inimigo)')
        expect(submitCombatAction).toHaveBeenCalledWith(String(campaignId), { economy: "action", optionId: "weapon:machado", targets: ["m:goblin-1"] }, userId)
        expect(rollCombatAction).toHaveBeenCalledTimes(1)
        expect(endCombatTurn).toHaveBeenCalledWith(String(campaignId), { movimento: "Avanço até o goblin." }, userId)
    })

    it("opção recusada volta ao Opex uma vez com o motivo", async () => {
        const { campaignId, memberId, userId } = await setup("players")
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { "turn.combatActor": { memberId, actorKey: "c:1", startedAt: new Date() } } })
        gameState.value = combatState(String(memberId), true)
        submitCombatAction.mockRejectedValueOnce(Object.assign(new Error("Essa opção não está disponível agora."), { code: "OPTION_UNAVAILABLE" })).mockResolvedValue({})
        opexReplies.push(JSON.stringify({ acoes: [{ economia: "action", opcao: "spell:bola-de-fogo" }] }), JSON.stringify({ acoes: [{ economia: "action", opcao: "weapon:machado", alvos: ["m:goblin-1"] }] }))
        await driveOpex(campaignId)
        await settle()
        expect(opexCalls[1]!.prompt).toContain("Essa opção não está disponível agora.")
        expect(submitCombatAction).toHaveBeenCalledTimes(2)
        expect(endCombatTurn).toHaveBeenCalledWith(String(campaignId), {}, userId)
    })

    it("falha do agente na vez trava a mesa (sem encerrar a vez) até o dono tentar de novo", async () => {
        const { campaignId, memberId } = await setup("players")
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { "turn.combatActor": { memberId, actorKey: "c:1", startedAt: new Date() } } })
        gameState.value = combatState(String(memberId), true)
        opexReplies.push(new Error("provedor fora"), new Error("provedor fora"))
        await driveOpex(campaignId)
        await settle()
        expect(endCombatTurn).not.toHaveBeenCalled()
        const failed = await MaddoxCampaignMemberModel.findById(memberId).lean()
        expect(failed!.opex!.run).toMatchObject({ status: "failed", stage: "table" })
        // Sem nova tentativa sozinho.
        await driveOpex(campaignId)
        await settle()
        expect(opexCalls).toHaveLength(2)

        opexReplies.push(JSON.stringify({ acoes: [], movimento: "" }))
        const campaign = await MaddoxCampaignModel.findById(campaignId).lean()
        await retryOpexAction(campaign as never, memberId)
        await driveOpex(campaignId)
        await settle()
        expect(endCombatTurn).toHaveBeenCalledTimes(1)
        expect((await MaddoxCampaignMemberModel.findById(memberId).lean())!.opex!.run).toMatchObject({ status: "idle" })
    })

    it("dois Opex seguidos na iniciativa: o segundo age logo depois do primeiro, sem nenhuma leitura da mesa", async () => {
        const { campaignId, memberId, userId } = await setup("players")
        const secondId = new mongoose.Types.ObjectId()
        const secondUser = opexUserIdFor(secondId)
        const character = await MaddoxCharacterModel.create({ campaignId, memberId: secondId, userId: secondUser, name: "Brunna", interview: { status: "done", scriptVersion: 0 } })
        await MaddoxCampaignMemberModel.create({ _id: secondId, campaignId, userId: secondUser, kind: "opex", role: "player", status: "joined", characterId: character._id, opex: { ownerUserId: owner, prompt: "", interviewMode: "autonomous", addedAt: new Date(), run: null, engramind: null } })
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { "turn.combatActor": { memberId, actorKey: "c:1", startedAt: new Date() } } })
        gameState.byUser.set(userId, combatState(String(memberId), true))
        gameState.byUser.set(secondUser, combatState(String(secondId), true))
        // "Encerrar turno" do primeiro passa a vez ao segundo e publica a mudança (o motor roda de novo) ainda dentro da vez do primeiro.
        endCombatTurn.mockImplementation(async (id: string, _input: unknown, actingUser: string) => {
            if (actingUser === userId) {
                await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.combatActor": { memberId: secondId, actorKey: "c:2", startedAt: new Date() } } })
                gameState.byUser.set(userId, combatState(String(memberId), false))
                // Espera o motor chegar à vez do segundo enquanto a do primeiro ainda roda (vira nova passada).
                await driveOpex(id)
            } else {
                await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.combatActor": null } })
                gameState.byUser.set(secondUser, combatState(String(secondId), false))
            }
            return {}
        })
        opexReplies.push(JSON.stringify({ acoes: [], movimento: "Fico." }), JSON.stringify({ acoes: [], movimento: "Avanço." }))
        await driveOpex(campaignId)
        await settle()
        expect(endCombatTurn.mock.calls.map((call) => call[2])).toEqual([userId, secondUser])
        expect(endCombatTurn).toHaveBeenLastCalledWith(String(campaignId), { movimento: "Avanço." }, secondUser)
    })
})
