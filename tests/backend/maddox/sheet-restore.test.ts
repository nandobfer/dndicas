import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import type { MaddoxMasterSink, MaddoxNarrationContext } from "@/features/maddox/server/game-master"
import type { SheetRestoreReviewInput } from "@/features/maddox/server/sheet-restore-ai"

/**
 * Fichas no reinício da campanha (DND-50): as três fontes da restauração — a cópia tirada em "Iniciar campanha" (e
 * atualizada por quem conclui a entrevista com a campanha em andamento), o retrato do 1º turno (campanhas iniciadas antes)
 * e o ajuste pelo Maddox (lista fechada sobre a referência calculada pelo servidor) —, o bloqueio do início durante o
 * ajuste, a falha (ficha como estava, aviso só ao dono, "Tentar de novo" só do que falhou) e o ajuste preso.
 */

const recordAudit = vi.fn<(entry: Record<string, unknown>) => Promise<undefined>>(async () => undefined)
vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
const sheetPusher = vi.hoisted(() => ({ publishSheetPatched: vi.fn(async () => undefined), publishCollectionChanged: vi.fn(async () => undefined) }))
vi.mock("@/features/character-sheets/realtime/character-sheet-pusher-service", () => ({ CharacterSheetPusherService: { getInstance: () => sheetPusher } }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: { enabled: true, avatar: { url: null } }, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))
vi.mock("@/features/maddox/server/game-presence", () => ({ onlineUserIds: vi.fn(async () => null) }))
vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)
vi.mock("@/lib/storage/s3", () => ({ deleteFile: vi.fn(async () => undefined) }))
vi.mock("@/features/engramind/server/campaign-channels", () => ({ syncCampaignChannelLifecycle: vi.fn(async () => undefined), provisionCampaignMemoryNetworkSafely: vi.fn(async () => true) }))
vi.mock("@/features/maddox/server/game-master", () => ({
    getMaddoxMaster: vi.fn(async () => ({
        narrate: vi.fn(async (context: MaddoxNarrationContext, sink: MaddoxMasterSink) => {
            sink.delta("Abertura")
            return `Narração do turno ${context.turnNumber}`
        }),
        answer: vi.fn(async () => "Resposta."),
    })),
}))
vi.mock("@/features/maddox/server/opencode-sessions", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/opencode-sessions")>()), rotateNarratorSession: vi.fn(async () => undefined) }))
vi.mock("@/features/engramind/server/campaign-rewind", () => ({
    MemoryRewindUnavailableError: class extends Error {},
    npcTokenBoxesOf: vi.fn(async () => new Map()),
    purgeCampaignMemories: vi.fn(async () => 0),
}))

/** Ficha do fim da entrevista calculada pelo servidor (o construtor real precisa do catálogo inteiro). */
const reference = vi.hoisted(() => ({ calls: 0, attacks: [] as Record<string, unknown>[] }))
vi.mock("@/features/maddox/server/sheet-builder", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/maddox/server/sheet-builder")>()),
    computeCharacterSheet: vi.fn(async (input: { sheetId: mongoose.Types.ObjectId }) => {
        reference.calls++
        return { set: { hpMax: 12, hpCurrent: 12, level: 1 }, items: [{ sheetId: input.sheetId, name: "<p>Espada longa</p>", quantity: 1, equipped: true }], attacks: reference.attacks.map((attack) => ({ ...attack, sheetId: input.sheetId })), spells: [] }
    }),
}))

/** Maddox do ajuste: `hold` segura a resposta; `failFor` faz falhar para um personagem; `response` é a lista devolvida. */
const ai = vi.hoisted(() => ({ hold: null as Promise<void> | null, failFor: new Set<string>(), response: null as ((input: SheetRestoreReviewInput) => unknown) | null, inputs: [] as SheetRestoreReviewInput[] }))
vi.mock("@/features/maddox/server/sheet-restore-ai", () => ({
    reviewSheetRestore: vi.fn(async (input: SheetRestoreReviewInput) => {
        ai.inputs.push(input)
        if (ai.hold) await ai.hold
        if (ai.failFor.has(input.characterName)) throw new Error(`provedor fora (MARCADOR-${input.characterName})`)
        return ai.response ? ai.response(input) : { changes: [] }
    }),
}))

