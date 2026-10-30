import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

const recordAudit = vi.fn(async () => undefined)
const publishToChannels = vi.fn(async () => undefined)
const availability = { available: true, reason: null as string | null }

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(async () => undefined),
    recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", ATRIBUIR: "ATRIBUIR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))
vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({ settings: { enabled: availability.available }, isDefault: false, updatedAt: null })),
    maddoxAvailability: vi.fn(async () => ({ ...availability })),
}))

const { User } = await import("@/features/users/models/user")
const { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel } = await import("@/features/maddox/models")
const service = await import("@/features/maddox/server/campaigns")

let mongo: MongoMemoryServer
const ids = { owner: "", ana: "", bruno: "", stranger: "" }

async function seedUser(username: string, name: string) {
    const _id = new mongoose.Types.ObjectId()
    await mongoose.connection.collection("users").insertOne({ _id, username, name, email: `${username}@example.com`, status: "active", deleted: false, roles: [], createdAt: new Date(), updatedAt: new Date() })
    return String(_id)
}

async function tokenOf(campaignId: string) {
    return (await service.getInviteLink(campaignId, ids.owner)).token
}

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_campaigns_test" })
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all([User.deleteMany({}), MaddoxCampaignModel.deleteMany({}), MaddoxCampaignMemberModel.deleteMany({}), MaddoxCharacterModel.deleteMany({})])
    ids.owner = await seedUser("mestre", "Marina Dona")
    ids.ana = await seedUser("ana", "Ana Jogadora")
    ids.bruno = await seedUser("bruno", "Bruno Jogador")
    ids.stranger = await seedUser("estranho", "Estranho")
    availability.available = true
    availability.reason = null
    recordAudit.mockClear()
    publishToChannels.mockClear()
})

describe("Campanhas Maddox — criação e lista", () => {
    it("cria no lobby com o rigor escolhido e o criador como dono", async () => {
        const campaign = await service.createCampaign({ name: "Brumas de Valdrenn", rigor: "fiel-dnd" }, ids.owner)
        expect(campaign).toMatchObject({ name: "Brumas de Valdrenn", rigor: "fiel-dnd", status: "lobby", myRole: "owner", inviteOpen: true })
        expect(campaign.members).toHaveLength(1)
        expect(campaign.members[0]).toMatchObject({ userId: ids.owner, role: "owner", name: "Marina Dona" })
        const stored = await MaddoxCampaignModel.findById(campaign.id).lean()
        expect(stored?.rigor).toBe("fiel-dnd")
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "CampanhaMaddox", acao: "CRIAR" }))
        expect(publishToChannels).toHaveBeenCalledWith([`private-maddox-u-${ids.owner}`], "maddox.campaign.changed", { campaignId: campaign.id })
    })

    it("com o Agente Maddox indisponível responde 409 com o motivo e não cria", async () => {
        availability.available = false
        availability.reason = 'O "Agente Maddox" está desativado.'
        await expect(service.createCampaign({ name: "Sem mestre", rigor: "narrativo" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "MADDOX_UNAVAILABLE", message: 'O "Agente Maddox" está desativado.' })
        expect(await MaddoxCampaignModel.countDocuments()).toBe(0)
    })

    it("desfaz a campanha se o membro dono não puder ser criado", async () => {
        const spy = vi.spyOn(MaddoxCampaignMemberModel, "create").mockRejectedValueOnce(new Error("falha"))
        await expect(service.createCampaign({ name: "Quebrada", rigor: "narrativo" }, ids.owner)).rejects.toThrow("falha")
        spy.mockRestore()
        expect(await MaddoxCampaignModel.countDocuments()).toBe(0)
    })

    it("a lista mostra só campanhas em que o usuário é dono ou membro ativo", async () => {
        const mine = await service.createCampaign({ name: "Minha", rigor: "narrativo" }, ids.owner)
        const other = await service.createCampaign({ name: "Da Ana", rigor: "rigoroso" }, ids.ana)
        await service.joinByInvite(await tokenOf(mine.id), ids.bruno)

        expect((await service.listMyCampaigns(ids.owner)).map((item) => item.name)).toEqual(["Minha"])
        expect((await service.listMyCampaigns(ids.bruno)).map((item) => item.name)).toEqual(["Minha"])
        expect((await service.listMyCampaigns(ids.ana)).map((item) => item.name)).toEqual(["Da Ana"])
        expect(await service.listMyCampaigns(ids.stranger)).toEqual([])
        expect(other.id).not.toBe(mine.id)

        const bruno = (await service.getCampaignDetail(mine.id, ids.bruno)).myMemberId
        await service.removeMember(mine.id, bruno, ids.bruno)
        expect(await service.listMyCampaigns(ids.bruno)).toEqual([])
    })

    it("quem não participa recebe 404 no detalhe (inclusive id inválido)", async () => {
        const campaign = await service.createCampaign({ name: "Secreta", rigor: "narrativo" }, ids.owner)
        await expect(service.getCampaignDetail(campaign.id, ids.stranger)).rejects.toMatchObject({ status: 404 })
        await expect(service.getCampaignDetail("nao-e-id", ids.owner)).rejects.toMatchObject({ status: 404 })
    })
})

