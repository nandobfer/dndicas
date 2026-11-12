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
const { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxSceneImageModel } = await import("@/features/maddox/models")
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
    await Promise.all([MaddoxCampaignModel.init(), MaddoxCampaignMemberModel.init(), MaddoxCharacterModel.init(), MaddoxSceneImageModel.init()])
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(async () => {
    await Promise.all([User.deleteMany({}), MaddoxCampaignModel.deleteMany({}), MaddoxCampaignMemberModel.deleteMany({}), MaddoxCharacterModel.deleteMany({}), MaddoxSceneImageModel.deleteMany({})])
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
        await expect(service.createCampaign({ name: "Sem mestre", rigor: "rigoroso" }, ids.owner)).rejects.toMatchObject({ status: 409, code: "MADDOX_UNAVAILABLE", message: 'O "Agente Maddox" está desativado.' })
        expect(await MaddoxCampaignModel.countDocuments()).toBe(0)
        // DND-32: a disponibilidade é a do modelo do rigor escolhido.
        const { maddoxAvailability } = await import("@/features/maddox/server/settings")
        expect(maddoxAvailability).toHaveBeenLastCalledWith(expect.anything(), "rigoroso")
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

describe("Campanhas Maddox — última imagem na lista (DND-35)", () => {
    type Seed = { campaignId: string; minutesAgo: number; status?: string; source?: string; url?: string | null }
    let turnSeq = 0
    async function seedImages(images: Seed[]) {
        const now = Date.now()
        await mongoose.connection.collection("maddox_scene_images").insertMany(
            images.map((image) => ({
                campaignId: new mongoose.Types.ObjectId(image.campaignId),
                turnNumber: ++turnSeq,
                segment: 0,
                source: image.source ?? "tool",
                slot: image.source === "npc-portrait" ? "portrait" : "auto",
                status: image.status ?? "done",
                counts: true,
                url: image.url === undefined ? `https://cdn.example/${image.campaignId}-${image.minutesAgo}.png` : image.url,
                createdAt: new Date(now - image.minutesAgo * 60_000),
                updatedAt: new Date(now),
            })),
        )
    }
    const lastOf = async (campaignId: string) => (await service.listMyCampaigns(ids.owner)).find((item) => item.id === campaignId)?.lastSceneImageUrl

    it("campanha sem imagens fica sem imagem (o card mostra as espadas)", async () => {
        const campaign = await service.createCampaign({ name: "Vazia", rigor: "narrativo" }, ids.owner)
        expect(await lastOf(campaign.id)).toBeNull()
    })

    it("escolhe a imagem concluída mais recente da campanha", async () => {
        const campaign = await service.createCampaign({ name: "Brumas", rigor: "narrativo" }, ids.owner)
        await seedImages([
            { campaignId: campaign.id, minutesAgo: 30 },
            { campaignId: campaign.id, minutesAgo: 5, source: "manual" },
            { campaignId: campaign.id, minutesAgo: 60, source: "combat-end" },
        ])
        expect(await lastOf(campaign.id)).toBe(`https://cdn.example/${campaign.id}-5.png`)
    })

    it("imagem em geração, que falhou ou foi pulada não vira capa; retrato de NPC também não", async () => {
        const campaign = await service.createCampaign({ name: "Cinzas", rigor: "narrativo" }, ids.owner)
        await seedImages([
            { campaignId: campaign.id, minutesAgo: 40 },
            { campaignId: campaign.id, minutesAgo: 1, status: "pending", url: null },
            { campaignId: campaign.id, minutesAgo: 2, status: "generating", url: null },
            { campaignId: campaign.id, minutesAgo: 3, status: "failed", url: null },
            { campaignId: campaign.id, minutesAgo: 4, status: "skipped", url: null },
            { campaignId: campaign.id, minutesAgo: 5, source: "npc-portrait" },
            { campaignId: campaign.id, minutesAgo: 6, url: null },
        ])
        expect(await lastOf(campaign.id)).toBe(`https://cdn.example/${campaign.id}-40.png`)
    })

    it("campanha só com retratos de NPC fica sem imagem", async () => {
        const campaign = await service.createCampaign({ name: "Retratos", rigor: "narrativo" }, ids.owner)
        await seedImages([{ campaignId: campaign.id, minutesAgo: 1, source: "npc-portrait" }])
        expect(await lastOf(campaign.id)).toBeNull()
    })

    it("cada campanha recebe a própria imagem, numa única consulta para a lista inteira", async () => {
        const a = await service.createCampaign({ name: "A", rigor: "narrativo" }, ids.owner)
        const b = await service.createCampaign({ name: "B", rigor: "rigoroso" }, ids.owner)
        const c = await service.createCampaign({ name: "C", rigor: "fiel-dnd" }, ids.owner)
        await seedImages([
            { campaignId: a.id, minutesAgo: 10 },
            { campaignId: b.id, minutesAgo: 1 },
            { campaignId: b.id, minutesAgo: 20 },
        ])
        const aggregate = vi.spyOn(MaddoxSceneImageModel, "aggregate")
        const find = vi.spyOn(MaddoxSceneImageModel, "find")
        const findOne = vi.spyOn(MaddoxSceneImageModel, "findOne")
        const list = await service.listMyCampaigns(ids.owner)
        expect(aggregate).toHaveBeenCalledTimes(1)
        expect(find).not.toHaveBeenCalled()
        expect(findOne).not.toHaveBeenCalled()
        aggregate.mockRestore()
        find.mockRestore()
        findOne.mockRestore()
        const byId = new Map(list.map((item) => [item.id, item.lastSceneImageUrl]))
        expect(byId.get(a.id)).toBe(`https://cdn.example/${a.id}-10.png`)
        expect(byId.get(b.id)).toBe(`https://cdn.example/${b.id}-1.png`)
        expect(byId.get(c.id)).toBeNull()
    })

    it("imagem nova aparece na próxima carga da lista", async () => {
        const campaign = await service.createCampaign({ name: "Viva", rigor: "narrativo" }, ids.owner)
        await seedImages([{ campaignId: campaign.id, minutesAgo: 10 }])
        expect(await lastOf(campaign.id)).toBe(`https://cdn.example/${campaign.id}-10.png`)
        await seedImages([{ campaignId: campaign.id, minutesAgo: 0 }])
        expect(await lastOf(campaign.id)).toBe(`https://cdn.example/${campaign.id}-0.png`)
    })

    it("o detalhe da campanha não consulta as imagens nem leva o campo", async () => {
        const campaign = await service.createCampaign({ name: "Detalhe", rigor: "narrativo" }, ids.owner)
        await seedImages([{ campaignId: campaign.id, minutesAgo: 1 }])
        const aggregate = vi.spyOn(MaddoxSceneImageModel, "aggregate")
        const detail = await service.getCampaignDetail(campaign.id, ids.owner)
        expect(aggregate).not.toHaveBeenCalled()
        aggregate.mockRestore()
        expect(detail).not.toHaveProperty("lastSceneImageUrl")
    })

    it("falha na busca da imagem não derruba a lista", async () => {
        const campaign = await service.createCampaign({ name: "Resistente", rigor: "narrativo" }, ids.owner)
        await seedImages([{ campaignId: campaign.id, minutesAgo: 1 }])
        const aggregate = vi.spyOn(MaddoxSceneImageModel, "aggregate").mockImplementationOnce(() => {
            throw new Error("mongo fora")
        })
        const list = await service.listMyCampaigns(ids.owner)
        aggregate.mockRestore()
        expect(list.map((item) => item.name)).toEqual(["Resistente"])
        expect(list[0]!.lastSceneImageUrl).toBeNull()
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

    it("CD dos testes (Maddox 5): secreta por padrão, escolhida na criação e editável pelo dono mesmo em andamento (auditado)", async () => {
        expect(await service.createCampaign({ name: "Padrão", rigor: "fiel-dnd" }, ids.owner)).toMatchObject({ showCheckDc: false })
        const campaign = await service.createCampaign({ name: "Às claras", rigor: "rigoroso", showCheckDc: true }, ids.owner)
        expect(campaign.showCheckDc).toBe(true)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "CRIAR", depois: expect.objectContaining({ showCheckDc: true }) }))
        await service.joinByInvite(await tokenOf(campaign.id), ids.ana)
        await expect(service.updateCampaign(campaign.id, { showCheckDc: false }, ids.ana)).rejects.toMatchObject({ status: 403 })
        await MaddoxCampaignModel.updateOne({ _id: campaign.id }, { $set: { status: "active" } })
        recordAudit.mockClear()
        expect(await service.updateCampaign(campaign.id, { showCheckDc: false }, ids.owner)).toMatchObject({ showCheckDc: false })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "ATUALIZAR", antes: expect.objectContaining({ showCheckDc: true }), depois: { showCheckDc: false } }))
    })

    it("ações dos outros jogadores (DND-36): visíveis por padrão, escolhidas na criação, editáveis pelo dono mesmo em andamento (auditado)", async () => {
        expect(await service.createCampaign({ name: "Padrão", rigor: "narrativo" }, ids.owner)).toMatchObject({ hidePlayerActions: false })
        const campaign = await service.createCampaign({ name: "Às escuras", rigor: "narrativo", hidePlayerActions: true }, ids.owner)
        expect(campaign.hidePlayerActions).toBe(true)
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "CRIAR", depois: expect.objectContaining({ hidePlayerActions: true }) }))
        await service.joinByInvite(await tokenOf(campaign.id), ids.ana)
        await expect(service.updateCampaign(campaign.id, { hidePlayerActions: false }, ids.ana)).rejects.toMatchObject({ status: 403 })
        await MaddoxCampaignModel.updateOne({ _id: campaign.id }, { $set: { status: "active" } })
        recordAudit.mockClear()
        expect(await service.updateCampaign(campaign.id, { hidePlayerActions: false }, ids.owner)).toMatchObject({ hidePlayerActions: false })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "ATUALIZAR", antes: expect.objectContaining({ hidePlayerActions: true }), depois: { hidePlayerActions: false } }))
        expect((await service.getCampaignDetail(campaign.id, ids.owner)).hidePlayerActions).toBe(false)
        const { createMaddoxCampaignSchema, updateMaddoxCampaignSchema } = await import("@/features/maddox/campaign-schemas")
        expect(updateMaddoxCampaignSchema.safeParse({ hidePlayerActions: true }).success).toBe(true)
        expect(createMaddoxCampaignSchema.safeParse({ name: "Mesa", rigor: "narrativo", hidePlayerActions: "sim" }).error?.issues[0]?.message).toBe("Escolha se as ações dos outros jogadores ficam visíveis")
    })

    it("PV dos inimigos e dos aliados NPC (DND-53): faixa por padrão, escolhidos na criação, editáveis pelo dono mesmo em andamento (auditado)", async () => {
        expect(await service.createCampaign({ name: "Padrão", rigor: "fiel-dnd" }, ids.owner)).toMatchObject({ showEnemyHp: false, showAllyHp: false })
        const campaign = await service.createCampaign({ name: "Às claras", rigor: "rigoroso", showEnemyHp: true }, ids.owner)
        expect(campaign).toMatchObject({ showEnemyHp: true, showAllyHp: false })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "CRIAR", depois: expect.objectContaining({ showEnemyHp: true, showAllyHp: false }) }))
        await service.joinByInvite(await tokenOf(campaign.id), ids.ana)
        await expect(service.updateCampaign(campaign.id, { showAllyHp: true }, ids.ana)).rejects.toMatchObject({ status: 403 })
        await MaddoxCampaignModel.updateOne({ _id: campaign.id }, { $set: { status: "active" } })
        recordAudit.mockClear()
        expect(await service.updateCampaign(campaign.id, { showAllyHp: true }, ids.owner)).toMatchObject({ showEnemyHp: true, showAllyHp: true })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "ATUALIZAR", antes: expect.objectContaining({ showEnemyHp: true, showAllyHp: false }), depois: { showAllyHp: true } }))
        expect(await service.updateCampaign(campaign.id, { showEnemyHp: false }, ids.owner)).toMatchObject({ showEnemyHp: false, showAllyHp: true })
        expect((await service.getCampaignDetail(campaign.id, ids.ana)).showEnemyHp).toBe(false)
        const { createMaddoxCampaignSchema, updateMaddoxCampaignSchema } = await import("@/features/maddox/campaign-schemas")
        expect(updateMaddoxCampaignSchema.safeParse({ showEnemyHp: true }).success).toBe(true)
        expect(updateMaddoxCampaignSchema.safeParse({ showAllyHp: false }).success).toBe(true)
        expect(createMaddoxCampaignSchema.safeParse({ name: "Mesa", rigor: "fiel-dnd", showEnemyHp: "sim" }).error?.issues[0]?.message).toBe("Escolha como o PV dos inimigos aparece")
        expect(createMaddoxCampaignSchema.safeParse({ name: "Mesa", rigor: "fiel-dnd", showAllyHp: 1 }).error?.issues[0]?.message).toBe("Escolha como o PV dos aliados aparece")
    })

    it("densidade das narrações (DND-22): Equilibrada por padrão, escolhida na criação, editável pelo dono a qualquer momento (auditado)", async () => {
        expect(await service.createCampaign({ name: "Padrão", rigor: "fiel-dnd" }, ids.owner)).toMatchObject({ density: "equilibrada" })
        const campaign = await service.createCampaign({ name: "Curtinha", rigor: "narrativo", density: "concisa" }, ids.owner)
        expect(campaign.density).toBe("concisa")
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "CRIAR", depois: expect.objectContaining({ density: "concisa" }) }))
        await service.joinByInvite(await tokenOf(campaign.id), ids.ana)
        await expect(service.updateCampaign(campaign.id, { density: "extensa" }, ids.ana)).rejects.toMatchObject({ status: 403 })
        // Em andamento, com o rigor já travado, a densidade continua editável.
        await MaddoxCampaignModel.updateOne({ _id: campaign.id }, { $set: { status: "active", "scenarioInterview.status": "done" } })
        recordAudit.mockClear()
        expect(await service.updateCampaign(campaign.id, { density: "extensa" }, ids.owner)).toMatchObject({ density: "extensa", rigorLocked: true })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "ATUALIZAR", antes: expect.objectContaining({ density: "concisa" }), depois: { density: "extensa" } }))
        expect((await MaddoxCampaignModel.findById(campaign.id).lean())?.density).toBe("extensa")
    })

    it("densidade (DND-22): campanha antiga sem o campo é lida como Equilibrada; valor inválido é recusado pelo schema", async () => {
        const campaign = await service.createCampaign({ name: "Antiga", rigor: "equilibrado" }, ids.owner)
        await MaddoxCampaignModel.collection.updateOne({ _id: new mongoose.Types.ObjectId(campaign.id) }, { $unset: { density: "" } })
        expect((await service.getCampaignDetail(campaign.id, ids.owner)).density).toBe("equilibrada")
        const { createMaddoxCampaignSchema, updateMaddoxCampaignSchema } = await import("@/features/maddox/campaign-schemas")
        const invalid = createMaddoxCampaignSchema.safeParse({ name: "Mesa", rigor: "narrativo", density: "enorme" })
        expect(invalid.success).toBe(false)
        expect(invalid.error?.issues[0]?.message).toBe("Escolha uma densidade válida")
        expect(updateMaddoxCampaignSchema.safeParse({ density: "breve" }).success).toBe(true)
    })

    it("dificuldade dos combates (DND-42): 5 passos com raridades distintas, Equilibrado no meio e por padrão", async () => {
        const { MADDOX_COMBAT_DIFFICULTY_DEFAULT, MADDOX_COMBAT_DIFFICULTY_LEVEL_DEFS, MADDOX_COMBAT_DIFFICULTY_LEVELS } = await import("@/features/maddox/constants")
        expect(MADDOX_COMBAT_DIFFICULTY_LEVELS).toEqual(["muito-facil", "facil", "equilibrado", "dificil", "mortal"])
        expect(MADDOX_COMBAT_DIFFICULTY_DEFAULT).toBe("equilibrado")
        expect(MADDOX_COMBAT_DIFFICULTY_LEVELS[2]).toBe(MADDOX_COMBAT_DIFFICULTY_DEFAULT)
        expect(MADDOX_COMBAT_DIFFICULTY_LEVELS.map((level) => MADDOX_COMBAT_DIFFICULTY_LEVEL_DEFS[level].rarity)).toEqual(["common", "uncommon", "rare", "veryRare", "legendary"])
        for (const level of MADDOX_COMBAT_DIFFICULTY_LEVELS) {
            const def = MADDOX_COMBAT_DIFFICULTY_LEVEL_DEFS[level]
            expect(def.label && def.description && def.encounter).toBeTruthy()
            expect(def.rules.length).toBeGreaterThan(0)
            expect(def.free.length).toBeGreaterThan(0)
        }
        expect(MADDOX_COMBAT_DIFFICULTY_LEVEL_DEFS.facil.encounter).toContain("no máximo 3 goblins contra 4 personagens de nível 1")
        expect(MADDOX_COMBAT_DIFFICULTY_LEVEL_DEFS.facil.encounter).toContain("4 goblins bêbados ou sonolentos, com desvantagem nos ataques")
        expect(MADDOX_COMBAT_DIFFICULTY_LEVEL_DEFS.equilibrado.encounter).toContain("4 goblins contra 4 personagens de nível 1")
    })

    it("dificuldade dos combates (DND-42): Equilibrado por padrão, escolhida na criação, editável pelo dono a qualquer momento (auditado)", async () => {
        expect(await service.createCampaign({ name: "Padrão", rigor: "fiel-dnd" }, ids.owner)).toMatchObject({ combatDifficulty: "equilibrado" })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "CRIAR", depois: expect.objectContaining({ combatDifficulty: "equilibrado" }) }))
        const campaign = await service.createCampaign({ name: "Masmorra", rigor: "rigoroso", combatDifficulty: "mortal" }, ids.owner)
        expect(campaign.combatDifficulty).toBe("mortal")
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "CRIAR", depois: expect.objectContaining({ combatDifficulty: "mortal" }) }))
        await service.joinByInvite(await tokenOf(campaign.id), ids.ana)
        await expect(service.updateCampaign(campaign.id, { combatDifficulty: "facil" }, ids.ana)).rejects.toMatchObject({ status: 403 })
        // Em andamento, com o rigor já travado, a dificuldade continua editável (vale a partir do próximo combate).
        await MaddoxCampaignModel.updateOne({ _id: campaign.id }, { $set: { status: "active", "scenarioInterview.status": "done" } })
        recordAudit.mockClear()
        expect(await service.updateCampaign(campaign.id, { combatDifficulty: "facil" }, ids.owner)).toMatchObject({ combatDifficulty: "facil", rigorLocked: true })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "ATUALIZAR", antes: expect.objectContaining({ combatDifficulty: "mortal" }), depois: { combatDifficulty: "facil" } }))
        expect((await MaddoxCampaignModel.findById(campaign.id).lean())?.combatDifficulty).toBe("facil")
    })

    it("dificuldade dos combates (DND-42): aceita num grau não tático (não perde o valor), campanha antiga é lida como Equilibrado e valor inválido é recusado", async () => {
        const narrative = await service.createCampaign({ name: "Narrada", rigor: "narrativo", combatDifficulty: "dificil" }, ids.owner)
        expect(narrative.combatDifficulty).toBe("dificil")
        expect(await service.updateCampaign(narrative.id, { combatDifficulty: "muito-facil" }, ids.owner)).toMatchObject({ combatDifficulty: "muito-facil" })
        await MaddoxCampaignModel.collection.updateOne({ _id: new mongoose.Types.ObjectId(narrative.id) }, { $unset: { combatDifficulty: "" } })
        expect((await service.getCampaignDetail(narrative.id, ids.owner)).combatDifficulty).toBe("equilibrado")
        const { createMaddoxCampaignSchema, updateMaddoxCampaignSchema } = await import("@/features/maddox/campaign-schemas")
        expect(createMaddoxCampaignSchema.safeParse({ name: "Mesa", rigor: "rigoroso" }).success).toBe(true)
        const invalid = createMaddoxCampaignSchema.safeParse({ name: "Mesa", rigor: "rigoroso", combatDifficulty: "impossivel" })
        expect(invalid.success).toBe(false)
        expect(invalid.error?.issues[0]?.message).toBe("Escolha uma dificuldade de combate válida")
        expect(updateMaddoxCampaignSchema.safeParse({ combatDifficulty: "mortal" }).success).toBe(true)
        expect(updateMaddoxCampaignSchema.safeParse({}).error?.issues[0]?.message).toBe("Nada para alterar")
    })

    it("nível inicial (Maddox 5): só nos graus com ficha, o dono muda antes de começar (auditado), e o detalhe mostra nível e estágio", async () => {
        const campaign = await service.createCampaign({ name: "Mesa", rigor: "fiel-dnd" }, ids.owner)
        expect(campaign).toMatchObject({ startingLevel: null, startingStage: "" })
        await service.joinByInvite(await tokenOf(campaign.id), ids.ana)
        await expect(service.updateCampaign(campaign.id, { startingLevel: 3 }, ids.ana)).rejects.toMatchObject({ status: 403 })
        await MaddoxCampaignModel.updateOne({ _id: campaign.id }, { $set: { status: "interview" } })
        expect(await service.updateCampaign(campaign.id, { startingLevel: 3 }, ids.owner)).toMatchObject({ startingLevel: 3 })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "ATUALIZAR", antes: expect.objectContaining({ startingLevel: null }), depois: { startingLevel: 3 } }))
        await MaddoxCampaignModel.updateOne({ _id: campaign.id }, { $set: { status: "active" } })
        await expect(service.updateCampaign(campaign.id, { startingLevel: 5 }, ids.owner)).rejects.toMatchObject({ status: 409, code: "LEVEL_LOCKED", message: "O nível inicial só pode mudar antes de a campanha começar." })
        // O mesmo valor não é mudança: não bloqueia outras edições.
        expect(await service.updateCampaign(campaign.id, { startingLevel: 3, name: "Mesa 2" }, ids.owner)).toMatchObject({ name: "Mesa 2", startingLevel: 3 })

        const narrative = await service.createCampaign({ name: "Contos", rigor: "narrativo" }, ids.owner)
        await expect(service.updateCampaign(narrative.id, { startingLevel: 2 }, ids.owner)).rejects.toMatchObject({ status: 409, code: "LEVEL_DISABLED" })
        await MaddoxCampaignModel.updateOne({ _id: narrative.id }, { $set: { startingStage: "caçadores recém-iniciados" } })
        expect(await service.getCampaignDetail(narrative.id, ids.owner)).toMatchObject({ startingLevel: null, startingStage: "caçadores recém-iniciados" })
    })

    it("o esboço do personagem (criado ao começar a entrevista) nasce sem nome e é reaproveitado; o DTO traz a situação do retrato", async () => {
        const campaign = await service.createCampaign({ name: "Heróis", rigor: "equilibrado" }, ids.owner)
        await service.joinByInvite(await tokenOf(campaign.id), ids.ana)
        const member = (await MaddoxCampaignMemberModel.findOne({ campaignId: campaign.id, userId: ids.ana }).lean())!
        const campaignDoc = { _id: member.campaignId }

        const created = await service.ensureCharacterDraft(campaignDoc, member, ids.ana)
        expect(created).toMatchObject({ name: "", portraitUrl: null, interview: { status: "pending" } })
        const again = await service.ensureCharacterDraft(campaignDoc, { _id: member._id, characterId: created._id }, ids.ana)
        expect(String(again._id)).toBe(String(created._id))
        // Corrida: outra requisição já ligou um personagem (o membro lido estava sem); fica o vencedor.
        const stale = await service.ensureCharacterDraft(campaignDoc, { _id: member._id, characterId: null }, ids.ana)
        expect(String(stale._id)).toBe(String(created._id))
        expect(await MaddoxCharacterModel.countDocuments({ campaignId: campaign.id })).toBe(1)

        const mine = await service.getCampaignDetail(campaign.id, ids.ana)
        expect(mine.myCharacter).toMatchObject({ id: String(created._id), name: "", portraitUrl: null, portraitStatus: null, interviewStatus: "pending" })
        const ownerView = await service.getCampaignDetail(campaign.id, ids.owner)
        expect(ownerView.myCharacter).toBeNull()
        expect(ownerView.members.find((item) => item.userId === ids.ana)?.character?.name).toBe("")
    })
})