const models = await import("@/features/maddox/models")
const { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxCampaignSnapshotModel, MaddoxInterviewModel } = models
const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
const { CharacterItem } = await import("@/features/character-sheets/models/character-item")
const { CharacterSpell } = await import("@/features/character-sheets/models/character-spell")
const { CharacterAttack } = await import("@/features/character-sheets/models/character-attack")
const { CharacterFeat } = await import("@/features/character-sheets/models/character-feat")
const { CharacterTrait } = await import("@/features/character-sheets/models/character-trait")
const campaigns = await import("@/features/maddox/server/campaigns")
const game = await import("@/features/maddox/server/game")
const reset = await import("@/features/maddox/server/campaign-reset")
const restore = await import("@/features/maddox/server/sheet-restore")
const snapshots = await import("@/features/maddox/server/turn-snapshots")
const { waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const { waitForOpexIdle } = await import("@/features/maddox/server/opex-runtime")
const { MADDOX_RESET_TEXTS } = await import("@/features/maddox/constants")
// Carrega o módulo falso antes dos ajustes: dois imports concorrentes durante a fábrica do mock recebem o original.
await import("@/features/maddox/server/sheet-builder")

vi.setConfig({ testTimeout: 30_000 })

let mongo: MongoMemoryServer
let seq = 0

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username, email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

/** Mesa no grau Equilibrado (com ficha): cada personagem com ficha, um item e a entrevista concluída. */
async function table(players: number) {
    const owner = await seedUser("dono")
    const created = await campaigns.createCampaign({ name: "Fichas", rigor: "equilibrado" }, owner)
    await MaddoxCampaignModel.updateOne({ _id: created.id }, { $set: { "scenarioInterview.status": "done", openingSituation: "Uma estrada." } })
    const token = (await campaigns.getInviteLink(created.id, owner)).token
    const users = [owner]
    for (let index = 1; index < players; index++) {
        const userId = await seedUser(`jogador${index}`)
        await campaigns.joinByInvite(token, userId)
        users.push(userId)
    }
    const seats: { userId: string; memberId: string; characterId: string; sheetId: string }[] = []
    for (const [index, userId] of users.entries()) seats.push(await seat(created.id, userId, index))
    return { id: created.id, owner, seats }
}

async function seat(campaignId: string, userId: string, index: number) {
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const sheet = await CharacterSheet.create({ slug: `ficha-${++seq}`, userId, name: `Herói ${index}`, hpMax: 12, hpCurrent: 12, photo: `https://img/heroi-${index}.png` })
    await CharacterItem.create({ sheetId: sheet._id, name: "<p>Espada longa</p>", quantity: 1, equipped: true })
    const character = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name: `Herói ${index}`, portraitUrl: `https://img/heroi-${index}.png`, sheetId: sheet._id, interview: { status: "done", scriptVersion: 0 } })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
    await MaddoxInterviewModel.create({ campaignId, kind: "character", memberId: member!._id, userId, characterId: character._id, scriptVersion: 0, status: "done", result: { name: `Herói ${index}`, sheet: null } })
    return { userId, memberId: String(member!._id), characterId: String(character._id), sheetId: String(sheet._id) }
}

const settle = async <T>(id: string, action: Promise<T>) => {
    const result = await action
    await waitForCampaignIdle(id)
    await waitForOpexIdle()
    return result
}

