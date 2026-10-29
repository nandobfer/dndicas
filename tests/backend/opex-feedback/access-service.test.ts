import { beforeEach, describe, expect, it, vi } from "vitest"
import { DomainError } from "@/lib/api/route"

const mocks = vi.hoisted(() => ({ local: vi.fn(), binding: vi.fn(), update: vi.fn(), audit: vi.fn(), users: vi.fn(), create: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), recordAudit: mocks.audit, AcaoAuditoria: { CRIAR: "CRIAR" } }))
vi.mock("@/features/users/models/user", () => ({ User: { findById: () => ({ select: () => ({ lean: mocks.local }) }) } }))
vi.mock("@/features/opex-feedback/api/opex-feedback-user.model", () => ({ OpexFeedbackUserModel: { findOne: () => ({ lean: mocks.binding }), updateOne: mocks.update } }))
vi.mock("@/features/opex-feedback/server/config", () => ({
    opexConnection: async () => ({ baseUrl: "https://opex.example", client: { users: mocks.users, createUser: mocks.create } }),
    opexAdminSession: async () => ({ cookie: "cookie", session: { clientId: "client", clientName: "DnDicas" } }),
}))
import { ensureOpexAccess } from "@/features/opex-feedback/server/access-service"
const actor = { id: "user", name: "Hero", role: "user" as const }
const user = { id: "opex-user", username: "hero", email: "hero@example.com", active: true, admin: false, isDefault: false, portalPath: "/cliente?t=usr_secret" }
beforeEach(() => { vi.clearAllMocks(); mocks.binding.mockResolvedValue(null); mocks.local.mockResolvedValue({ username: "hero", email: "hero@example.com" }); mocks.users.mockResolvedValue([]); mocks.create.mockResolvedValue(user) })
describe("ensureOpexAccess", () => {
    it("cria usuário comum e audita sem credenciais", async () => {
        const result = await ensureOpexAccess(actor)
        expect(result.access.created).toBe(true)
        expect(mocks.create).toHaveBeenCalledWith("cookie", { username: "hero", email: "hero@example.com", admin: false })
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("usr_secret")
        expect(JSON.stringify(mocks.update.mock.calls)).not.toContain("usr_secret")
    })
    it("reutiliza vínculo antes de email/username e não recria", async () => {
        mocks.binding.mockResolvedValue({ opexUserId: user.id, dndicasUserId: actor.id })
        mocks.users.mockResolvedValue([user])
        expect((await ensureOpexAccess(actor)).access.created).toBe(false)
        expect(mocks.create).not.toHaveBeenCalled()
    })
    it("reutiliza por email normalizado", async () => {
        mocks.users.mockResolvedValue([{ ...user, username: "outro", email: "HERO@example.com" }])
        expect((await ensureOpexAccess(actor)).access.user.username).toBe("outro")
        expect(mocks.create).not.toHaveBeenCalled()
    })
    it("reutiliza por username sem email", async () => {
        mocks.users.mockResolvedValue([{ ...user, email: null }])
        expect((await ensureOpexAccess(actor)).access.created).toBe(false)
    })
    it("não toma posse de acesso já vinculado", async () => {
        mocks.users.mockResolvedValue([user]); mocks.binding.mockResolvedValueOnce(null).mockResolvedValueOnce({ dndicasUserId: "other" })
        await expect(ensureOpexAccess(actor)).rejects.toMatchObject({ code: "OPEX_USER_CONFLICT" })
        expect(mocks.update).not.toHaveBeenCalled()
    })
    it("recusa acesso desativado", async () => {
        mocks.users.mockResolvedValue([{ ...user, active: false }])
        await expect(ensureOpexAccess(actor)).rejects.toMatchObject({ code: "OPEX_USER_CONFLICT" })
    })
    it("recria usuário removido no Opex", async () => {
        mocks.binding.mockResolvedValue({ opexUserId: "removed" })
        expect((await ensureOpexAccess(actor)).access.created).toBe(true)
    })
    it("resolve conflito global sem email e com sufixo", async () => {
        mocks.create.mockRejectedValueOnce(new DomainError(409, "conflito", "EMAIL_IN_USE")).mockResolvedValueOnce(user)
        await ensureOpexAccess(actor)
        expect(mocks.create.mock.calls[1][1]).toEqual({ username: expect.stringMatching(/^hero-/), admin: false })
    })
    it("limita tentativas e devolve erro acionável", async () => {
        mocks.create.mockRejectedValue(new DomainError(409, "conflito", "USERNAME_IN_USE"))
        await expect(ensureOpexAccess(actor)).rejects.toMatchObject({ code: "OPEX_USER_CONFLICT" })
        expect(mocks.create).toHaveBeenCalledTimes(3)
    })
    it("coalesce chamadas simultâneas do mesmo usuário", async () => {
        mocks.create.mockResolvedValue(user)
        await Promise.all([ensureOpexAccess(actor), ensureOpexAccess(actor)])
        expect(mocks.create).toHaveBeenCalledTimes(1)
    })
})