describe("Campanhas Maddox — convite e lobby", () => {
    it("dois jogadores entram pelo mesmo link e todos se veem no lobby e na lista", async () => {
        const campaign = await service.createCampaign({ name: "Mesa cheia", rigor: "equilibrado" }, ids.owner)
        const token = await tokenOf(campaign.id)
        expect(await service.previewInvite(token, ids.ana)).toMatchObject({ name: "Mesa cheia", ownerName: "Marina Dona", memberCount: 1, alreadyMember: false, inviteOpen: true })

        await service.joinByInvite(token, ids.ana)
        await service.joinByInvite(token, ids.bruno)
        // Repetir é idempotente.
        await service.joinByInvite(token, ids.ana)

        for (const userId of [ids.owner, ids.ana, ids.bruno]) {
            const detail = await service.getCampaignDetail(campaign.id, userId)
            expect(detail.members.map((member) => member.name)).toEqual(["Marina Dona", "Ana Jogadora", "Bruno Jogador"])
            expect((await service.listMyCampaigns(userId)).map((item) => item.id)).toEqual([campaign.id])
        }
        expect(await MaddoxCampaignMemberModel.countDocuments({ campaignId: campaign.id })).toBe(3)
        expect((await service.previewInvite(token, ids.ana)).alreadyMember).toBe(true)
        // O aviso em tempo real chega a todos os membros ativos.
        const lastChannels = (publishToChannels.mock.calls.at(-1) as unknown as [string[]])[0]
        expect(new Set(lastChannels)).toEqual(new Set([ids.owner, ids.ana, ids.bruno].map((id) => `private-maddox-u-${id}`)))
    })

    it("só o dono vê o link; gerar outro invalida o anterior", async () => {
        const campaign = await service.createCampaign({ name: "Link", rigor: "narrativo" }, ids.owner)
        const first = await tokenOf(campaign.id)
        await service.joinByInvite(first, ids.ana)
        await expect(service.getInviteLink(campaign.id, ids.ana)).rejects.toMatchObject({ status: 403 })
        await expect(service.rotateInvite(campaign.id, ids.ana)).rejects.toMatchObject({ status: 403 })

        const second = await service.rotateInvite(campaign.id, ids.owner)
        expect(second.token).not.toBe(first)
        await expect(service.joinByInvite(first, ids.bruno)).rejects.toMatchObject({ status: 404, code: "INVITE_NOT_FOUND" })
        await service.joinByInvite(second.token, ids.bruno)
        expect((await service.getCampaignDetail(campaign.id, ids.bruno)).members).toHaveLength(3)
        // O token não vaza no detalhe nem na lista.
        expect(JSON.stringify(await service.getCampaignDetail(campaign.id, ids.owner))).not.toContain(second.token)
        expect(JSON.stringify(await service.listMyCampaigns(ids.bruno))).not.toContain(second.token)
    })

    it("token malformado ou desconhecido responde 404", async () => {
        await expect(service.previewInvite("curto", ids.ana)).rejects.toMatchObject({ status: 404 })
        await expect(service.joinByInvite("x".repeat(43), ids.ana)).rejects.toMatchObject({ status: 404 })
    })

    it("entrada depois do início é aceita; campanha encerrada recusa (409)", async () => {
        const campaign = await service.createCampaign({ name: "Em andamento", rigor: "rigoroso" }, ids.owner)
        const token = await tokenOf(campaign.id)
        await MaddoxCampaignModel.updateOne({ _id: campaign.id }, { $set: { status: "active" } })
        await service.joinByInvite(token, ids.ana)
        expect((await service.getCampaignDetail(campaign.id, ids.ana)).status).toBe("active")

        await MaddoxCampaignModel.updateOne({ _id: campaign.id }, { $set: { status: "ended" } })
        await expect(service.joinByInvite(token, ids.bruno)).rejects.toMatchObject({ status: 409, code: "INVITE_CLOSED" })
        expect((await service.previewInvite(token, ids.bruno)).inviteOpen).toBe(false)
        expect((await service.getCampaignDetail(campaign.id, ids.owner)).inviteOpen).toBe(false)
    })

    it("quem saiu volta pelo link; quem foi removido recebe 403", async () => {
        const campaign = await service.createCampaign({ name: "Portas", rigor: "flexivel" }, ids.owner)
        const token = await tokenOf(campaign.id)
        await service.joinByInvite(token, ids.ana)
        await service.joinByInvite(token, ids.bruno)
        const detail = await service.getCampaignDetail(campaign.id, ids.owner)
        const ana = detail.members.find((member) => member.userId === ids.ana)!
        const bruno = detail.members.find((member) => member.userId === ids.bruno)!

        expect(await service.removeMember(campaign.id, ana.id, ids.ana)).toEqual({ left: true })
        await service.joinByInvite(token, ids.ana)
        expect((await service.getCampaignDetail(campaign.id, ids.ana)).members).toHaveLength(3)

        expect(await service.removeMember(campaign.id, bruno.id, ids.owner)).toEqual({ left: false })
        expect((publishToChannels.mock.calls.at(-1) as unknown as [string[]])[0]).toContain(`private-maddox-u-${ids.bruno}`)
        await expect(service.joinByInvite(token, ids.bruno)).rejects.toMatchObject({ status: 403, code: "MEMBER_REMOVED" })
        await expect(service.getCampaignDetail(campaign.id, ids.bruno)).rejects.toMatchObject({ status: 404 })
    })

    it("o dono não sai nem é removido; jogador não remove ninguém", async () => {
        const campaign = await service.createCampaign({ name: "Regras", rigor: "narrativo" }, ids.owner)
        const token = await tokenOf(campaign.id)
        await service.joinByInvite(token, ids.ana)
        await service.joinByInvite(token, ids.bruno)
        const detail = await service.getCampaignDetail(campaign.id, ids.owner)
        const owner = detail.members.find((member) => member.role === "owner")!
        const bruno = detail.members.find((member) => member.userId === ids.bruno)!
        await expect(service.removeMember(campaign.id, owner.id, ids.owner)).rejects.toMatchObject({ status: 409 })
        await expect(service.removeMember(campaign.id, owner.id, ids.ana)).rejects.toMatchObject({ status: 409 })
        await expect(service.removeMember(campaign.id, bruno.id, ids.ana)).rejects.toMatchObject({ status: 403 })
    })
})

