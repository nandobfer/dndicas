import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: { enabled: true, avatar: { url: "https://cdn/maddox.png" } }, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ available: true, reason: null })),
}))

const { MaddoxCampaignMemberModel, MaddoxCampaignMemoryModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel } = await import("@/features/maddox/models")
const campaigns = await import("@/features/maddox/server/campaigns")
const journal = await import("@/features/maddox/server/journal")

let mongo: MongoMemoryServer

const SECRET_NOTE = "traidor secreto da guilda"
const SECRET_PLACE = "Covil Oculto"
const SECRET_NPC = "Sombra Velada"
const SECRET_FACT = "O rei já está morto"

async function seedUser(username: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name: username.toUpperCase(), email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function giveCharacter(campaignId: string, userId: string, name: string, extra: Record<string, unknown> = {}) {
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId, userId }).lean()
    const character = await MaddoxCharacterModel.create({ campaignId, memberId: member!._id, userId, name, interview: { status: "done", scriptVersion: 0 }, ...extra })
    await MaddoxCampaignMemberModel.updateOne({ _id: member!._id }, { $set: { characterId: character._id } })
    return String(member!._id)
}

const memory = (campaignId: string, kind: string, title: string, text: string, extra: Record<string, unknown> = {}) =>
    MaddoxCampaignMemoryModel.create({ campaignId, kind, title, titleKey: title.toLowerCase(), text, origin: "agent", createdBy: "maddox", ...extra })

const message = (campaignId: string, kind: string, content: string, extra: Record<string, unknown> = {}) => MaddoxCampaignMessageModel.create({ campaignId, turnNumber: 1, phase: kind === "narration" || kind === "answer" ? "master" : "players", kind, content, ...extra })

/** Campanha em andamento com o dono e uma jogadora, NPCs, locais, missões, anotações (umas só do mestre) e falas da mesa. */
async function campaignWithJournal() {
    const owner = await seedUser("dono")
    const player = await seedUser("jogadora")
    const outsider = await seedUser("curioso")
    const created = await campaigns.createCampaign({ name: "Brumas", rigor: "narrativo" }, owner)
    const id = created.id
    await campaigns.joinByInvite((await campaigns.getInviteLink(id, owner)).token, player)
    await MaddoxCampaignModel.updateOne(
        { _id: id },
        {
            $set: {
                status: "active",
                "scenarioInterview.status": "done",
                setting: "Um reino coberto de brumas.",
                openingSituation: "Uma taverna em chamas.",
                "turn.number": 3,
                state: { scene: "O grupo discute no porão da Taverna do Javali.", location: "Porão da taverna", situation: "Bartolomeu observa a escada.", pendingDecision: "Descer ao túnel?", updatedTurn: 3, updatedAt: new Date() },
            },
        },
    )
    const ownerMember = await giveCharacter(id, owner, "Aldric", { profile: { identidade: "Cavaleiro de cabelos grisalhos." }, currentState: "Ferido no ombro." })
    const playerMember = await giveCharacter(id, player, "Lyra", { profile: { origem: "Criada entre os elfos da floresta." }, currentState: "Sem flechas." })

    const bartolomeu = await MaddoxNpcModel.create({ campaignId: id, name: "Bartolomeu", nameKey: "bartolomeu", publicDescription: "Taverneiro gordo e simpático.", masterNotes: SECRET_NOTE, visibility: "players" })
    await MaddoxNpcModel.create({ campaignId: id, name: SECRET_NPC, nameKey: "sombra velada", publicDescription: "Uma figura encapuzada.", masterNotes: "Líder dos cultistas.", visibility: "master" })
    await MaddoxNpcModel.create({ campaignId: id, name: "Guarda Tomé", nameKey: "guarda tome", publicDescription: "Caiu na ponte.", visibility: "players", status: "dead" })

    const taverna = await memory(id, "local", "Taverna do Javali", "Uma taverna de pedra à beira da estrada.", { tags: ["vila"] })
    await memory(id, "local", SECRET_PLACE, "Esconderijo dos cultistas sob a vila.", { visibility: "master" })
    await memory(id, "missao", "Resgatar a filha do moleiro", "A filha do moleiro sumiu na floresta.", { status: "ativa" })
    await memory(id, "missao", "Apagar o incêndio", "O fogo da taverna foi contido.", { status: "concluida" })
    await memory(id, "evento", "O incêndio da taverna", "Na primeira noite, a taverna pegou fogo.")
    await memory(id, "fato", "Segredo da coroa", SECRET_FACT, { visibility: "master" })

    const narration = await message(id, "narration", "As chamas lambem as vigas da **Tavérna** enquanto Bartolomeu grita por água e conjura {{Magia:Raio de Gelo}}.")
    await message(id, "declaration", "Corro para buscar baldes no poço.", { memberId: new mongoose.Types.ObjectId(playerMember), userId: player, characterName: "Lyra" })
    await message(id, "answer", "", { error: "O Maddox não conseguiu responder agora. Pergunte de novo." })

    return { id, owner, player, outsider, ownerMember, playerMember, bartolomeuId: String(bartolomeu._id), tavernaId: String(taverna._id), narrationId: String(narration._id) }
}

