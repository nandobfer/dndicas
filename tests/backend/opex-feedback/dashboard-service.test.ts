import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ access: vi.fn(), login: vi.fn(), select: vi.fn(), session: vi.fn(), request: vi.fn() }))
vi.mock("@/features/opex-feedback/server/access-service", () => ({ ensureOpexAccess: mocks.access }))
import { getOpexDashboard } from "@/features/opex-feedback/server/dashboard-service"
const actor = { id: "u", name: "Hero", role: "user" as const }
const range = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-29T00:00:00.000Z", timeZone: "America/Sao_Paulo" }
beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ token: "usr_secret", access: { clientId: "client", user: { id: "u" } }, connection: { client: { login: mocks.login, selectClient: mocks.select, session: mocks.session, request: mocks.request } } })
    mocks.login.mockResolvedValue("cookie"); mocks.select.mockResolvedValue("selected-cookie")
    mocks.session.mockResolvedValue({ clientId: "client", user: { id: "u" }, isAdmin: false })
    mocks.request.mockResolvedValue({ byColumn: [], byTag: [], byProject: [], timeline: [], finance: { totals: {} } })
})
describe("getOpexDashboard", () => {
    it("retorna quatro séries usando apenas sessão individual, nunca finance para não-admin", async () => {
        const result = await getOpexDashboard(actor, range)
        expect(result).toMatchObject({ byColumn: [], byTag: [], byProject: [], timeline: [], finance: null })
        expect(mocks.login).toHaveBeenCalledWith("usr_secret")
        expect(mocks.request).toHaveBeenCalledWith(expect.stringContaining("timeZone=America%2FSao_Paulo"), "selected-cookie", expect.anything())
    })
    it("preserva financeiro para admin do cliente", async () => {
        mocks.session.mockResolvedValue({ clientId: "client", user: { id: "u" }, isAdmin: true })
        expect((await getOpexDashboard(actor, range)).finance).not.toBeNull()
    })
    it.each([{ ...range, from: range.to, to: range.from }, { ...range, timeZone: "invalid" }, { ...range, from: "invalid" }])("recusa período/fuso inválido antes de chamar Opex", async (input) => {
        await expect(getOpexDashboard(actor, input)).rejects.toMatchObject({ status: 400, code: "INVALID_RANGE" })
        expect(mocks.access).not.toHaveBeenCalled()
    })
    it("recusa sessão de outro usuário ou cliente", async () => {
        mocks.session.mockResolvedValue({ clientId: "other", user: { id: "u" }, isAdmin: true })
        await expect(getOpexDashboard(actor, range)).rejects.toMatchObject({ code: "OPEX_UNAVAILABLE" })
        expect(mocks.request).not.toHaveBeenCalled()
    })
    it("falha de login individual não usa token administrativo como fallback", async () => {
        mocks.login.mockRejectedValue(new Error("failed"))
        await expect(getOpexDashboard(actor, range)).rejects.toThrow()
        expect(mocks.login).toHaveBeenCalledTimes(1)
        expect(mocks.request).not.toHaveBeenCalled()
    })
})
