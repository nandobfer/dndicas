import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"

type Row = { _id: Types.ObjectId; campaignId: Types.ObjectId; purpose: string; memberId: Types.ObjectId | null; sessionId: string; directory: string | null; status: string; lastError: string | null; lastUsedAt: Date | null; createdAt: Date; updatedAt: Date }
const rows: Row[] = []
let created = 0
const recordAudit = vi.fn(async () => undefined)
const policy = { deleteOnCampaignEnd: true, directory: null as string | null }
const campaigns: Array<{ _id: Types.ObjectId; name: string; status: string }> = []

const same = (a: unknown, b: unknown) => String(a ?? null) === String(b ?? null)
const matches = (row: Row, filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => same(row[key as keyof Row], value))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/ai/opencode", () => ({ getOpencodeConnection: vi.fn(async () => ({ baseUrl: "http://oc", headers: {}, directory: "/srv/default" })) }))
vi.mock("@/features/maddox/server/settings", () => ({ loadMaddoxSettings: vi.fn(async () => ({ settings: { opencode: policy } })) }))
vi.mock("@/features/maddox/models/maddox-campaign", () => ({ MaddoxCampaignModel: { find: () => ({ select: () => ({ lean: async () => campaigns }) }) } }))
vi.mock("@/features/maddox/models/maddox-opencode-session", () => ({
    MaddoxOpencodeSessionModel: {
        findOne: (filter: Record<string, unknown>) => ({ lean: async () => rows.find((row) => matches(row, filter)) ?? null }),
        findById: (id: string) => ({ lean: async () => rows.find((row) => String(row._id) === id) ?? null }),
        find: (filter: Record<string, unknown> = {}) => {
            const result = () => rows.filter((row) => matches(row, filter))
            const chain = { sort: () => chain, limit: () => chain, lean: async () => result() }
            return chain
        },
        create: async (doc: Partial<Row>) => {
            if (rows.some((row) => row.status === "active" && same(row.campaignId, doc.campaignId) && row.purpose === doc.purpose && same(row.memberId, doc.memberId))) throw Object.assign(new Error("E11000"), { code: 11000 })
            const now = new Date()
            rows.push({ _id: new Types.ObjectId(), memberId: null, directory: null, status: "active", lastError: null, lastUsedAt: null, createdAt: now, updatedAt: now, ...doc } as Row)
        },
        updateOne: async (filter: Record<string, unknown>, update: { $set: Partial<Row> }) => {
            const row = rows.find((item) => matches(item, filter))
            if (row) Object.assign(row, update.$set)
            return { modifiedCount: row ? 1 : 0 }
        },
        deleteOne: async ({ _id }: { _id: Types.ObjectId }) => {
            const index = rows.findIndex((item) => String(item._id) === String(_id))
            if (index >= 0) rows.splice(index, 1)
        },
    },
}))

const client = {
    session: {
        get: vi.fn(async ({ sessionID }: { sessionID: string }): Promise<{ id: string; model?: { providerID: string; id: string; variant?: string }; agent?: string }> => ({ id: sessionID })),
        create: vi.fn(async (_input: Record<string, unknown>) => ({ id: `ses_${++created}` })),
        switchModel: vi.fn(async (_input: { sessionID: string; model: { providerID: string; id: string; variant?: string } }) => undefined),
        switchAgent: vi.fn(async (_input: { sessionID: string; agent: string }) => undefined),
        remove: vi.fn<(input: { sessionID: string }, options?: unknown) => Promise<void>>(async () => undefined),
    },
}
const getOpencodeClient = vi.fn(async () => client)
vi.mock("@/lib/ai/opencode-client", () => ({ getOpencodeClient, isOpencodeSessionNotFound: vi.fn(async (error: unknown) => error instanceof Error && error.message === "not-found") }))

const CAMPAIGN = new Types.ObjectId()
const { deleteMaddoxSession, ensureMaddoxSession, listMaddoxSessions, processPendingMaddoxSessionDeletions, opencodeModelRef, releaseCampaignSessions, releaseInterviewSession } = await import("@/features/maddox/server/opencode-sessions")