/** A história mexeu na ficha: PV, um item perdido e um ganho. Devolve o id do item ganho. */
async function playOnSheet(sheetId: string): Promise<string> {
    await CharacterSheet.updateOne({ _id: sheetId }, { $set: { hpCurrent: 3, photo: "https://img/antiga.png" } })
    await CharacterItem.deleteMany({ sheetId })
    const gold = await CharacterItem.create({ sheetId, name: "<p>Bolsa de ouro</p>", quantity: 50, equipped: false })
    return String(gold._id)
}

const sheetOf = async (sheetId: string) => ({ sheet: await CharacterSheet.findById(sheetId).lean(), items: (await CharacterItem.find({ sheetId }).lean()).map((item) => item.name) })

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_sheet_restore_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignSnapshotModel.init(), MaddoxInterviewModel.init(), CharacterSheet.init()])
}, 180_000)

afterAll(async () => {
    await reset.waitForCampaignResets()
    await waitForOpexIdle()
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    const db = mongoose.connection.db!
    for (const collection of await db.collections()) await collection.deleteMany({})
    Object.assign(ai, { hold: null, failFor: new Set(), response: null, inputs: [] })
    reference.calls = 0
    reference.attacks = []
    recordAudit.mockClear()
})

describe("cópia da ficha no início", () => {
    it("Iniciar campanha guarda a cópia; o reinício volta a ela (com o retrato atual) e a preserva; o próximo início a substitui", async () => {
        const { id, owner, seats } = await table(1)
        await settle(id, game.startCampaign(id, owner))
        const copy = await MaddoxCampaignSnapshotModel.findOne({ campaignId: id, kind: "start" }).lean()
        expect(copy!.sheets.map((entry) => String(entry.sheetId))).toEqual([seats[0]!.sheetId])

        await playOnSheet(seats[0]!.sheetId)
        await MaddoxCharacterModel.updateOne({ _id: seats[0]!.characterId }, { $set: { portraitUrl: "https://img/novo.png" } })
        await settle(id, reset.resetCampaign(id, owner))

        const after = await sheetOf(seats[0]!.sheetId)
        expect(after.sheet).toMatchObject({ hpCurrent: 12, photo: "https://img/novo.png" })
        expect(after.items).toEqual(["<p>Espada longa</p>"])
        expect(reference.calls).toBe(0)
        expect(await MaddoxCampaignSnapshotModel.countDocuments({ campaignId: id, kind: "start" })).toBe(1)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "CampanhaMaddox", depois: expect.objectContaining({ fichas: { "Herói 0": "copia" } }) }))

        await CharacterSheet.updateOne({ _id: seats[0]!.sheetId }, { $set: { hpMax: 20, hpCurrent: 20 } })
        await settle(id, game.startCampaign(id, owner))
        const replaced = await MaddoxCampaignSnapshotModel.findOne({ campaignId: id, kind: "start" }).lean()
        expect(replaced!.sheets[0]!.sheet).toMatchObject({ hpMax: 20, hpCurrent: 20 })
        expect(new Date(replaced!.takenAt).getTime()).toBeGreaterThan(new Date(copy!.takenAt).getTime())
    })

    it("DND-51: entrevista → iniciar → reiniciar devolve atributo de conjuração, magias (classe, espécie, talento), ataques, talento e característica", async () => {
        const { id, owner, seats } = await table(1)
        const { sheetId } = seats[0]!
        await CharacterSheet.updateOne({ _id: sheetId }, { $set: { spellcastingAttribute: "wisdom" } })
        for (const name of ["Raio de Fogo", "Rajada de Veneno", "Orientação"]) await CharacterSpell.create({ sheetId, name: `<p>${name}</p>`, circle: 0, prepared: true })
        await CharacterAttack.create({ sheetId, name: "<p>Rajada de Veneno</p>", attackBonus: "+5", damageType: "", notes: "auto:spell:x" })
        await CharacterAttack.create({ sheetId, name: "<p>Adaga</p>", attackBonus: "+5", damageType: "", notes: "" })
        await CharacterFeat.create({ sheetId, name: "Iniciado em Magia", description: "<p>Dois truques.</p>" })
        await CharacterTrait.create({ sheetId, name: "Conjuração Serpentina", description: "<p>Você sabe Rajada de Veneno.</p>" })
        await settle(id, game.startCampaign(id, owner))
        // A história mexeu em tudo.
        await CharacterSheet.updateOne({ _id: sheetId }, { $set: { spellcastingAttribute: null } })
        await Promise.all([CharacterSpell.deleteMany({ sheetId }), CharacterAttack.deleteMany({ sheetId }), CharacterFeat.deleteMany({ sheetId }), CharacterTrait.deleteMany({ sheetId })])
        await reset.resetCampaign(id, owner)
        await waitForCampaignIdle(id)
        await reset.waitForCampaignResets()
        expect((await CharacterSheet.findById(sheetId).lean())!.spellcastingAttribute).toBe("wisdom")
        expect((await CharacterSpell.find({ sheetId }).lean()).map((spell) => spell.name).sort()).toEqual(["<p>Orientação</p>", "<p>Raio de Fogo</p>", "<p>Rajada de Veneno</p>"])
        expect((await CharacterAttack.find({ sheetId }).lean()).map((attack) => attack.name).sort()).toEqual(["<p>Adaga</p>", "<p>Rajada de Veneno</p>"])
        expect((await CharacterFeat.find({ sheetId }).lean()).map((feat) => feat.name)).toEqual(["Iniciado em Magia"])
        expect((await CharacterTrait.find({ sheetId }).lean()).map((trait) => trait.name)).toEqual(["Conjuração Serpentina"])
    })

    it("quem conclui a entrevista com a campanha em andamento entra na cópia", async () => {
        const { id, owner } = await table(1)
        await settle(id, game.startCampaign(id, owner))
        const lateUser = await seedUser("atrasado")
        await campaigns.joinByInvite((await campaigns.getInviteLink(id, owner)).token, lateUser)
        const late = await seat(id, lateUser, 9)
        await snapshots.addToStartCopy(new mongoose.Types.ObjectId(id), new mongoose.Types.ObjectId(late.sheetId))
        expect((await MaddoxCampaignSnapshotModel.findOne({ campaignId: id, kind: "start" }).lean())!.sheets).toHaveLength(2)

        await playOnSheet(late.sheetId)
        await settle(id, reset.resetCampaign(id, owner))
        expect((await sheetOf(late.sheetId)).sheet).toMatchObject({ hpCurrent: 12 })
        expect(reference.calls).toBe(0)
    })
})

