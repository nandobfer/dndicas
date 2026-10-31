import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * Critério de aceite do Maddox 5: numa campanha Fiel ao D&D, o Maddox (narrador REAL sobre um `streamText` roteirizado)
 * pede um teste de perícia para um jogador; só ele recebe o pedido; a rolagem usa o motor de dados (`rollGeneralDice`, com
 * uma regra de dado fixando o d20) e o modificador da ficha; o resultado volta ao Maddox, que narra a consequência.
 */

type ToolCall = { name: string; input: Record<string, unknown> }
type Step = { tools?: ToolCall[]; text?: string }

const calls: { instructions: string; userText: string; toolNames: string[] }[] = []
/** Roteiro por geração (na ordem em que o narrador é chamado). */
const script: Step[][] = []
const failNext = { value: false }

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
// O motor de dados conecta pelo `dbConnect` do core: no teste, a conexão já é a do MongoDB em memória.
vi.mock("@/core/database/db", () => ({ default: vi.fn(async () => undefined) }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
const jev = { enabled: false, answers: {} as Record<string, { type: "noul"; noul: number }>, fail: false, calls: 0 }
vi.mock("@/lib/ai/jev", () => ({
    askJevSystemOne: vi.fn(async () => {
        jev.calls += 1
        if (jev.fail) throw new Error("JEV fora do ar")
        return { answers: jev.answers }
    }),
}))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({
        settings: {
            enabled: true,
            main: { provider: "gemini", model: "gemini-test", agent: null, variant: null, temperature: null, maxOutputTokens: null },
            instructions: "Você é Maddox, o mestre.",
            avatar: { url: null },
            opencode: { sessionScope: "campaign", deleteOnCampaignEnd: true, directory: null, mcpUrl: null },
            get jev() {
                return { "requires-check": jev.enabled }
            },
        },
        isDefault: false,
        updatedAt: null,
    })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/features/ai/server/agent-memory-service", () => ({ agentMemoryTexts: vi.fn(async () => ["Narre sempre com calma."]) }))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: vi.fn(async () => undefined) }))
vi.mock("@/lib/ai/stream", () => ({
    prepareModel: vi.fn(async () => ({ model: {}, dispose: async () => undefined })),
    samplingOptions: () => ({}),
    describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock("ai", () => ({
    dynamicTool: (def: unknown) => def,
    stepCountIs: (count: number) => ({ count }),
    streamText: (options: { instructions: string; messages: { content: string }[]; tools: Record<string, { execute: (input: unknown, meta: unknown) => Promise<unknown> }> }) => {
        const steps = script.shift() ?? [{ text: "O mundo segue." }]
        calls.push({ instructions: options.instructions, userText: options.messages[0]!.content, toolNames: Object.keys(options.tools) })
        return {
            fullStream: (async function* () {
                if (failNext.value) {
                    failNext.value = false
                    yield { type: "error", error: new Error("provedor fora do ar") }
                    return
                }
                let index = 0
                for (const step of steps) {
                    yield { type: "start-step" }
                    for (const call of step.tools ?? []) {
                        const toolCallId = `call-${index++}`
                        yield { type: "tool-call", toolCallId, toolName: call.name, input: call.input }
                        try {
                            const output = await options.tools[call.name]!.execute(call.input, { toolCallId })
                            yield { type: "tool-result", toolCallId, toolName: call.name, output }
                        } catch (error) {
                            yield { type: "tool-error", toolCallId, toolName: call.name, error }
                        }
                    }
                    if (step.text) for (const piece of step.text.match(/[\s\S]{1,12}/g) ?? []) yield { type: "text-delta", text: piece }
                }
                yield { type: "finish", finishReason: "stop", totalUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }
            })(),
        }
    },
}))

const { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel } = await import("@/features/maddox/models")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { DiceRollOverride } = await import("@/features/dice-roller/models/dice-roll-override")
const { recordAudit } = await import("@/lib/db")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const checks = await import("@/features/maddox/server/game-checks")
const { subscribeGameLive, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")

let mongo: MongoMemoryServer

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function giveCharacter(campaignId: string, userId: string, name: string, sheet: Record<string, unknown> | null) {
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const created = sheet ? await CharacterSheet.create({ slug: `${name.toLowerCase()}-${userId}`, userId, username: name, name, level: 1, ...sheet }) : null
    const character = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name, profile: { capacidades: "Ágil." }, sheetId: created?._id ?? null, interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
    return { memberId: String(member!._id), sheetId: created ? String(created._id) : null }
}

/** Mesa Fiel ao D&D: Lyra (DES 16, Furtividade treinada = +5) da jogadora e Doran (FOR 14) do dono. */
async function faithfulTable(rigor: "fiel-dnd" | "narrativo" = "fiel-dnd", showCheckDc = false) {
    const owner = await seedUser("dono")
    const created = await campaigns.createCampaign({ name: "Cripta de Valdrenn", rigor, showCheckDc }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", setting: "## Universo\nReinos Esquecidos.", openingSituation: "A cripta está guardada." } })
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const player = await seedUser("jogadora")
    await campaigns.joinByInvite(token, player)
    const doran = await giveCharacter(created.id, owner, "Doran", { strength: 14, savingThrows: { strength: true, constitution: true } })
    const lyra = await giveCharacter(created.id, player, "Lyra", { dexterity: 16, skills: { Furtividade: { proficient: true, expertise: false } } })
    return { id: created.id, owner, player, doran, lyra }
}

const stealthCheck = { name: "request_check", input: { personagem: "Lyra", tipo: "pericia", pericia: "Furtividade", cd: 15, modo: "vantagem", motivo: "Esgueirar-se entre os guardas" } }

/** Abertura e um turno de declarações: o Maddox pede o teste da Lyra na narração do turno 2. */
async function untilCheckRequested(table: Awaited<ReturnType<typeof faithfulTable>>, extra: { tools?: { name: string; input: Record<string, unknown> }[] } = {}) {
    script.push([{ text: "Os guardas cochilam na entrada da cripta. O que vocês fazem?" }])
    await game.startCampaign(table.id, table.owner)
    await waitForCampaignIdle(table.id)
    script.push([{ tools: [stealthCheck, ...(extra.tools ?? [])], text: "Lyra prende a respiração e avança rente à parede, a poucos passos dos guardas…" }])
    await game.submitGameAction(table.id, { kind: "declaration", content: "Doran espera na esquina." }, table.owner)
    await game.submitGameAction(table.id, { kind: "declaration", content: "Lyra se esgueira até a porta da cripta." }, table.player)
    await waitForCampaignIdle(table.id)
}

const fixD20 = (userId: string, exact: number) => DiceRollOverride.create({ scope: "local", targetId: `user:${userId}`, dice: "d20", exact, remainingUses: 1 })

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_checks_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxNpcModel.init(), CharacterSheet.init(), DiceRollOverride.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all([
        mongoose.connection.collection("users").deleteMany({}),
        MaddoxCampaignModel.deleteMany({}),
        MaddoxCampaignMemberModel.deleteMany({}),
        MaddoxCharacterModel.deleteMany({}),
        MaddoxCampaignMessageModel.deleteMany({}),
        MaddoxNpcModel.deleteMany({}),
        CharacterSheet.deleteMany({}),
        DiceRollOverride.deleteMany({}),
    ])
    calls.length = 0
    script.length = 0
    failNext.value = false
    Object.assign(jev, { enabled: false, answers: {}, fail: false, calls: 0 })
    vi.mocked(recordAudit).mockClear()
})

describe("Maddox 5 — teste de perícia em campanha fiel (critério de aceite)", () => {
    it("pede o teste só para a jogadora indicada, rola com o motor e a ficha, e o Maddox narra a consequência", async () => {
        const table = await faithfulTable()
        await untilCheckRequested(table)

        // Os testes fazem parte do turno do mestre: o turno 2 espera a rolagem.
        const forPlayer = await game.getGameState(table.id, table.player)
        expect(forPlayer.turn).toMatchObject({ number: 2, phase: "master", awaitingChecks: true, generating: false })
        expect(forPlayer.turn.pendingChecks).toEqual([expect.objectContaining({ memberId: table.lyra.memberId, characterName: "Lyra" })])
        const request = forPlayer.messages.find((message) => message.kind === "check")!
        expect(request.check).toMatchObject({ status: "pending", kind: "skill", skill: "Furtividade", ability: "dexterity", mode: "advantage", reason: "Esgueirar-se entre os guardas", dc: null, sheetId: table.lyra.sheetId })
        // Ordem na conversa: a narração que pede o teste vem antes do card.
        expect(forPlayer.messages.at(-2)!.kind).toBe("narration")

        // O dono (outro jogador) não recebe o pedido: só a espera, sem detalhes.
        const forOwner = await game.getGameState(table.id, table.owner)
        expect(forOwner.messages.some((message) => message.kind === "check")).toBe(false)
        expect(forOwner.turn.pendingChecks).toEqual([{ checkId: request.id, memberId: table.lyra.memberId, characterName: "Lyra" }])
        // Ninguém declara durante o turno do mestre.
        await expect(game.submitGameAction(table.id, { kind: "declaration", content: "Doran ataca." }, table.owner)).rejects.toMatchObject({ code: "MASTER_TURN" })

        script.push([{ text: "Os guardas não percebem nada: Lyra alcança a porta da cripta. O que vocês fazem?" }])
        await fixD20(table.player, 12)
        const lines: { type: string }[] = []
        const unsubscribe = subscribeGameLive(table.id, (line) => lines.push(line))
        const { roll, state } = await checks.rollCheck(table.id, request.id, table.player)
        await waitForCampaignIdle(table.id)
        unsubscribe()

        // Motor de dados: d20 = 12 (regra de dado), modificador da ficha = DES +3 + proficiência +2.
        expect(roll).toMatchObject({ mode: "advantage", modifier: 5, total: 17, selectedD20: expect.objectContaining({ kept: 12 }) })
        expect(state.turn.awaitingChecks).toBe(false)
        expect(lines).toContainEqual(expect.objectContaining({ type: "check-rolled", messageId: request.id }))

        // O resultado volta ao Maddox na continuação (tarefa com o dado, o modificador, o total e a CD).
        const continuation = calls.at(-1)!
        expect(continuation.userText).toContain("resultado dos testes")
        expect(continuation.userText).toContain("Lyra — Furtividade (Destreza), CD 15: total 17 (d20 12, modificador +5; vantagem: 12 e")
        expect(continuation.userText).toContain("sucesso")
        expect(continuation.instructions).toContain("## Fichas e testes")
        expect(continuation.instructions).toContain("Furtividade +5")

        // A consequência é narrada no mesmo turno e o turno dos jogadores abre.
        const after = await game.getGameState(table.id, table.owner)
        expect(after.turn).toMatchObject({ number: 2, phase: "players", awaitingChecks: false })
        const narrations = after.messages.filter((message) => message.kind === "narration" && message.turnNumber === 2)
        expect(narrations.map((message) => message.content)).toEqual([expect.stringContaining("rente à parede"), expect.stringContaining("Os guardas não percebem nada")])
        // Rolado, o teste aparece para todos com o resultado e as partes do modificador.
        const rolled = after.messages.find((message) => message.kind === "check")!
        expect(rolled.check).toMatchObject({ status: "rolled", roll: expect.objectContaining({ total: 17 }), rolledByName: null, dc: null, success: null })
        expect(rolled.check!.modifierParts.map((part) => part.label)).toEqual(["Destreza", "Prof."])
        // Override consumido pelo motor.
        expect(await DiceRollOverride.countDocuments({})).toBe(0)
    })
})

describe("Maddox 5 — regras dos testes", () => {
    it("rolar duas vezes = 409; outro jogador = 403; não membro = 404", async () => {
        const table = await faithfulTable()
        await untilCheckRequested(table)
        const checkId = (await game.getGameState(table.id, table.player)).turn.pendingChecks[0]!.checkId
        const stranger = await seedUser("estranho")
        await expect(checks.rollCheck(table.id, checkId, stranger)).rejects.toMatchObject({ status: 404 })

        // Um terceiro jogador (não dono, não indicado) não rola.
        const token = (await campaigns.getInviteLink(table.id, table.owner)).token
        const third = await seedUser("terceiro")
        await campaigns.joinByInvite(token, third)
        await giveCharacter(table.id, third, "Mira", null)
        await expect(checks.rollCheck(table.id, checkId, third)).rejects.toMatchObject({ status: 403, code: "NOT_CHECK_TARGET" })

        script.push([{ text: "Tudo certo. O que vocês fazem?" }])
        await checks.rollCheck(table.id, checkId, table.player)
        await expect(checks.rollCheck(table.id, checkId, table.player)).rejects.toMatchObject({ status: 409, code: "CHECK_ALREADY_ROLLED" })
        await waitForCampaignIdle(table.id)
    })

    it("o dono rola no lugar do jogador ausente (auditado), com o modificador da ficha do personagem", async () => {
        const table = await faithfulTable()
        await untilCheckRequested(table)
        const checkId = (await game.getGameState(table.id, table.owner)).turn.pendingChecks[0]!.checkId
        script.push([{ text: "Lyra tropeça. O que vocês fazem?" }])
        // A regra de dado vale a do jogador do personagem.
        await fixD20(table.player, 3)
        const { roll } = await checks.rollCheck(table.id, checkId, table.owner)
        await waitForCampaignIdle(table.id)
        expect(roll).toMatchObject({ modifier: 5, total: 8 })
        expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(expect.objectContaining({ userId: table.owner, depois: expect.objectContaining({ check: checkId, rolledFor: table.player, total: 8 }) }))
        const state = await game.getGameState(table.id, table.player)
        expect(state.messages.find((message) => message.kind === "check")!.check).toMatchObject({ status: "rolled", rolledByName: "DONO" })
        expect(calls.at(-1)!.userText).toContain("rolado pelo dono no lugar do jogador")
    })

    it("com a CD visível, o teste mostra a CD e o sucesso ou a falha", async () => {
        const table = await faithfulTable("fiel-dnd", true)
        await untilCheckRequested(table)
        const pending = (await game.getGameState(table.id, table.player)).messages.find((message) => message.kind === "check")!
        expect(pending.check).toMatchObject({ dc: 15, success: null })
        script.push([{ text: "Um guarda se vira. O que vocês fazem?" }])
        await fixD20(table.player, 2)
        await checks.rollCheck(table.id, pending.id, table.player)
        await waitForCampaignIdle(table.id)
        const rolled = (await game.getGameState(table.id, table.owner)).messages.find((message) => message.kind === "check")!
        expect(rolled.check).toMatchObject({ dc: 15, success: false, roll: expect.objectContaining({ total: 7 }) })
    })

    it("dois testes na mesma rodada: a continuação só começa depois do último (uma única vez)", async () => {
        const table = await faithfulTable()
        await untilCheckRequested(table, { tools: [{ name: "request_check", input: { personagem: "Doran", tipo: "resistencia", atributo: "Força", cd: 12, motivo: "Segurar a porta" } }] })
        const pending = (await game.getGameState(table.id, table.owner)).turn.pendingChecks
        expect(pending.map((check) => check.characterName)).toEqual(["Lyra", "Doran"])
        const doranCheck = (await game.getGameState(table.id, table.owner)).messages.find((message) => message.kind === "check")!
        // Resistência de Força com proficiência: FOR +2 + prof. +2.
        expect(doranCheck.check).toMatchObject({ kind: "save", ability: "strength" })
        script.push([{ text: "A porta cede e Lyra passa. O que vocês fazem?" }])
        const generations = calls.length
        await checks.rollCheck(table.id, doranCheck.id, table.owner)
        await waitForCampaignIdle(table.id)
        expect(calls.length).toBe(generations)
        expect((await game.getGameState(table.id, table.owner)).turn).toMatchObject({ phase: "master", awaitingChecks: true, pendingChecks: [expect.objectContaining({ characterName: "Lyra" })] })
        // Jogadora e dono ao mesmo tempo: uma rolagem vence, a outra recebe 409.
        const results = await Promise.allSettled([checks.rollCheck(table.id, pending[0]!.checkId, table.player), checks.rollCheck(table.id, pending[0]!.checkId, table.owner)])
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
        expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: expect.objectContaining({ code: "CHECK_ALREADY_ROLLED" }) })
        await waitForCampaignIdle(table.id)
        expect(calls.length).toBe(generations + 1)
        expect(calls.at(-1)!.userText).toContain("Doran — Resistência de Força, CD 12: total")
        expect(calls.at(-1)!.userText).toContain("modificador +4")
        expect((await game.getGameState(table.id, table.owner)).turn).toMatchObject({ phase: "players" })
    })

    it("o jogador que sai da campanha tem o teste cancelado e o Maddox continua sem ele", async () => {
        const table = await faithfulTable()
        await untilCheckRequested(table)
        script.push([{ text: "Lyra some na névoa. O que vocês fazem?" }])
        await campaigns.removeMember(table.id, table.lyra.memberId, table.player)
        await waitForCampaignIdle(table.id)
        const state = await game.getGameState(table.id, table.owner)
        expect(state.turn).toMatchObject({ phase: "players", awaitingChecks: false })
        expect(state.messages.find((message) => message.kind === "check")!.check).toMatchObject({ status: "cancelled", cancelReason: "O jogador saiu da campanha" })
        expect(calls.at(-1)!.userText).toContain("Lyra — Furtividade (Destreza), CD 15: cancelado")
    })

    it("falha da geração descarta os testes pedidos; a nova tentativa não duplica nada", async () => {
        const table = await faithfulTable()
        script.push([{ text: "Abertura. O que vocês fazem?" }])
        await game.startCampaign(table.id, table.owner)
        await waitForCampaignIdle(table.id)
        // A geração pede o teste e depois falha (provedor caiu).
        script.push([{ tools: [stealthCheck] }, { text: "" }])
        failNext.value = false
        await game.submitGameAction(table.id, { kind: "declaration", content: "Doran espera." }, table.owner)
        // Faz a geração falhar no fim: texto vazio = "O Maddox não respondeu."
        await game.submitGameAction(table.id, { kind: "declaration", content: "Lyra avança." }, table.player)
        await waitForCampaignIdle(table.id)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: table.id, kind: "check" })).toBe(0)
        // Nova tentativa (passado o intervalo): pede de novo e grava um único teste.
        await MaddoxCampaignModel.updateOne({ _id: table.id }, { $set: { "turn.failedAt": new Date(Date.now() - 60_000) } })
        script.push([{ tools: [stealthCheck], text: "Lyra avança…" }])
        await game.getGameState(table.id, table.owner)
        await waitForCampaignIdle(table.id)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: table.id, kind: "check" })).toBe(1)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: table.id, kind: "narration", turnNumber: 2 })).toBe(1)
        expect((await game.getGameState(table.id, table.owner)).turn.awaitingChecks).toBe(true)
    })

    it("teto de rodadas: na última continuação o request_check é recusado e o turno dos jogadores abre", async () => {
        const table = await faithfulTable()
        await untilCheckRequested(table)
        for (let round = 1; round < 3; round++) {
            const checkId = (await game.getGameState(table.id, table.player)).turn.pendingChecks[0]!.checkId
            script.push([{ tools: [stealthCheck], text: `Continuação ${round}…` }])
            await checks.rollCheck(table.id, checkId, table.player)
            await waitForCampaignIdle(table.id)
        }
        const state = await game.getGameState(table.id, table.owner)
        // Rodadas 0 e 1 pediram testes; a 2 (última) não pode pedir: o turno dos jogadores abre.
        expect(state.turn).toMatchObject({ phase: "players", awaitingChecks: false })
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: table.id, kind: "check" })).toBe(2)
        expect(calls.at(-1)!.userText).toContain("último pedido de testes deste turno")
    })

    it("campanha narrativa não oferece request_check ao modelo nem fala de testes", async () => {
        const table = await faithfulTable("narrativo")
        script.push([{ text: "Abertura. O que vocês fazem?" }])
        await game.startCampaign(table.id, table.owner)
        await waitForCampaignIdle(table.id)
        expect(calls[0]!.toolNames).not.toContain("request_check")
        expect(calls[0]!.instructions).toContain("## Modo narrativo")
        expect(calls[0]!.instructions).not.toContain("## Fichas e testes")
    })

    it("JEV 'Pedir teste' ligado: a declaração marcada leva a orientação na tarefa; JEV fora do ar não trava a narração", async () => {
        const table = await faithfulTable()
        script.push([{ text: "Abertura. O que vocês fazem?" }])
        await game.startCampaign(table.id, table.owner)
        await waitForCampaignIdle(table.id)
        jev.enabled = true
        jev.answers = { d0: { type: "noul", noul: 0.2 }, d1: { type: "noul", noul: 0.9 } }
        script.push([{ text: "Narração. O que vocês fazem?" }])
        await game.submitGameAction(table.id, { kind: "declaration", content: "Doran espera." }, table.owner)
        await game.submitGameAction(table.id, { kind: "declaration", content: "Lyra escala o muro." }, table.player)
        await waitForCampaignIdle(table.id)
        const task = calls.at(-1)!.userText
        expect(jev.calls).toBe(1)
        expect(task).toMatch(/Lyra\*\*: Lyra escala o muro\. _\(o JEV indica que esta ação provavelmente exige teste/)
        expect(task).not.toMatch(/Doran espera\. _\(o JEV/)

        jev.fail = true
        script.push([{ text: "Outra narração. O que vocês fazem?" }])
        await game.submitGameAction(table.id, { kind: "declaration", content: "Doran espera de novo." }, table.owner)
        await game.submitGameAction(table.id, { kind: "declaration", content: "Lyra salta." }, table.player)
        await waitForCampaignIdle(table.id)
        expect(calls.at(-1)!.userText).toContain("Lyra salta.")
        expect(calls.at(-1)!.userText).not.toContain("o JEV indica")
        expect((await game.getGameState(table.id, table.owner)).turn.phase).toBe("players")
    })
})
