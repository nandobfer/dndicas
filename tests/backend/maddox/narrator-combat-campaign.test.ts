import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/**
 * Critério de aceite do Maddox 6 (combate narrativo): campanha com o narrador REAL (`narrator.ts`, ferramentas e prompt)
 * sobre um `streamText` roteirizado — o modelo abre, atualiza e encerra o combate pelas ferramentas e o teste confere o
 * estado persistido (combate, NPCs, memória, personagens, recompensas na ficha) e o que volta ao prompt.
 */

type ToolCall = { name: string; input: Record<string, unknown> }
type Step = { tools?: ToolCall[]; text?: string; fail?: boolean }

const calls: { instructions: string; userText: string; toolNames: string[] }[] = []
const script: Step[][] = []
const toolLog: { name: string; output?: unknown; error?: string }[] = []
const jev = { combatBoundary: false, noul: 0.9 }
const askJevSystemOne = vi.fn(async (input: unknown) => {
    void input
    return { answers: { combate: { type: "noul", noul: jev.noul } } }
})
const publishSheetPatched = vi.fn(async (input: unknown) => void input)
const publishCollectionChanged = vi.fn(async (input: unknown) => void input)

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
const sheetService = { broken: false }
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({
    // Getter: simula falha de inicialização do serviço ao carregar o módulo (depois do claim da recompensa).
    get CharacterSheetPusherService() {
        if (sheetService.broken) throw new Error("serviço da ficha não inicializou")
        return { getInstance: () => ({ publishSheetPatched, publishCollectionChanged }) }
    },
}))
vi.mock("@/lib/ai/jev", () => ({ askJevSystemOne }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({
        settings: {
            enabled: true,
            main: { provider: "gemini", model: "gemini-test", agent: null, variant: null, temperature: null, maxOutputTokens: null },
            instructions: "Você é Maddox, o mestre.",
            avatar: { url: null },
            opencode: { sessionScope: "campaign", deleteOnCampaignEnd: true, directory: null, mcpUrl: null },
            jev: { "combat-boundary": jev.combatBoundary },
        },
        isDefault: false,
        updatedAt: null,
    })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/features/ai/server/agent-memory-service", () => ({ agentMemoryTexts: vi.fn(async () => []) }))
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
                let index = 0
                for (const step of steps) {
                    yield { type: "start-step" }
                    for (const call of step.tools ?? []) {
                        const toolCallId = `call-${index++}`
                        yield { type: "tool-call", toolCallId, toolName: call.name, input: call.input }
                        try {
                            const output = await options.tools[call.name]!.execute(call.input, { toolCallId })
                            toolLog.push({ name: call.name, output })
                            yield { type: "tool-result", toolCallId, toolName: call.name, output }
                        } catch (error) {
                            toolLog.push({ name: call.name, error: error instanceof Error ? error.message : String(error) })
                            yield { type: "tool-error", toolCallId, toolName: call.name, error }
                        }
                    }
                    if (step.text) for (const piece of step.text.match(/[\s\S]{1,12}/g) ?? []) yield { type: "text-delta", text: piece }
                    if (step.fail) {
                        yield { type: "error", error: new Error("provedor caiu no meio") }
                        return
                    }
                }
                yield { type: "finish", finishReason: "stop", totalUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }
            })(),
        }
    },
}))

const { MaddoxCampaignMemberModel, MaddoxCampaignMemoryModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCombatModel, MaddoxNpcModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const { applyCombatRewards } = await import("@/features/maddox/server/combat")
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const { ItemModel } = await import("@/features/items/database/item")

let mongo: MongoMemoryServer

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function giveCharacter(campaignId: string, userId: string, name: string, sheet: boolean) {
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const sheetId = sheet ? new mongoose.Types.ObjectId() : null
    if (sheetId) await CharacterSheet.collection.insertOne({ _id: sheetId, slug: `${name.toLowerCase()}-${String(sheetId)}`, userId, name, coins: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 } })
    const character = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name, profile: { capacidades: `${name} luta bem.` }, interview: { status: "done", scriptVersion: 0 }, sheetId })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
    return { characterId: character._id, sheetId }
}