describe("campanha iniciada antes do DND-50", () => {
    it("sem cópia, a ficha volta à do retrato do 1º turno", async () => {
        const { id, owner, seats } = await table(1)
        await settle(id, game.startCampaign(id, owner))
        await MaddoxCampaignSnapshotModel.deleteMany({ campaignId: id, kind: "start" })
        expect(await MaddoxCampaignSnapshotModel.countDocuments({ campaignId: id, kind: "turn", turnNumber: 1 })).toBe(1)
        await playOnSheet(seats[0]!.sheetId)
        await settle(id, reset.resetCampaign(id, owner))
        const after = await sheetOf(seats[0]!.sheetId)
        expect(after.sheet).toMatchObject({ hpCurrent: 12 })
        expect(after.items).toEqual(["<p>Espada longa</p>"])
        expect(reference.calls).toBe(0)
        // O retrato virou a cópia: repetir o reinício encontra a mesma origem.
        expect(await MaddoxCampaignSnapshotModel.countDocuments({ campaignId: id, kind: "start" })).toBe(1)
    })
})

describe("ajuste pelo Maddox (sem cópia e sem retrato)", () => {
    async function withoutCopy(players = 1) {
        const setup = await table(players)
        await settle(setup.id, game.startCampaign(setup.id, setup.owner))
        await MaddoxCampaignSnapshotModel.deleteMany({ campaignId: setup.id })
        return setup
    }

    it("o Maddox devolve a ficha ao fim da entrevista; o início fica bloqueado até terminar", async () => {
        const { id, owner, seats } = await withoutCopy(2)
        const goldIds = new Map<string, string>()
        for (const item of seats) goldIds.set(item.sheetId, await playOnSheet(item.sheetId))
        let release!: () => void
        ai.hold = new Promise<void>((resolve) => (release = resolve))
        ai.response = (input) => {
            const sheetId = seats[Number(input.characterName.slice(-1))]!.sheetId
            return {
                changes: [
                    { type: "field", field: "hpCurrent", reason: "PV do fim da entrevista" },
                    { type: "remove", collection: "items", id: goldIds.get(sheetId), reason: "ganho na história" },
                    { type: "restore", collection: "items", ref: "i1", reason: "perdida na história" },
                    { type: "field", field: "name", reason: "fora da lista" },
                    { type: "restore", collection: "items", ref: "i9", reason: "ref inexistente" },
                ],
            }
        }

        // Sem esperar as execuções em segundo plano: o ajuste está segurado.
        await reset.resetCampaign(id, owner)
        await waitForCampaignIdle(id)
        await vi.waitFor(() => expect(ai.inputs).toHaveLength(2))
        const ownerView = await campaigns.getCampaignDetail(id, owner)
        expect(ownerView.sheetRestores!.map((item) => item.status)).toEqual(["pending", "pending"])
        expect((await campaigns.getCampaignDetail(id, seats[1]!.userId)).sheetRestores).toEqual([])
        await expect(game.startCampaign(id, owner)).rejects.toMatchObject({ status: 409, code: "SHEETS_ADJUSTING", message: MADDOX_RESET_TEXTS.sheetsAdjusting })
        expect(ai.inputs[0]!.referenceText).toContain('"ref": "i1"')
        expect(ai.inputs[0]!.currentText).toContain("Bolsa de ouro")

        release()
        await restore.waitForSheetRestores()
        for (const item of seats) {
            const after = await sheetOf(item.sheetId)
            expect(after.sheet).toMatchObject({ hpCurrent: 12, name: expect.stringMatching(/^Herói/) })
            expect(after.items).toEqual(["<p>Espada longa</p>"])
        }
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FichaPersonagem", depois: expect.objectContaining({ by: "maddox", origin: "campaign-reset", hpCurrent: 12 }) }))
        expect((await campaigns.getCampaignDetail(id, owner)).sheetRestores).toEqual([])
        expect((await settle(id, game.startCampaign(id, owner))).status).toBe("active")
    })

    it("DND-51: o ajuste nunca tira as escolhas da entrevista (magias, talentos, ataque do truque) nem apaga o atributo de conjuração", async () => {
        const { id, owner, seats } = await withoutCopy(1)
        const { sheetId, memberId } = seats[0]!
        await MaddoxInterviewModel.updateOne(
            { memberId },
            {
                $set: {
                    messages: [
                        { id: "a", role: "maddox", content: "Opções de truque: Orientação, Mensagem, Bola de Fogo (de mago, se trocar de lista).", proposal: false },
                        { id: "b", role: "user", content: "orientação e mensagem de truques", proposal: false },
                        { id: "c", role: "maddox", content: "Síntese: da espécie, [Rajada de Veneno](#mention:Magia:1); do [Iniciado em Magia](#mention:Talento:2), Orientação e Mensagem. Da espécie também a Conjuração Serpentina.", proposal: true },
                    ],
                },
            },
        )
        await CharacterSheet.updateOne({ _id: sheetId }, { $set: { spellcastingAttribute: "wisdom" } })
        const rajada = await CharacterSpell.create({ sheetId, name: "<p>Rajada de Veneno</p>", circle: 0, prepared: true })
        const orientacao = await CharacterSpell.create({ sheetId, name: "<p>Orientação</p>", circle: 0, prepared: true })
        const historia = await CharacterSpell.create({ sheetId, name: "<p>Bola de Fogo</p>", circle: 3, prepared: true })
        const truque = await CharacterAttack.create({ sheetId, name: "<p>Rajada de Veneno</p>", attackBonus: "+5", damageType: "", notes: "auto:spell:abc" })
        const talento = await CharacterFeat.create({ sheetId, name: "Iniciado em Magia", description: "<p>Dois truques.</p>" })
        // A arma da entrevista (ataque comum, na referência) e um ataque ganho na história.
        reference.attacks = [{ name: "<p>Adaga</p>", attackBonus: "+5", damageType: "", notes: "" }]
        const serpentina = await CharacterTrait.create({ sheetId, name: "Conjuração Serpentina", description: "<p>Você sabe Rajada de Veneno.</p>" })
        const maldicao = await CharacterTrait.create({ sheetId, name: "Maldição do pântano", description: "<p>Ganha na história.</p>" })
        const adaga = await CharacterAttack.create({ sheetId, name: "<p>Adaga</p>", attackBonus: "+5", damageType: "", notes: "" })
        const machado = await CharacterAttack.create({ sheetId, name: "<p>Machado do ogro</p>", attackBonus: "+3", damageType: "", notes: "" })
        // Bola de Fogo foi só uma opção citada pelo Maddox no meio da conversa: aprendida na história, ela sai.
        ai.response = () => ({
            changes: [
                { type: "remove", collection: "spells", id: String(rajada._id), reason: "Magia não consta na referência" },
                { type: "remove", collection: "spells", id: String(orientacao._id), reason: "Magia não consta na referência" },
                { type: "remove", collection: "spells", id: String(historia._id), reason: "aprendida na história" },
                { type: "remove", collection: "attacks", id: String(truque._id), reason: "Ataque não consta na referência" },
                { type: "remove", collection: "feats", id: String(talento._id), reason: "Talento não consta na referência" },
                { type: "remove", collection: "attacks", id: String(adaga._id), reason: "volta à referência" },
                { type: "remove", collection: "traits", id: String(serpentina._id), reason: "não consta na referência" },
                { type: "remove", collection: "traits", id: String(maldicao._id), reason: "ganha na história" },
                { type: "remove", collection: "attacks", id: String(machado._id), reason: "ganho na história" },
                { type: "field", field: "spellcastingAttribute", reason: "volta ao da referência" },
            ],
        })
        await reset.resetCampaign(id, owner)
        await waitForCampaignIdle(id)
        await restore.waitForSheetRestores()
        expect((await CharacterSpell.find({ sheetId }).lean()).map((spell) => spell.name).sort()).toEqual(["<p>Orientação</p>", "<p>Rajada de Veneno</p>"])
        expect(await CharacterAttack.exists({ _id: truque._id })).toBeTruthy()
        expect(await CharacterFeat.exists({ _id: talento._id })).toBeTruthy()
        expect(await CharacterAttack.exists({ _id: adaga._id })).toBeTruthy()
        expect(await CharacterAttack.exists({ _id: machado._id })).toBeNull()
        expect(await CharacterTrait.exists({ _id: serpentina._id })).toBeTruthy()
        expect(await CharacterTrait.exists({ _id: maldicao._id })).toBeNull()
        expect((await CharacterSheet.findById(sheetId).lean())!.spellcastingAttribute).toBe("wisdom")
    })

    it("falha num personagem: a ficha dele fica como estava, os outros seguem e Tentar de novo refaz só ele", async () => {
        const { id, owner, seats } = await withoutCopy(2)
        for (const item of seats) await playOnSheet(item.sheetId)
        ai.failFor = new Set(["Herói 1"])
        ai.response = () => ({ changes: [{ type: "field", field: "hpCurrent", reason: "PV" }] })
        await settle(id, reset.resetCampaign(id, owner))
        await restore.waitForSheetRestores()

        expect((await sheetOf(seats[0]!.sheetId)).sheet).toMatchObject({ hpCurrent: 12 })
        expect((await sheetOf(seats[1]!.sheetId)).sheet).toMatchObject({ hpCurrent: 3 })
        const ownerView = await campaigns.getCampaignDetail(id, owner)
        expect(ownerView.sheetRestores).toEqual([{ characterId: seats[1]!.characterId, characterName: "Herói 1", status: "failed" }])
        // O motivo técnico não sai no DTO (nem para o dono): só o aviso fixo da tela.
        expect(JSON.stringify(ownerView)).not.toContain("MARCADOR")
        expect(JSON.stringify(await campaigns.getCampaignDetail(id, seats[1]!.userId))).not.toContain("MARCADOR")

        await expect(restore.retrySheetRestore(id, seats[1]!.characterId, seats[1]!.userId)).rejects.toMatchObject({ status: 403 })
        await expect(restore.retrySheetRestore(id, seats[0]!.characterId, owner)).rejects.toMatchObject({ status: 409, code: "NO_SHEET_RESTORE" })
        ai.failFor = new Set()
        ai.inputs = []
        await restore.retrySheetRestore(id, seats[1]!.characterId, owner)
        await restore.waitForSheetRestores()
        expect(ai.inputs.map((input) => input.characterName)).toEqual(["Herói 1"])
        expect((await sheetOf(seats[1]!.sheetId)).sheet).toMatchObject({ hpCurrent: 12 })
        expect((await campaigns.getCampaignDetail(id, owner)).sheetRestores).toEqual([])
    })

    it("a falha não bloqueia o início", async () => {
        const { id, owner, seats } = await withoutCopy(1)
        await playOnSheet(seats[0]!.sheetId)
        ai.failFor = new Set(["Herói 0"])
        await settle(id, reset.resetCampaign(id, owner))
        await restore.waitForSheetRestores()
        expect((await settle(id, game.startCampaign(id, owner))).status).toBe("active")
    })

    it("ajuste pendente sem execução viva há muito tempo vira falha na leitura do detalhe", async () => {
        const { id, owner, seats } = await withoutCopy(1)
        await settle(id, reset.resetCampaign(id, owner))
        await restore.waitForSheetRestores()
        const resetId = (await MaddoxCampaignModel.findById(id).lean())!.reset!.id
        const old = new Date(Date.now() - 60 * 60 * 1000)
        await MaddoxCharacterModel.updateOne({ _id: seats[0]!.characterId }, { $set: { sheetRestore: { resetId, status: "pending", error: null, startedAt: old, updatedAt: old } } })
        expect((await campaigns.getCampaignDetail(id, owner)).sheetRestores).toEqual([{ characterId: seats[0]!.characterId, characterName: "Herói 0", status: "failed" }])
    })
})

describe("personagem sem ficha", () => {
    it("só a condição e o status são zerados, sem restauração nem ajuste", async () => {
        const { id, owner, seats } = await table(1)
        await CharacterSheet.deleteMany({})
        await MaddoxCharacterModel.updateOne({ _id: seats[0]!.characterId }, { $set: { sheetId: null } })
        await settle(id, game.startCampaign(id, owner))
        await MaddoxCharacterModel.updateOne({ _id: seats[0]!.characterId }, { $set: { currentState: "Exausto", status: "retired" } })
        await settle(id, reset.resetCampaign(id, owner))
        await restore.waitForSheetRestores()
        expect(await MaddoxCharacterModel.findById(seats[0]!.characterId).lean()).toMatchObject({ currentState: "", status: "active", sheetRestore: null })
        expect(ai.inputs).toHaveLength(0)
    })
})