/** Cada resposta do diário, em JSON: nenhuma pode carregar o que é só do mestre. */
function expectNoSecrets(value: unknown) {
    const json = JSON.stringify(value)
    for (const secret of [SECRET_NOTE, SECRET_PLACE, SECRET_NPC, SECRET_FACT, "Líder dos cultistas", "Esconderijo dos cultistas", "masterNotes"]) expect(json).not.toContain(secret)
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_journal_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxCampaignMessageModel.init(), MaddoxNpcModel.init(), MaddoxCampaignMemoryModel.init()])
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
    ])
})

describe("Maddox 9 — o que é só do mestre não chega aos jogadores (critério de aceite)", () => {
    it("resumo, listas, grupo e buscas não trazem NPC, local, fato nem notas exclusivas do mestre", async () => {
        const c = await campaignWithJournal()
        const responses = [
            await journal.getJournalSummary(c.id, c.player),
            await journal.listJournalNpcs(c.id, {}, c.player),
            ...(await Promise.all((["local", "missao", "evento", "fato", "relacao", "outro"] as const).map((kind) => journal.listJournalMemories(c.id, { kind }, c.player)))),
            await journal.listJournalParty(c.id, c.player),
            await journal.searchJournal(c.id, { q: "cultistas" }, c.player),
            await journal.searchJournal(c.id, { q: "sombra" }, c.player),
            await journal.searchJournal(c.id, { q: "traidor" }, c.player),
            await journal.searchJournal(c.id, { q: "rei" }, c.player),
            await journal.searchJournal(c.id, { q: "covil" }, c.player),
        ]
        for (const response of responses) expectNoSecrets(response)

        const npcs = await journal.listJournalNpcs(c.id, {}, c.player)
        expect(npcs.items.map((npc) => npc.name).sort()).toEqual(["Bartolomeu", "Guarda Tomé"])
        const places = await journal.listJournalMemories(c.id, { kind: "local" }, c.player)
        expect(places.items.map((item) => item.title)).toEqual(["Taverna do Javali"])
    })

    it("buscar pelo segredo não encontra nada", async () => {
        const c = await campaignWithJournal()
        for (const q of ["traidor", "sombra", "covil", "cultistas"]) {
            const result = await journal.searchJournal(c.id, { q }, c.player)
            expect(result.npcs.items, q).toEqual([])
            expect(result.memories.items, q).toEqual([])
            expect(result.messages.items, q).toEqual([])
        }
    })

    it("o dono da campanha é jogador: vê o mesmo que os outros", async () => {
        const c = await campaignWithJournal()
        const asOwner = await journal.listJournalNpcs(c.id, {}, c.owner)
        expectNoSecrets(asOwner)
        expect(asOwner.items).toHaveLength(2)
    })
})

