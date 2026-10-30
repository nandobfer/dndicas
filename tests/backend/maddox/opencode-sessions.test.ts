import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"

type Row = { _id: Types.ObjectId; campaignId: Types.ObjectId; purpose: string; memberId: Types.ObjectId | null; sessionId: string; directory: string | null; status: string; lastError: string | null; lastUsedAt: Date | null; createdAt: Date; updatedAt: Date }
const rows: Row[] = []
let created = 0
const recordAudit = vi.fn(async () => undefined)
const policy = { sessionScope: "campaign-and-interviews", deleteOnCampaignEnd: true, directory: null as string | null }

const same = (a: unknown, b: unknown) => String(a ?? null) === String(b ?? null)
const matches = (row: Row, filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => same(row[key as keyof Row], value))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/ai/opencode", () => ({ getOpencodeConnection: vi.fn(async () => ({ baseUrl: "http://oc", headers: {}, directory: "/srv/default" })) }))
vi.mock("@/features/maddox/server/settings", () => ({ loadMaddoxSettings: vi.fn(async () => ({ settings: { opencode: policy } })) }))
vi.mock("@/features/maddox/models/maddox-campaign", () => ({ MaddoxCampaignModel: { find: () => ({ select: () => ({ lean: async () => [{ _id: CAMPAIGN, name: "A Torre" }] }) }) } }))
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
        get: vi.fn(async ({ sessionID }: { sessionID: string }) => ({ id: sessionID })),
        create: vi.fn(async () => ({ id: `ses_${++created}` })),
        remove: vi.fn<(input: { sessionID: string }, options?: unknown) => Promise<void>>(async () => undefined),
    },
}
const getOpencodeClient = vi.fn(async () => client)
vi.mock("@/lib/ai/opencode-client", () => ({ getOpencodeClient, isOpencodeSessionNotFound: vi.fn(async (error: unknown) => error instanceof Error && error.message === "not-found") }))

const CAMPAIGN = new Types.ObjectId()
const { deleteMaddoxSession, ensureMaddoxSession, listMaddoxSessions, processPendingMaddoxSessionDeletions, releaseCampaignSessions, releaseInterviewSession, sessionPurposeFor } = await import("@/features/maddox/server/opencode-sessions")

describe("sessões do OpenCode do Maddox", () => {
    beforeEach(() => {
        rows.length = 0
        recordAudit.mockClear()
        client.session.get.mockClear()
        client.session.create.mockClear()
        client.session.remove.mockReset().mockResolvedValue(undefined)
        getOpencodeClient.mockReset().mockResolvedValue(client)
        Object.assign(policy, { sessionScope: "campaign-and-interviews", deleteOnCampaignEnd: true, directory: null })
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

    it("com 'uma sessão por campanha', a entrevista de cenário usa a do narrador", async () => {
        policy.sessionScope = "campaign"
        expect(sessionPurposeFor(policy as never, "scenario-interview")).toBe("narrator")
        const narrator = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        const interview = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "scenario-interview", title: "x" })
        expect(interview).toBe(narrator)
    })

    it("entrevista de personagem tem sempre sessão própria por membro, mesmo com 'uma sessão por campanha'", async () => {
        policy.sessionScope = "campaign"
        expect(sessionPurposeFor(policy as never, "character-interview")).toBe("character-interview")
        const memberA = String(new Types.ObjectId())
        const memberB = String(new Types.ObjectId())
        const narrator = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        const a = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "character-interview", memberId: memberA, title: "x" })
        const b = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "character-interview", memberId: memberB, title: "x" })
        expect(new Set([narrator, a, b]).size).toBe(3)
        expect(await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "character-interview", memberId: memberA, title: "x" })).toBe(a)
        expect(rows.filter((row) => row.purpose === "character-interview").map((row) => String(row.memberId)).sort()).toEqual([memberA, memberB].sort())
    })

    it("o agente configurado chega ao session.create", async () => {
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x", agent: "maddox" })
        expect(client.session.create.mock.calls[0]).toEqual([expect.objectContaining({ agent: "maddox" })])
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

    it("releaseInterviewSession com 'uma sessão por campanha' não toca a sessão do narrador (cenário compartilhado)", async () => {
        policy.sessionScope = "campaign"
        const narrator = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "scenario-interview", title: "x" })
        await releaseInterviewSession(String(CAMPAIGN), "scenario-interview", null)
        expect(client.session.remove).not.toHaveBeenCalled()
        expect(rows.map((row) => row.sessionId)).toEqual([narrator])
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

    it("lista com o nome da campanha e 404 para id inválido", async () => {
        await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        expect(await listMaddoxSessions()).toEqual([expect.objectContaining({ campaignName: "A Torre", purpose: "narrator", status: "active" })])
        await expect(deleteMaddoxSession("nao-e-id", "admin-1")).rejects.toMatchObject({ status: 404 })
    })
})