async function table(rigor: "narrativo" | "equilibrado" | "rigoroso") {
    const owner = await seedUser("dono")
    const created = await campaigns.createCampaign({ name: "Brumas do Norte", rigor }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", setting: "## Universo\nUm porto envolto em névoa.", openingSituation: "O farol do porto se apagou." } })
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const player = await seedUser("jogadora")
    await campaigns.joinByInvite(token, player)
    const sheets = rigor !== "narrativo"
    const lyra = await giveCharacter(created.id, owner, "Lyra", sheets)
    const doran = await giveCharacter(created.id, player, "Doran", sheets)
    return { id: created.id, owner, player, lyra, doran }
}

async function playersTurn(id: string, owner: string, player: string, turn: number) {
    await game.submitGameAction(id, { kind: "declaration", content: `Lyra ataca no turno ${turn}.` }, owner)
    await game.submitGameAction(id, { kind: "declaration", content: `Doran avança no turno ${turn}.` }, player)
    await waitForCampaignIdle(id)
}

const kindsInOrder = async (id: string, turnNumber: number) =>
    (await MaddoxCampaignMessageModel.find({ campaignId: id, turnNumber, phase: "master" }).sort({ _id: 1 }).lean()).map((doc) => (doc.kind === "combat" ? `combat:${doc.combat!.event}` : doc.kind))

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_combat_campaign_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxNpcModel.init(), MaddoxCampaignMemoryModel.init(), MaddoxCombatModel.init()])
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
        MaddoxCampaignMemoryModel.deleteMany({}),
        MaddoxCombatModel.deleteMany({}),
        CharacterSheet.collection.deleteMany({}),
        CharacterItem.deleteMany({}),
        ItemModel.collection.deleteMany({}),
    ])
    calls.length = 0
    script.length = 0
    toolLog.length = 0
    jev.combatBoundary = false
    jev.noul = 0.9
    askJevSystemOne.mockClear()
    publishSheetPatched.mockClear()
    publishCollectionChanged.mockClear()
    sheetService.broken = false
})