describe("Maddox 9 — busca por texto", () => {
    it("encontra o local, o NPC e a narração, sem acento, sem caixa e por pedaço do nome", async () => {
        const c = await campaignWithJournal()
        const javali = await journal.searchJournal(c.id, { q: "javali" }, c.player)
        expect(javali.memories.items.map((item) => item.id)).toContain(c.tavernaId)
        expect(javali.state?.excerpt).toContain("Taverna do Javali")

        const bart = await journal.searchJournal(c.id, { q: "bart" }, c.player)
        expect(bart.npcs.items.map((item) => item.id)).toEqual([c.bartolomeuId])
        expect(bart.npcs.items[0]!.excerpt).toBe("Taverneiro gordo e simpático.")
        expect(bart.messages.items.map((item) => item.id)).toContain(c.narrationId)

        for (const q of ["taverna", "TAVÉRNA", "tavérna"]) {
            const result = await journal.searchJournal(c.id, { q }, c.player)
            const hit = result.messages.items.find((item) => item.id === c.narrationId)
            expect(hit, q).toBeDefined()
            expect(hit!.turnNumber).toBe(1)
            expect(hit!.characterName).toBeNull()
            expect(hit!.excerpt).toBe("As chamas lambem as vigas da Tavérna enquanto Bartolomeu grita por água e conjura Raio de Gelo.")
        }
    })

    it("encontra declarações com o personagem, a missão pela situação e os personagens do grupo", async () => {
        const c = await campaignWithJournal()
        const baldes = await journal.searchJournal(c.id, { q: "baldes" }, c.player)
        expect(baldes.messages.items).toEqual([expect.objectContaining({ kind: "declaration", characterName: "Lyra" })])

        const moleiro = await journal.searchJournal(c.id, { q: "moleiro" }, c.player)
        expect(moleiro.memories.items).toEqual([expect.objectContaining({ kind: "missao", status: "ativa" })])

        const elfos = await journal.searchJournal(c.id, { q: "elfos" }, c.player)
        expect(elfos.party.items).toEqual([expect.objectContaining({ memberId: c.playerMember, characterName: "Lyra" })])
        const ombro = await journal.searchJournal(c.id, { q: "ombro" }, c.player)
        expect(ombro.party.items.map((item) => item.characterName)).toEqual(["Aldric"])
    })

    it("busca pelas tags e não traz respostas que falharam", async () => {
        const c = await campaignWithJournal()
        const vila = await journal.searchJournal(c.id, { q: "vila" }, c.player)
        expect(vila.memories.items.map((item) => item.title)).toEqual(["Taverna do Javali"])
        const falha = await journal.searchJournal(c.id, { q: "Pergunte de novo" }, c.player)
        expect(falha.messages.items).toEqual([])
    })

    it("caracteres especiais do regex são literais", async () => {
        const c = await campaignWithJournal()
        await expect(journal.searchJournal(c.id, { q: ".*" }, c.player)).resolves.toMatchObject({ npcs: { items: [] }, memories: { items: [] }, messages: { items: [] } })
    })

    it("termo curto ou longo demais = 400", async () => {
        const c = await campaignWithJournal()
        await expect(journal.searchJournal(c.id, { q: "a" }, c.player)).rejects.toMatchObject({ status: 400, message: "Digite ao menos 2 caracteres para buscar." })
        await expect(journal.searchJournal(c.id, { q: "x".repeat(101) }, c.player)).rejects.toMatchObject({ status: 400 })
    })
})

