import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { AiStreamRequest } from "@/lib/ai/stream"

/**
 * NPC Opex no combate tático (DND-27): na vez dele (bloco `npc` não retomado), o servidor consulta o agente antes da
 * narração e a tarefa leva a ação escolhida entre as opções da ficha; com falha (ou ação fora das opções), o Maddox decide
 * e a falha fica para a linha do dono. O chip aparece na iniciativa e nos cards só para NPC conhecido, e a morte no fim do
 * combate desfaz o Opex. O narrador é o real sobre um `streamText` que só registra a tarefa.
 */

const calls: { userText: string }[] = []
const npcReplies: (string | Error)[] = []
const npcCalls: AiStreamRequest[] = []

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/maddox/server/settings", async () => {
    const { DEFAULT_MADDOX_SETTINGS } = await import("@/features/maddox/schemas")
    const settings = { ...DEFAULT_MADDOX_SETTINGS, enabled: true, main: { ...DEFAULT_MADDOX_SETTINGS.main, provider: "gemini" as const, model: "gemini-test" } }
    return { loadMaddoxSettings: vi.fn(async () => ({ settings, isDefault: false, updatedAt: null })), maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })) }
})
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/features/ai/server/memory-block", () => ({ memoryBlock: vi.fn(async () => "") }))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: vi.fn(async () => undefined) }))
vi.mock("@/lib/ai/stream", () => ({
    prepareModel: vi.fn(async () => ({ model: {}, dispose: async () => undefined })),
    samplingOptions: () => ({}),
    describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    generateAiText: vi.fn(async (request: AiStreamRequest) => {
        npcCalls.push(request)
        const next = npcReplies.shift() ?? "{}"
        if (next instanceof Error) throw next
        return { text: next, usage: null, durationMs: 1 }
    }),
}))
vi.mock("ai", () => ({
    dynamicTool: (def: unknown) => def,
    stepCountIs: (count: number) => ({ count }),
    streamText: (options: { messages: { content: string }[] }) => {
        calls.push({ userText: options.messages[0]!.content })
        return {
            fullStream: (async function* () {
                yield { type: "start-step" }
                yield { type: "text-delta", text: "Klarg avança." }
                yield { type: "finish", finishReason: "stop", totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
            })(),
        }
    },
}))
vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)
vi.mock("@/features/engramind/server/opex-npcs", () => ({
    provisionOpexNpcAgent: vi.fn(async () => true),
    retireOpexNpcAgent: vi.fn(async () => undefined),
    seedOpexNpcInitialMemories: vi.fn(async () => ({ saved: 0, pending: 0 })),
    saveOpexNpcMemories: vi.fn(async () => ({ saved: 0, pending: 0 })),
    opexNpcMemoryBlock: vi.fn(async () => ""),
}))

const { campaignMemoriesStore } = await import("../../helpers/campaign-memories-mock")
const { MaddoxCampaignModel, MaddoxCombatModel, MaddoxNpcModel } = await import("@/features/maddox/models")
const { aiMaddoxMaster } = await import("@/features/maddox/server/narrator")
const { enqueueMaddoxJob, takeDraftOpexNpcFailures } = await import("@/features/maddox/server/game-live")
const { loadTacticalDto } = await import("@/features/maddox/server/tactical-dto")
const { combatEventDto, finishCombatTurn } = await import("@/features/maddox/server/combat")
const { knownOpexNpcIds, waitForOpexNpcWork } = await import("@/features/maddox/server/opex-npcs")
const { freshEconomy } = await import("@/features/maddox/combat-rules")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer

const opexMark = (active: boolean) => ({ active, promotedAt: new Date(), promotedBy: "system:maddox", retiredAt: null, retiredReason: null, engramind: null })
const stats = {
    source: "custom" as const,
    monsterId: null,
    ac: 15,
    hpMax: 30,
    hp: 30,
    tempHp: 0,
    initiativeBonus: 1,
    dexterity: 12,
    saves: { forca: 0, destreza: 0, constituicao: 0, inteligencia: 0, sabedoria: 0, carisma: 0 },
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    conditionImmunities: [],
    actions: [{ name: "Cimitarra", kind: "attack", bonus: 4, dc: null, ability: null, damage: "1d6+2", damageType: "cortante", halfOnSave: false, ranged: false, recharge: null, available: true, economy: "action", description: "" }],
    multiattack: 1,
}
const combatant = (name: string, actorKey: string, npcId: mongoose.Types.ObjectId | null) => ({
    name,
    nameKey: name.toLowerCase(),
    side: "inimigo" as const,
    quantity: 1,
    description: "",
    condition: "",
    npcId,
    outcome: null,
    tactical: { actorKey, groupKey: actorKey, stats, conditions: [], flags: {}, economy: freshEconomy(), concentration: null, defeated: false },
})

/** Campanha Fiel ao D&D com o combate tático no bloco do adversário `npc:klarg` (o NPC Klarg). */
async function setup(options: { opex?: boolean; visibility?: "players" | "master" } = {}) {
    const campaign = await MaddoxCampaignModel.create({ name: "Phandelver", ownerId: "dono", rigor: "fiel-dnd", status: "active", turn: { number: 3, phase: "master" } })
    const npc = await MaddoxNpcModel.create({ campaignId: campaign._id, name: "Klarg", nameKey: "klarg", publicDescription: "Bugbear líder.", visibility: options.visibility ?? "players", opex: options.opex === false ? null : opexMark(true) })
    const combat = await MaddoxCombatModel.create({
        campaignId: campaign._id,
        title: "Esconderijo Cragmaw",
        location: "Caverna",
        status: "active",
        startedTurn: 2,
        mode: "tactical",
        // Estado de luta montado à mão (o mínimo que o narrador e os DTOs leem).
        combatants: [combatant("Klarg", "npc:klarg", npc._id), combatant("Goblin", "npc:goblin", null)] as never,
        tactical: {
            mode: "tactical",
            phase: "running",
            round: 1,
            activeIndex: 1,
            order: [
                { actorKey: "pc:kael", kind: "character", name: "Kael", total: 15, d20: 12, modifier: 3, dexterity: 14, joinIndex: 0, groupKey: "pc:kael" },
                { actorKey: "npc:klarg", kind: "combatant", name: "Klarg", total: 12, d20: 11, modifier: 1, dexterity: 12, joinIndex: 1, groupKey: "npc:klarg" },
                { actorKey: "npc:goblin", kind: "combatant", name: "Goblin", total: 10, d20: 9, modifier: 1, dexterity: 12, joinIndex: 2, groupKey: "npc:goblin" },
            ],
            characters: [{ actorKey: "pc:kael", characterId: String(new mongoose.Types.ObjectId()), memberId: String(new mongoose.Types.ObjectId()), userId: "dono", name: "Kael", sheetId: null, conditions: [], flags: {}, economy: freshEconomy(), concentration: null, stable: false, dead: false, hpZero: false, left: false }],
            surprise: null,
            staleEndNarrations: 0,
            queue: ["npc:klarg", "npc:goblin"],
            nextKey: "pc:kael",
            queueTurn: 3,
            block: { kind: "npc", actorKey: "npc:klarg", waits: 0, startRound: 0 },
            acted: [],
        },
    })
    return { campaign, npc, combat }
}

/** Narra o bloco dentro de um job da fila (como o turno do mestre) e devolve as falhas registradas no job. */
async function narrateBlock(campaignId: mongoose.Types.ObjectId) {
    let failures: ReturnType<typeof takeDraftOpexNpcFailures> = []
    await enqueueMaddoxJob(
        String(campaignId),
        "teste",
        async ({ jobId }) => {
            await aiMaddoxMaster.narrate({ campaignId: String(campaignId), jobId, turnNumber: 3, round: 0, declarations: [], combatHint: null }, { delta: () => undefined, tool: () => undefined })
            failures = takeDraftOpexNpcFailures(String(campaignId), jobId)
        },
        { kind: "narration", turnNumber: 3, round: 0 },
    )
    return failures
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_opex_npc_combat_test" })
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all([MaddoxCampaignModel.deleteMany({}), MaddoxCombatModel.deleteMany({}), MaddoxNpcModel.deleteMany({})])
    campaignMemoriesStore.reset()
    calls.length = 0
    npcReplies.length = 0
    npcCalls.length = 0
})

