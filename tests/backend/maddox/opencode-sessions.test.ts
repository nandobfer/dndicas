import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"

type Row = { _id: Types.ObjectId; campaignId: Types.ObjectId; purpose: string; memberId: Types.ObjectId | null; sessionId: string; directory: string | null; status: string; lastError: string | null; lastUsedAt: Date | null; createdAt: Date; updatedAt: Date }
const rows: Row[] = []
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
            const now = new Date()
            rows.push({ _id: new Types.ObjectId(), memberId: null, directory: null, status: "active", lastError: null, lastUsedAt: null, createdAt: now, updatedAt: now, ...doc } as Row)
        },
        updateOne: async ({ _id }: { _id: Types.ObjectId }, update: { $set: Partial<Row> }) => {
            const row = rows.find((item) => String(item._id) === String(_id))
            if (row) Object.assign(row, update.$set)
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
        create: vi.fn(async () => ({ id: `ses_${rows.length + 1}` })),
        remove: vi.fn(async () => undefined),
    },
}
const getOpencodeClient = vi.fn(async () => client)
vi.mock("@/lib/ai/opencode-client", () => ({ getOpencodeClient, isOpencodeSessionNotFound: vi.fn(async (error: unknown) => error instanceof Error && error.message === "not-found") }))

const CAMPAIGN = new Types.ObjectId()
const { deleteMaddoxSession, ensureMaddoxSession, listMaddoxSessions, processPendingMaddoxSessionDeletions, releaseCampaignSessions, sessionPurposeFor } = await import("@/features/maddox/server/opencode-sessions")

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

    it("com 'uma sessão por campanha', as entrevistas usam a do narrador", async () => {
        policy.sessionScope = "campaign"
        expect(sessionPurposeFor(policy as never, "character-interview")).toBe("narrator")
        const narrator = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "narrator", title: "x" })
        const interview = await ensureMaddoxSession({ campaignId: String(CAMPAIGN), purpose: "scenario-interview", title: "x" })
        expect(interview).toBe(narrator)
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