describe("Maddox 6 — combate narrativo de ponta a ponta", () => {
    it("campanha narrativa: inicia, narra e encerra o combate, com o estado persistido e de volta ao prompt", async () => {
        const { id, owner, player, doran } = await table("narrativo")
        script.push(
            // Turno 1: abertura, fora de combate.
            [{ text: "A névoa cobre o cais. O que vocês fazem?" }],
            // Turno 2: emboscada.
            [
                {
                    tools: [
                        {
                            name: "start_combat",
                            input: {
                                titulo: "Emboscada no cais",
                                local: "Cais de Brumas",
                                adversarios: [
                                    { nome: "Varn, o Cinzento", descricao: "Líder dos contrabandistas", condicao: "ileso", registrarNpc: true },
                                    { nome: "Contrabandista", quantidade: 3, condicao: "armados com facas" },
                                ],
                            },
                        },
                    ],
                    text: "Facas brilham na névoa: **Varn** e seus homens saltam das caixas! O que vocês fazem?",
                },
            ],
            // Turno 3: a luta muda de rumo.
            [{ tools: [{ name: "update_combat", input: { adversarios: [{ nome: "varn, o cinzento", condicao: "ferido no ombro" }, { nome: "Capanga gigante", condicao: "entra na luta" }] } }], text: "Varn recua, sangrando. Um gigante surge. O que vocês fazem?" }],
            // Turno 4: fim do combate.
            [
                {
                    tools: [
                        {
                            name: "end_combat",
                            input: {
                                resultado: "vitoria",
                                resumo: "Varn caiu no cais e os contrabandistas fugiram para a névoa.",
                                notasMestre: "O gigante foi contratado pela guilda.",
                                adversarios: [
                                    { nome: "Varn, o Cinzento", desfecho: "morto" },
                                    { nome: "Contrabandista", desfecho: "fugiu" },
                                    { nome: "Capanga gigante", desfecho: "rendeu-se" },
                                ],
                                recompensas: [
                                    { tipo: "moedas", personagem: "Lyra", moedas: { po: 30 } },
                                    { tipo: "outro", descricao: "Um mapa do farol" },
                                ],
                                estadoPersonagens: [{ personagem: "doran", condicao: "Corte fundo no braço." }],
                                cenaFinal: "O cais vazio sob a névoa, o corpo de Varn sobre as tábuas e o farol apagado ao fundo.",
                            },
                        },
                    ],
                    text: "O silêncio volta ao cais. O que vocês fazem?",
                },
            ],
            [{ text: "Amanhece. O que vocês fazem?" }],
        )

        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        await playersTurn(id, owner, player, 1)

        // Início: combate ativo, NPC registrado só para o nome próprio, card ANTES da narração.
        const active = await MaddoxCombatModel.findOne({ campaignId: id, status: "active" }).lean()
        expect(active).toMatchObject({ title: "Emboscada no cais", location: "Cais de Brumas", startedTurn: 2, masterTurns: 1 })
        expect(active!.combatants.map((item) => [item.name, item.quantity, Boolean(item.npcId)])).toEqual([
            ["Varn, o Cinzento", 1, true],
            ["Contrabandista", 3, false],
        ])
        expect(await MaddoxNpcModel.countDocuments({ campaignId: id })).toBe(1)
        expect(await kindsInOrder(id, 2)).toEqual(["combat:start", "narration"])
        const during = await game.getGameState(id, player)
        expect(during.combat).toMatchObject({ title: "Emboscada no cais", startedTurn: 2, masterTurns: 1 })
        const startCard = during.messages.find((message) => message.kind === "combat")!
        expect(startCard.combat).toMatchObject({ event: "start", title: "Emboscada no cais", outcome: null })
        expect(calls[1]!.toolNames).toEqual(expect.arrayContaining(["start_combat", "update_combat", "end_combat", "get_combat"]))
        expect(calls[0]!.instructions).toContain("## Combate narrativo")

        await playersTurn(id, owner, player, 2)
        // O combate em andamento volta ao prompt da narração seguinte.
        expect(calls[2]!.instructions).toContain("## Combate em andamento: Emboscada no cais")
        expect(calls[2]!.instructions).toContain("**Contrabandista** (3)")
        expect(calls[2]!.userText).toContain("[Turno 2 — combate começou: Emboscada no cais (Cais de Brumas)")
        const updated = await MaddoxCombatModel.findOne({ campaignId: id, status: "active" }).lean()
        expect(updated!.combatants.find((item) => item.name === "Varn, o Cinzento")!.condition).toBe("ferido no ombro")
        expect(updated!.combatants.map((item) => item.name)).toContain("Capanga gigante")
        expect(updated!.masterTurns).toBe(2)

        await playersTurn(id, owner, player, 3)
        // Fim: desfecho gravado, efeitos aplicados e card DEPOIS da narração.
        const ended = await MaddoxCombatModel.findOne({ campaignId: id }).lean()
        expect(ended).toMatchObject({ status: "ended", outcome: "vitoria", endedTurn: 4, masterTurns: 3, masterNotes: "O gigante foi contratado pela guilda." })
        expect(ended!.combatants.map((item) => [item.name, item.outcome])).toEqual([
            ["Varn, o Cinzento", "morto"],
            ["Contrabandista", "fugiu"],
            ["Capanga gigante", "rendeu-se"],
        ])
        expect(ended!.image).toMatchObject({ status: "awaiting-feature" })
        expect(ended!.finalScene).toContain("cais vazio")
        // Grau narrativo: recompensas só registradas.
        expect(ended!.rewards.map((reward) => [reward.kind, reward.applied])).toEqual([
            ["moedas", false],
            ["outro", false],
        ])
        expect((await MaddoxNpcModel.findOne({ campaignId: id }).lean())!.status).toBe("dead")
        expect((await MaddoxCharacterModel.findById(doran.characterId).lean())!.currentState).toBe("Corte fundo no braço.")
        const memory = await MaddoxCampaignMemoryModel.findOne({ campaignId: id, kind: "evento" }).lean()
        expect(memory).toMatchObject({ title: "Combate: Emboscada no cais (turno 2)", visibility: "players", turnNumber: 4, combatId: ended!._id })
        expect(memory!.text).toContain("Varn caiu no cais")
        expect(memory!.text).toContain("Varn, o Cinzento — Morto")
        expect(await kindsInOrder(id, 4)).toEqual(["narration", "combat:end"])

        const after = await game.getGameState(id, player)
        expect(after.combat).toBeNull()
        expect(after.npcs).toEqual([expect.objectContaining({ name: "Varn, o Cinzento", status: "dead" })])
        const endCard = after.messages.find((message) => message.combat?.event === "end")!.combat!
        expect(endCard).toMatchObject({ outcome: "vitoria", summary: "Varn caiu no cais e os contrabandistas fugiram para a névoa.", masterTurns: 3, endedTurn: 4 })
        expect(endCard.rewards).toEqual([
            expect.objectContaining({ kind: "moedas", description: "30 po para Lyra", applied: false }),
            expect.objectContaining({ kind: "outro", description: "Um mapa do farol", applied: false }),
        ])
        // Segredos do mestre nunca chegam aos jogadores.
        expect(JSON.stringify(after)).not.toContain("guilda")
        expect(JSON.stringify(after)).not.toContain("corpo de Varn")

        await playersTurn(id, owner, player, 4)
        expect(calls[4]!.instructions).not.toContain("## Combate em andamento")
        expect(calls[4]!.userText).toContain("combate terminou: Vitória — Varn caiu no cais")
    })

    it("recusas: segundo início, fim sem combate, adversário desconhecido; respostas a perguntas não recebem as ferramentas", async () => {
        const { id, owner, player } = await table("narrativo")
        script.push(
            [
                { tools: [{ name: "end_combat", input: { resultado: "vitoria", resumo: "x", cenaFinal: "x" } }] },
                { tools: [{ name: "start_combat", input: { titulo: "Briga", adversarios: [{ nome: "Bêbado" }] } }] },
                { tools: [{ name: "start_combat", input: { titulo: "Outra", adversarios: [{ nome: "Guarda" }] } }] },
                { tools: [{ name: "end_combat", input: { resultado: "vitoria", resumo: "x", cenaFinal: "x", adversarios: [{ nome: "Fantasma", desfecho: "morto" }] } }], text: "Um bêbado parte para cima de vocês." },
            ],
            [{ text: "Há dois guardas." }],
        )
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(toolLog.map((item) => [item.name, item.error ?? "ok"])).toEqual([
            ["end_combat", "Nenhum combate em andamento para encerrar."],
            ["start_combat", "ok"],
            ["start_combat", expect.stringContaining('Já há um combate em andamento ("Briga")')],
            ["end_combat", expect.stringContaining('"Fantasma" não está neste combate. Participantes: Bêbado')],
        ])
        expect(await MaddoxCombatModel.find({ campaignId: id }).lean()).toEqual([expect.objectContaining({ title: "Briga", status: "active" })])

        await game.submitGameAction(id, { kind: "question", content: "Quantos guardas há?" }, player)
        await waitForCampaignIdle(id)
        expect(calls[1]!.toolNames).not.toContain("start_combat")
        expect(calls[1]!.toolNames).not.toContain("end_combat")
    })

    it("geração que falha depois do start_combat não deixa combate nenhum gravado", async () => {
        const { id, owner } = await table("narrativo")
        script.push([{ tools: [{ name: "start_combat", input: { titulo: "Emboscada", adversarios: [{ nome: "Lobo", registrarNpc: true }] } }], text: "Lobos!", fail: true }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(toolLog[0]).toMatchObject({ name: "start_combat" })
        expect(await MaddoxCombatModel.countDocuments({ campaignId: id })).toBe(0)
        expect(await MaddoxNpcModel.countDocuments({ campaignId: id })).toBe(0)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, kind: { $in: ["combat", "narration"] } })).toBe(0)
        expect((await game.getGameState(id, owner)).turn.failed).toBe(true)
    })

    it("Rigoroso e Fiel ao D&D ficam fora do combate narrativo (Maddox 7): sem ferramentas nem regra", async () => {
        const { id, owner } = await table("rigoroso")
        script.push([{ text: "Abertura." }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(calls[0]!.toolNames).not.toContain("start_combat")
        expect(calls[0]!.instructions).not.toContain("## Combate narrativo")
        const { findMaddoxTool, runMaddoxTool } = await import("@/features/maddox/server/master-tools")
        await expect(runMaddoxTool(findMaddoxTool("start_combat")!, { campaignId: new mongoose.Types.ObjectId(id), turnNumber: 1, jobId: "x" }, { titulo: "Briga", adversarios: [{ nome: "Guarda" }] })).rejects.toThrow(
            "Esta campanha não registra combate narrativo",
        )
    })

    it("Equilibrado: moedas e itens entram na ficha de quem recebeu, uma vez só; item fora do catálogo vira item próprio com aviso", async () => {
        const { id, owner, player, lyra, doran } = await table("equilibrado")
        await ItemModel.collection.insertOne({ name: "Espada Longa", status: "active", type: "arma", image: "/espada.png" })
        script.push(
            [{ tools: [{ name: "start_combat", input: { titulo: "Ratos do porão", adversarios: [{ nome: "Rato gigante", quantidade: 4 }] } }], text: "Ratos!" }],
            [
                {
                    tools: [
                        // Personagem desconhecido: recusado sem gravar nada.
                        { name: "end_combat", input: { resultado: "vitoria", resumo: "x", cenaFinal: "x", recompensas: [{ tipo: "moedas", personagem: "Zé", moedas: { po: 1 } }] } },
                        {
                            name: "end_combat",
                            input: {
                                resultado: "vitoria",
                                resumo: "Os ratos fogem pelos canos.",
                                adversarios: [{ nome: "Rato gigante", desfecho: "fugiu" }],
                                recompensas: [
                                    { tipo: "moedas", personagem: "lyra", moedas: { po: 30, pp: 5 } },
                                    { tipo: "item", personagem: "Lyra", item: "espada longa" },
                                    { tipo: "item", personagem: "Doran", item: "Amuleto de Osso", quantidade: 2 },
                                    { tipo: "moedas", moedas: { pc: 12 } },
                                ],
                                cenaFinal: "O porão vazio.",
                            },
                        },
                    ],
                    text: "O porão fica em silêncio.",
                },
            ],
        )
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        await playersTurn(id, owner, player, 1)

        expect(toolLog.find((item) => item.error)?.error).toContain('Nenhum personagem jogador chamado "Zé". Personagens: ')
        const combat = await MaddoxCombatModel.findOne({ campaignId: id }).lean()
        expect(combat!.status).toBe("ended")
        expect(combat!.rewards.map((reward) => [reward.kind, reward.applied, reward.warning])).toEqual([
            ["moedas", true, null],
            ["item", true, null],
            ["item", true, '"Amuleto de Osso" não está no catálogo: entrou como item próprio.'],
            // Sem personagem (o grupo): só registrada.
            ["moedas", false, null],
        ])
        const lyraSheet = await CharacterSheet.collection.findOne({ _id: lyra.sheetId! })
        expect(lyraSheet!.coins).toMatchObject({ gp: 40, sp: 5 })
        const lyraItems = await CharacterItem.find({ sheetId: lyra.sheetId }).lean()
        expect(lyraItems).toEqual([expect.objectContaining({ quantity: 1, equipped: false, catalogItemType: "arma", image: "/espada.png" })])
        expect(lyraItems[0]!.catalogItemId).toBeTruthy()
        expect(lyraItems[0]!.name).toContain("Espada Longa")
        const doranItems = await CharacterItem.find({ sheetId: doran.sheetId }).lean()
        expect(doranItems).toEqual([expect.objectContaining({ name: "<p>Amuleto de Osso</p>", quantity: 2, catalogItemId: null })])
        expect(publishSheetPatched).toHaveBeenCalledTimes(1)
        expect(publishCollectionChanged).toHaveBeenCalledTimes(2)

        // Reaplicar (retomada) não duplica nada.
        expect(await applyCombatRewards({ _id: new mongoose.Types.ObjectId(id), rigor: "equilibrado", ownerId: owner }, combat!._id)).toBe(0)
        expect((await CharacterSheet.collection.findOne({ _id: lyra.sheetId! }))!.coins).toMatchObject({ gp: 40, sp: 5 })
        expect(await CharacterItem.countDocuments({})).toBe(2)

        const state = await game.getGameState(id, player)
        const card = state.messages.find((message) => message.combat?.event === "end")!.combat!
        expect(card.rewards.map((reward) => [reward.description, reward.applied])).toEqual([
            ["30 po, 5 pp para Lyra", true],
            ["Espada Longa para Lyra", true],
            ["Amuleto de Osso (2) para Doran", true],
            ["12 pc", false],
        ])
    })

    it("Equilibrado: escrita na ficha que falha desfaz a marca 'Na ficha' e não impede as recompensas seguintes", async () => {
        const { id, owner, player, lyra } = await table("equilibrado")
        script.push(
            [{ tools: [{ name: "start_combat", input: { titulo: "Ratos", adversarios: [{ nome: "Rato" }] } }], text: "Ratos!" }],
            [
                {
                    tools: [
                        {
                            name: "end_combat",
                            input: {
                                resultado: "vitoria",
                                resumo: "Os ratos fogem.",
                                recompensas: [
                                    { tipo: "moedas", personagem: "Lyra", moedas: { po: 30 } },
                                    { tipo: "item", personagem: "Lyra", item: "Corda" },
                                ],
                                cenaFinal: "x",
                            },
                        },
                    ],
                    text: "Silêncio.",
                },
            ],
        )
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        const spy = vi.spyOn(CharacterSheet, "findByIdAndUpdate").mockImplementationOnce(() => {
            throw new Error("banco oscilou")
        })
        await playersTurn(id, owner, player, 1)
        spy.mockRestore()
        const combat = await MaddoxCombatModel.findOne({ campaignId: id }).lean()
        expect(combat!.rewards.map((reward) => [reward.kind, reward.applied])).toEqual([
            ["moedas", false],
            ["item", true],
        ])
        expect((await CharacterSheet.collection.findOne({ _id: lyra.sheetId! }))!.coins).toMatchObject({ gp: 10 })
        expect(await CharacterItem.countDocuments({ sheetId: lyra.sheetId })).toBe(1)
        // Uma nova aplicação entrega o que faltou, sem duplicar o item.
        expect(await applyCombatRewards({ _id: new mongoose.Types.ObjectId(id), rigor: "equilibrado", ownerId: owner }, combat!._id)).toBe(1)
        expect((await CharacterSheet.collection.findOne({ _id: lyra.sheetId! }))!.coins).toMatchObject({ gp: 40 })
        expect(await CharacterItem.countDocuments({ sheetId: lyra.sheetId })).toBe(1)
    })

    it("Equilibrado: falha ao carregar o serviço da ficha depois do claim desfaz a marca e segue para as demais recompensas", async () => {
        const { id, owner, player, lyra } = await table("equilibrado")
        script.push(
            [{ tools: [{ name: "start_combat", input: { titulo: "Ratos", adversarios: [{ nome: "Rato" }] } }], text: "Ratos!" }],
            [
                {
                    tools: [
                        {
                            name: "end_combat",
                            input: {
                                resultado: "vitoria",
                                resumo: "Os ratos fogem.",
                                recompensas: [
                                    { tipo: "moedas", personagem: "Lyra", moedas: { po: 30 } },
                                    { tipo: "item", personagem: "Lyra", item: "Corda" },
                                ],
                                cenaFinal: "x",
                            },
                        },
                    ],
                    text: "Silêncio.",
                },
            ],
        )
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        sheetService.broken = true
        await playersTurn(id, owner, player, 1)
        const combat = await MaddoxCombatModel.findOne({ campaignId: id }).lean()
        expect(combat!.rewards.map((reward) => [reward.kind, reward.applied, reward.sheetId])).toEqual([
            ["moedas", false, null],
            ["item", false, null],
        ])
        expect((await CharacterSheet.collection.findOne({ _id: lyra.sheetId! }))!.coins).toMatchObject({ gp: 10 })
        expect(await CharacterItem.countDocuments({ sheetId: lyra.sheetId })).toBe(0)
        // Com o serviço de volta, uma nova aplicação entrega as duas.
        sheetService.broken = false
        expect(await applyCombatRewards({ _id: new mongoose.Types.ObjectId(id), rigor: "equilibrado", ownerId: owner }, combat!._id)).toBe(2)
        expect((await CharacterSheet.collection.findOne({ _id: lyra.sheetId! }))!.coins).toMatchObject({ gp: 40 })
    })

    it("JEV 'Início ou fim de combate': orientação na tarefa, de entrada fora de combate e de saída em combate", async () => {
        const { id, owner, player } = await table("narrativo")
        jev.combatBoundary = true
        script.push([{ text: "Abertura." }], [{ tools: [{ name: "start_combat", input: { titulo: "Briga", adversarios: [{ nome: "Bêbado" }] } }], text: "Briga!" }], [{ text: "Segue a luta." }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        // Abertura (sem declarações): o JEV não é consultado.
        expect(askJevSystemOne).not.toHaveBeenCalled()
        await playersTurn(id, owner, player, 1)
        expect(calls[1]!.userText).toContain("provavelmente começam um combate")
        expect(JSON.stringify(askJevSystemOne.mock.calls[0]![0])).toContain("entra em combate agora")
        await playersTurn(id, owner, player, 2)
        expect(calls[2]!.userText).toContain("provavelmente encerram o combate")
        expect(JSON.stringify(askJevSystemOne.mock.calls[1]![0])).toContain('O grupo está em combate (\\"Briga\\")')
    })

    it("dois combates com o mesmo título viram dois marcos da história (um por combate)", async () => {
        const { id, owner, player } = await table("narrativo")
        const fight = (resumo: string) => [
            { tools: [{ name: "start_combat", input: { titulo: "Emboscada de bandidos", adversarios: [{ nome: "Bandido", quantidade: 2 }] } }] },
            { tools: [{ name: "end_combat", input: { resultado: "vitoria", resumo, cenaFinal: "Estrada vazia." } }], text: "Os bandidos caem." },
        ]
        script.push(fight("Primeira emboscada vencida."), fight("Segunda emboscada vencida."))
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        await playersTurn(id, owner, player, 1)
        const memories = await MaddoxCampaignMemoryModel.find({ campaignId: id, kind: "evento" }).sort({ turnNumber: 1 }).lean()
        expect(memories.map((memory) => [memory.title, memory.text.includes("Primeira") ? 1 : memory.text.includes("Segunda") ? 2 : 0])).toEqual([
            ["Combate: Emboscada de bandidos (turno 1)", 1],
            ["Combate: Emboscada de bandidos (turno 2)", 2],
        ])
    })

    it("NPC registrado depois do início (save_npc) recebe o desfecho no fim do combate", async () => {
        const { id, owner, player } = await table("narrativo")
        script.push(
            [{ tools: [{ name: "start_combat", input: { titulo: "Duelo", adversarios: [{ nome: "Varn" }] } }], text: "Varn saca a espada." }],
            [{ tools: [{ name: "save_npc", input: { name: "varn", publicDescription: "Espadachim." } }], text: "Varn se revela." }],
            [{ tools: [{ name: "end_combat", input: { resultado: "vitoria", resumo: "Varn caiu.", adversarios: [{ nome: "Varn", desfecho: "morto" }], cenaFinal: "x" } }], text: "Fim." }],
        )
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        await playersTurn(id, owner, player, 1)
        await playersTurn(id, owner, player, 2)
        const npc = await MaddoxNpcModel.findOne({ campaignId: id }).lean()
        expect(npc!.status).toBe("dead")
        const combat = await MaddoxCombatModel.findOne({ campaignId: id }).lean()
        expect(String(combat!.combatants[0]!.npcId)).toBe(String(npc!._id))
    })

    it("nomes repetidos de participantes são recusados (start_combat e update_combat)", async () => {
        const { id, owner } = await table("narrativo")
        script.push([
            { tools: [{ name: "start_combat", input: { titulo: "Matilha", adversarios: [{ nome: "Lobo" }, { nome: "lobo" }] } }] },
            { tools: [{ name: "start_combat", input: { titulo: "Matilha", adversarios: [{ nome: "Lobo", quantidade: 2 }] } }] },
            { tools: [{ name: "update_combat", input: { adversarios: [{ nome: "Lobo alfa" }, { nome: "Lobo Alfa" }] } }], text: "Lobos!" },
        ])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        expect(toolLog.map((item) => [item.name, item.error ? "erro" : "ok"])).toEqual([
            ["start_combat", "erro"],
            ["start_combat", "ok"],
            ["update_combat", "erro"],
        ])
        expect(toolLog[0]!.error).toContain('"lobo" aparece mais de uma vez no combate')
        expect(toolLog[0]!.error).toContain("quantidade")
        const combat = await MaddoxCombatModel.findOne({ campaignId: id }).lean()
        expect(combat!.combatants.map((item) => [item.name, item.quantity])).toEqual([["Lobo", 2]])
    })

    it("falha ao gravar as mensagens depois de encerrar: efeitos esperam, e a retomada grava o card que faltou e aplica os efeitos uma vez", async () => {
        const { id, owner, player } = await table("narrativo")
        script.push(
            [{ tools: [{ name: "start_combat", input: { titulo: "Duelo", adversarios: [{ nome: "Varn", registrarNpc: true }] } }], text: "Varn ataca." }],
            [{ tools: [{ name: "end_combat", input: { resultado: "vitoria", resumo: "Varn caiu.", adversarios: [{ nome: "Varn", desfecho: "morto" }], cenaFinal: "x" } }], text: "Varn cai." }],
            // Retomada: o combate já está encerrado; o Maddox só narra.
            [{ text: "Varn está caído no chão." }],
        )
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        const spy = vi.spyOn(MaddoxCampaignMessageModel, "insertMany").mockRejectedValueOnce(new Error("banco oscilou"))
        await playersTurn(id, owner, player, 1)
        spy.mockRestore()

        // Combate encerrado, mas sem card nem narração: os efeitos do fim ainda não rodaram.
        expect(await MaddoxCombatModel.findOne({ campaignId: id }).lean()).toMatchObject({ status: "ended", effectsApplied: false })
        expect((await MaddoxNpcModel.findOne({ campaignId: id }).lean())!.status).toBe("active")
        expect(await MaddoxCampaignMemoryModel.countDocuments({ campaignId: id, kind: "evento" })).toBe(0)
        expect(await MaddoxCampaignMessageModel.countDocuments({ campaignId: id, turnNumber: 2, kind: { $in: ["narration", "combat"] } })).toBe(0)

        // Retomada (passado o intervalo de nova tentativa).
        await MaddoxCampaignModel.updateOne({ _id: id }, { $set: { "turn.failedAt": new Date(Date.now() - 60_000) } })
        await game.getGameState(id, owner)
        await waitForCampaignIdle(id)
        expect(await kindsInOrder(id, 2)).toEqual(["narration", "combat:end"])
        expect((await MaddoxNpcModel.findOne({ campaignId: id }).lean())!.status).toBe("dead")
        expect(await MaddoxCampaignMemoryModel.countDocuments({ campaignId: id, kind: "evento" })).toBe(1)
        expect(await MaddoxCombatModel.findOne({ campaignId: id }).lean()).toMatchObject({ effectsApplied: true })
        expect((await game.getGameState(id, owner)).turn).toMatchObject({ number: 2, phase: "players" })
    })

    it("JEV desligado ou que nega: narra sem a orientação", async () => {
        const { id, owner, player } = await table("narrativo")
        script.push([{ text: "Abertura." }], [{ text: "Nada acontece." }])
        await game.startCampaign(id, owner)
        await waitForCampaignIdle(id)
        await playersTurn(id, owner, player, 1)
        expect(askJevSystemOne).not.toHaveBeenCalled()
        expect(calls[1]!.userText).not.toContain("o JEV indica")
    })
})