describe("vez do NPC Opex no combate tático", () => {
    it("o agente escolhe a ação entre as opções da ficha e a tarefa manda executá-la", async () => {
        const { campaign } = await setup()
        npcReplies.push(JSON.stringify({ acao: "cimitarra", alvos: ["Kael"], fala: "Vocês não sairão vivos!", memorias: [] }))
        const failures = await narrateBlock(campaign._id)
        expect(failures).toEqual([])
        expect(npcCalls).toHaveLength(1)
        const prompt = String(npcCalls[0]!.prompt)
        expect(prompt).toContain('"Cimitarra"')
        expect(prompt).toContain('"Disparada"')
        expect(prompt).toContain('"Kael"')
        expect(npcCalls[0]!.consumption).toMatchObject({ origin: "maddox-opex-npc-combat" })
        expect(calls[0]!.userText).toContain('O NPC Opex Klarg decidiu: Cimitarra em Kael; fala: "Vocês não sairão vivos!". Execute exatamente essa ação com `monster_action` e narre a partir dela.')
    })

    it("com a ação fora das opções (ou o provedor fora), o Maddox decide e a falha fica para a linha do dono", async () => {
        const { campaign } = await setup()
        npcReplies.push(JSON.stringify({ acao: "Bola de Fogo", alvos: ["Kael"] }), JSON.stringify({ acao: "Bola de Fogo", alvos: ["Kael"] }))
        const failures = await narrateBlock(campaign._id)
        expect(npcCalls).toHaveLength(2)
        expect(failures).toEqual([{ npcId: expect.any(String), npcName: "Klarg", error: expect.stringContaining("resposta fora do formato") }])
        expect(calls[0]!.userText).not.toContain("O NPC Opex Klarg decidiu")
        expect(calls[0]!.userText).toContain("bloco de **Klarg**")

        calls.length = 0
        npcReplies.push(new Error("provedor fora"), new Error("provedor fora"))
        expect(await narrateBlock(campaign._id)).toEqual([expect.objectContaining({ npcName: "Klarg", error: expect.stringContaining("provedor fora") })])
        expect(calls).toHaveLength(1)
    })

    it("NPC que não é Opex não consulta agente nenhum", async () => {
        const { campaign } = await setup({ opex: false })
        await narrateBlock(campaign._id)
        expect(npcCalls).toHaveLength(0)
        expect(calls[0]!.userText).not.toContain("NPC Opex")
    })
})

describe("chip e morte no combate", () => {
    it("o chip aparece na iniciativa e nos cards só para o NPC Opex conhecido", async () => {
        const known = await setup()
        const slots = (await loadTacticalDto(known.combat.toObject() as never)).order
        expect(slots.find((slot) => slot.name === "Klarg")).toMatchObject({ opex: true })
        expect(slots.find((slot) => slot.name === "Goblin")).not.toHaveProperty("opex")
        const ids = await knownOpexNpcIds(known.combat.combatants.map((item) => item.npcId))
        expect(combatEventDto(known.combat.toObject(), "start", ids).combatants.find((item) => item.name === "Klarg")).toMatchObject({ opex: true })

        await MaddoxNpcModel.updateOne({ _id: known.npc._id }, { $set: { visibility: "master" } })
        expect((await loadTacticalDto(known.combat.toObject() as never)).order.find((slot) => slot.name === "Klarg")).not.toHaveProperty("opex")
    })

    it("NPC Opex morto no fim do combate deixa de ser Opex sozinho", async () => {
        const { campaign, npc, combat } = await setup()
        await MaddoxCombatModel.updateOne({ _id: combat._id }, { $set: { status: "ended", endedTurn: 3, outcome: "vitoria", summary: "Klarg caiu.", "combatants.0.outcome": "morto" } })
        await finishCombatTurn(campaign.toObject(), 3, 0)
        await waitForOpexNpcWork()
        expect((await MaddoxNpcModel.findById(npc._id).lean())).toMatchObject({ status: "dead", opex: { active: false, retiredReason: "death" } })
    })
})