describe("sessões do OpenCode do Maddox", () => {
    beforeEach(() => {
        rows.length = 0
        recordAudit.mockClear()
        client.session.get.mockReset().mockImplementation(async ({ sessionID }) => ({ id: sessionID }))
        client.session.create.mockClear()
        client.session.switchModel.mockReset().mockResolvedValue(undefined)
        client.session.switchAgent.mockReset().mockResolvedValue(undefined)
        client.session.remove.mockReset().mockResolvedValue(undefined)
        getOpencodeClient.mockReset().mockResolvedValue(client)
        Object.assign(policy, { deleteOnCampaignEnd: true, directory: null })
        campaigns.length = 0
        campaigns.push({ _id: CAMPAIGN, name: "A Torre", status: "active" })
    })

    it("cria uma sessão no diretório da integração e a reaproveita enquanto existir", async () => {
        const first = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "A Torre" })
        const second = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "A Torre" })
        expect(second).toBe(first)
        expect(client.session.create).toHaveBeenCalledTimes(1)
        expect(client.session.create.mock.calls[0]).toEqual([expect.objectContaining({ location: { directory: "/srv/default" } })])
        expect(rows[0]).toMatchObject({ purpose: "narrator", status: "active", directory: "/srv/default" })
    })

    it("recria a sessão que sumiu do OpenCode", async () => {
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "A Torre" })
        client.session.get.mockRejectedValueOnce(new Error("not-found"))
        const next = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "A Torre" })
        expect(client.session.create).toHaveBeenCalledTimes(2)
        expect(rows).toHaveLength(1)
        expect(rows[0]!.sessionId).toBe(next)
    })

    it("falha transitória do OpenCode não apaga o registro nem cria outra sessão (502)", async () => {
        const first = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "A Torre" })
        client.session.get.mockRejectedValueOnce(new Error("timeout"))
        await expect(ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "A Torre" })).rejects.toMatchObject({ status: 502, code: "OPENCODE_SESSION_UNAVAILABLE" })
        expect(client.session.create).toHaveBeenCalledTimes(1)
        expect(rows).toEqual([expect.objectContaining({ sessionId: first, status: "active" })])
    })

    it("se a criação da nova sessão falha, o registro antigo continua", async () => {
        const first = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "A Torre" })
        client.session.get.mockRejectedValueOnce(new Error("not-found"))
        client.session.create.mockRejectedValueOnce(new Error("ECONNRESET"))
        await expect(ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "A Torre" })).rejects.toThrow("ECONNRESET")
        expect(rows).toEqual([expect.objectContaining({ sessionId: first })])
    })

    it("chamadas concorrentes não deixam duas sessões ativas: a perdedora é excluída", async () => {
        const [a, b] = await Promise.all([
            ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" }),
            ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" }),
        ])
        expect(a).toBe(b)
        expect(rows.filter((row) => row.status === "active")).toHaveLength(1)
        expect(client.session.create).toHaveBeenCalledTimes(2)
        expect(client.session.remove).toHaveBeenCalledTimes(1)
        expect(client.session.remove.mock.calls[0]![0]).not.toEqual({ sessionID: a })
    })

    it("sessões nunca compartilhadas: narrador, cenário e cada membro têm a sua", async () => {
        const memberA = String(new Types.ObjectId())
        const memberB = String(new Types.ObjectId())
        const narrator = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        const scenario = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "scenario-interview", title: "x" })
        const a = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "character-interview", memberId: memberA, title: "x" })
        const b = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "character-interview", memberId: memberB, title: "x" })
        expect(new Set([narrator, scenario, a, b]).size).toBe(4)
        expect(await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "character-interview", memberId: memberA, title: "x" })).toBe(a)
        expect(await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })).toBe(narrator)
        expect(rows.filter((row) => row.purpose === "character-interview").map((row) => String(row.memberId)).sort()).toEqual([memberA, memberB].sort())
    })

    it("o agente, o modelo e a variante configurados chegam ao session.create", async () => {
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x", agent: "maddox", model: "opencode-go/deepseek-v4.1-flash", variant: "high" })
        expect(client.session.create.mock.calls[0]).toEqual([expect.objectContaining({ agent: "maddox", model: { providerID: "opencode-go", id: "deepseek-v4.1-flash", variant: "high" } })])
    })

    it("modelo sem provedor: a sessão é criada sem model (padrão do servidor)", async () => {
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x", model: "deepseek" })
        expect(client.session.create.mock.calls[0]![0]).not.toHaveProperty("model")
    })

    it("sessão reaproveitada sem modelo (ou com outro) é trocada para o configurado; igual não troca", async () => {
        const id = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "scenario-interview", title: "x" })
        client.session.get.mockResolvedValueOnce({ id })
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "scenario-interview", title: "x", model: "opencode-go/deepseek-v4.1-flash" })
        expect(client.session.switchModel).toHaveBeenCalledWith({ sessionID: id, model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" } })

        client.session.switchModel.mockClear()
        client.session.get.mockResolvedValueOnce({ id, model: { providerID: "opencode-go", id: "hy4" } })
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "scenario-interview", title: "x", model: "opencode-go/deepseek-v4.1-flash" })
        expect(client.session.switchModel).toHaveBeenCalledTimes(1)

        client.session.switchModel.mockClear()
        client.session.get.mockResolvedValueOnce({ id, model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" } })
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "scenario-interview", title: "x", model: "opencode-go/deepseek-v4.1-flash" })
        expect(client.session.switchModel).not.toHaveBeenCalled()
        expect(client.session.create).toHaveBeenCalledTimes(1)
    })

    it("agente diferente na sessão reaproveitada é trocado; agente vazio na configuração não troca", async () => {
        const id = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        client.session.get.mockResolvedValueOnce({ id, agent: "build" })
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x", agent: "maddox" })
        expect(client.session.switchAgent).toHaveBeenCalledWith({ sessionID: id, agent: "maddox" })
        client.session.switchAgent.mockClear()
        client.session.get.mockResolvedValueOnce({ id, agent: "build" })
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x", agent: null })
        expect(client.session.switchAgent).not.toHaveBeenCalled()
    })

    it("falha ao trocar o modelo vira 502 com o modelo na mensagem e mantém o registro", async () => {
        const id = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        client.session.switchModel.mockRejectedValueOnce(new Error("timeout"))
        await expect(ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x", model: "opencode-go/deepseek-v4.1-flash" })).rejects.toMatchObject({
            status: 502,
            code: "OPENCODE_SESSION_UNAVAILABLE",
            message: expect.stringContaining("opencode-go/deepseek-v4.1-flash"),
        })
        expect(client.session.create).toHaveBeenCalledTimes(1)
        expect(rows).toEqual([expect.objectContaining({ sessionId: id, status: "active" })])
    })

    it("opencodeModelRef divide na primeira barra e recusa id sem provedor", () => {
        expect(opencodeModelRef("opencode-go/deepseek-v4.1-flash")).toEqual({ providerID: "opencode-go", id: "deepseek-v4.1-flash" })
        expect(opencodeModelRef("openrouter/qwen/qwen3", "max")).toEqual({ providerID: "openrouter", id: "qwen/qwen3", variant: "max" })
        expect(opencodeModelRef("deepseek")).toBeNull()
        expect(opencodeModelRef("/x")).toBeNull()
        expect(opencodeModelRef("x/")).toBeNull()
        expect(opencodeModelRef(null)).toBeNull()
    })

    it("releaseInterviewSession libera só a sessão daquela entrevista/membro", async () => {
        const memberA = String(new Types.ObjectId())
        const memberB = String(new Types.ObjectId())
        const narrator = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        const scenario = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "scenario-interview", title: "x" })
        const a = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "character-interview", memberId: memberA, title: "x" })
        const b = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "character-interview", memberId: memberB, title: "x" })

        await releaseInterviewSession(String(CAMPAIGN), "character-interview", memberA)
        expect(client.session.remove.mock.calls.map(([input]) => input.sessionID)).toEqual([a])
        expect(rows.map((row) => row.sessionId).sort()).toEqual([narrator, scenario, b].sort())

        await releaseInterviewSession(String(CAMPAIGN), "scenario-interview", null)
        expect(client.session.remove.mock.calls.map(([input]) => input.sessionID)).toEqual([a, scenario])
        expect(rows.map((row) => row.sessionId).sort()).toEqual([narrator, b].sort())
    })

    it("releaseInterviewSession nunca lança: falha no OpenCode fica registrada e a sessão segue pendente", async () => {
        const member = String(new Types.ObjectId())
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "character-interview", memberId: member, title: "x" })
        client.session.remove.mockRejectedValueOnce(new Error("ECONNREFUSED"))
        await expect(releaseInterviewSession(String(CAMPAIGN), "character-interview", member)).resolves.toBeUndefined()
        expect(rows[0]).toMatchObject({ status: "pending-deletion", lastError: expect.stringContaining("ECONNREFUSED") })
    })

    it("exclusão com falha fica pendente e a rotina conclui depois", async () => {
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        client.session.remove.mockRejectedValueOnce(new Error("ECONNREFUSED"))
        const result = await deleteMaddoxSession(String(rows[0]!._id), "admin-1")
        expect(result).toEqual({ deleted: false })
        expect(rows[0]).toMatchObject({ status: "pending-deletion", lastError: "ECONNREFUSED" })
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: "EXCLUIR" }))
        expect(await processPendingMaddoxSessionDeletions()).toBe("1 sessão(ões) excluída(s)")
        expect(rows).toHaveLength(0)
    })

    it("sessão que já não existe no OpenCode conta como excluída", async () => {
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        client.session.remove.mockRejectedValueOnce(new Error("not-found"))
        expect(await deleteMaddoxSession(String(rows[0]!._id), "admin-1")).toEqual({ deleted: true })
        expect(rows).toHaveLength(0)
    })

    it("OpenCode indisponível mantém as pendências", async () => {
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        rows[0]!.status = "pending-deletion"
        getOpencodeClient.mockRejectedValueOnce(new Error("sem URL"))
        expect(await processPendingMaddoxSessionDeletions()).toMatch(/OpenCode indisponível/)
        expect(rows).toHaveLength(1)
    })

    it("encerrar a campanha libera as sessões só se a política mandar", async () => {
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        policy.deleteOnCampaignEnd = false
        expect(await releaseCampaignSessions(String(CAMPAIGN))).toBe(0)
        expect(rows).toHaveLength(1)
        policy.deleteOnCampaignEnd = true
        expect(await releaseCampaignSessions(String(CAMPAIGN))).toBe(1)
        expect(rows).toHaveLength(0)
    })

    it("a rotina põe na fila e exclui as sessões de campanhas terminadas, arquivadas ou excluídas", async () => {
        const ended = new Types.ObjectId()
        const archived = new Types.ObjectId()
        const gone = new Types.ObjectId()
        campaigns.push({ _id: ended, name: "Fim", status: "ended" }, { _id: archived, name: "Arquivo", status: "archived" })
        const keep = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        for (const id of [ended, archived, gone]) await ensureMaddoxSession({ campaignId: String(id), purpose: "narrator", title: "x" })
        expect(await processPendingMaddoxSessionDeletions()).toBe("3 sessão(ões) de campanhas encerradas na fila · 3 sessão(ões) excluída(s)")
        expect(rows.map((row) => row.sessionId)).toEqual([keep])
    })

    it("a rotina não toca as sessões de campanhas encerradas com a política desligada", async () => {
        campaigns.push({ _id: new Types.ObjectId(), name: "Fim", status: "ended" })
        await ensureMaddoxSession({ campaignId: String(campaigns[1]!._id), purpose: "narrator", title: "x" })
        await ensureMaddoxSession({ campaignId: String(new Types.ObjectId()), purpose: "narrator", title: "x" })
        policy.deleteOnCampaignEnd = false
        expect(await processPendingMaddoxSessionDeletions()).toBe("Nenhuma sessão pendente")
        expect(rows.filter((row) => row.status === "active")).toHaveLength(2)
        expect(client.session.remove).not.toHaveBeenCalled()
    })

    it("lista com o nome da campanha e 404 para id inválido", async () => {
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        expect(await listMaddoxSessions()).toEqual([expect.objectContaining({ campaignName: "A Torre", purpose: "narrator", status: "active" })])
        await expect(deleteMaddoxSession("nao-e-id", "admin-1")).rejects.toMatchObject({ status: 404 })
    })
})