describe("Maddox 9 — consulta do diário", () => {
    it("resumo: situação atual, cenário, missões ativas e contagens só do que é público", async () => {
        const c = await campaignWithJournal()
        const summary = await journal.getJournalSummary(c.id, c.player)
        expect(summary).toMatchObject({
            name: "Brumas",
            turnNumber: 3,
            myMemberId: c.playerMember,
            maddoxAvatarUrl: "https://cdn/maddox.png",
            setting: "Um reino coberto de brumas.",
            state: { location: "Porão da taverna", pendingDecision: "Descer ao túnel?", updatedTurn: 3 },
            counts: { npcs: 2, party: 2, memories: { local: 1, missao: 2, evento: 1, fato: 0, relacao: 0, outro: 0 } },
        })
        expect(summary.activeQuests.map((quest) => quest.title)).toEqual(["Resgatar a filha do moleiro"])
    })

    it("missões pela situação e NPC morto com a situação", async () => {
        const c = await campaignWithJournal()
        const done = await journal.listJournalMemories(c.id, { kind: "missao", status: "concluida" }, c.player)
        expect(done.items.map((item) => [item.title, item.status])).toEqual([["Apagar o incêndio", "concluida"]])
        const npcs = await journal.listJournalNpcs(c.id, {}, c.player)
        expect(npcs.items.find((npc) => npc.name === "Guarda Tomé")?.status).toBe("dead")
    })

    it("grupo: perfil e condição atual de cada personagem, sem a ficha D&D", async () => {
        const c = await campaignWithJournal()
        const party = await journal.listJournalParty(c.id, c.player)
        expect(party).toEqual([
            expect.objectContaining({ memberId: c.ownerMember, playerName: "DONO", characterName: "Aldric", currentState: "Ferido no ombro.", profile: { identidade: "Cavaleiro de cabelos grisalhos." } }),
            expect.objectContaining({ memberId: c.playerMember, playerName: "JOGADORA", characterName: "Lyra", currentState: "Sem flechas." }),
        ])
        expect(JSON.stringify(party)).not.toContain("sheet")
    })

    it("paginação por cursor", async () => {
        const c = await campaignWithJournal()
        for (let index = 0; index < journal.MADDOX_JOURNAL_PAGE_SIZE + 5; index++) await memory(c.id, "evento", `Marco ${index}`, `Aconteceu o marco ${index}.`)
        const first = await journal.listJournalMemories(c.id, { kind: "evento" }, c.player)
        expect(first.items).toHaveLength(journal.MADDOX_JOURNAL_PAGE_SIZE)
        expect(first.nextCursor).not.toBeNull()
        const second = await journal.listJournalMemories(c.id, { kind: "evento", cursor: first.nextCursor! }, c.player)
        expect(second.items).toHaveLength(6)
        expect(second.nextCursor).toBeNull()
        expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(journal.MADDOX_JOURNAL_PAGE_SIZE + 6)
    })

    it("parâmetros inválidos = 400 com as opções", async () => {
        const c = await campaignWithJournal()
        await expect(journal.listJournalMemories(c.id, { kind: "segredo" }, c.player)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("local") })
        await expect(journal.listJournalMemories(c.id, { kind: "local", cursor: "nao-e-id" }, c.player)).rejects.toMatchObject({ status: 400, message: "Cursor inválido" })
        await expect(journal.listJournalNpcs(c.id, { cursor: "x" }, c.player)).rejects.toMatchObject({ status: 400 })
    })

    it("quem não participa ou saiu da campanha = 404", async () => {
        const c = await campaignWithJournal()
        await expect(journal.getJournalSummary(c.id, c.outsider)).rejects.toMatchObject({ status: 404 })
        await expect(journal.searchJournal(c.id, { q: "taverna" }, c.outsider)).rejects.toMatchObject({ status: 404 })
        await MaddoxCampaignMemberModel.updateOne({ _id: c.playerMember }, { $set: { status: "left" } })
        await expect(journal.listJournalNpcs(c.id, {}, c.player)).rejects.toMatchObject({ status: 404 })
    })

    it("campanha no lobby: diário vazio sem erro", async () => {
        const owner = await seedUser("dona")
        const created = await campaigns.createCampaign({ name: "Nova", rigor: "narrativo" }, owner)
        const summary = await journal.getJournalSummary(created.id, owner)
        expect(summary).toMatchObject({ status: "lobby", counts: { npcs: 0, party: 0 }, state: { scene: "", location: "" }, activeQuests: [] })
        expect((await journal.searchJournal(created.id, { q: "taverna" }, owner)).state).toBeNull()
    })
})