describe("Campanhas Maddox — edição e personagem", () => {
    it("o rigor só muda no lobby; só o dono edita", async () => {
        const campaign = await service.createCampaign({ name: "Mutável", rigor: "narrativo" }, ids.owner)
        await service.joinByInvite(await tokenOf(campaign.id), ids.ana)
        await expect(service.updateCampaign(campaign.id, { name: "Hack" }, ids.ana)).rejects.toMatchObject({ status: 403 })
        expect(await service.updateCampaign(campaign.id, { rigor: "fiel-dnd", name: "Mudou" }, ids.owner)).toMatchObject({ rigor: "fiel-dnd", name: "Mudou" })
        await MaddoxCampaignModel.updateOne({ _id: campaign.id }, { $set: { status: "interview" } })
        await expect(service.updateCampaign(campaign.id, { rigor: "narrativo" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "RIGOR_LOCKED" })
        expect(await service.updateCampaign(campaign.id, { name: "Só o nome" }, ids.owner)).toMatchObject({ name: "Só o nome", rigor: "fiel-dnd" })
    })

    it("cada jogador cria e edita o próprio esboço, com a entrevista pendente", async () => {
        const campaign = await service.createCampaign({ name: "Heróis", rigor: "equilibrado" }, ids.owner)
        await service.joinByInvite(await tokenOf(campaign.id), ids.ana)

        const created = await service.upsertCharacterDraft(campaign.id, { name: "Lyra", portraitUrl: "/api/upload?key=lyra.png" }, ids.ana)
        expect(created.myCharacter).toMatchObject({ name: "Lyra", portraitUrl: "/api/upload?key=lyra.png", interviewStatus: "pending" })
        const updated = await service.upsertCharacterDraft(campaign.id, { name: "Lyra Ventobravo", portraitUrl: null }, ids.ana)
        expect(updated.myCharacter).toMatchObject({ id: created.myCharacter!.id, name: "Lyra Ventobravo", portraitUrl: null })
        expect(await MaddoxCharacterModel.countDocuments({ campaignId: campaign.id })).toBe(1)

        const ownerView = await service.getCampaignDetail(campaign.id, ids.owner)
        expect(ownerView.myCharacter).toBeNull()
        expect(ownerView.members.find((member) => member.userId === ids.ana)?.character?.name).toBe("Lyra Ventobravo")
        await expect(service.upsertCharacterDraft(campaign.id, { name: "Intruso" }, ids.stranger)).rejects.toMatchObject({ status: 404 })
    })
})
