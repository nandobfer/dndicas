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
const user = { id: "opex-user", username: "dndicas-generated", email: null, active: true, admin: false, isDefault: false, portalPath: "/cliente?t=usr_secret" }
beforeEach(() => { vi.clearAllMocks(); mocks.binding.mockResolvedValue(null); mocks.local.mockResolvedValue({ username: "hero", email: "hero@example.com" }); mocks.users.mockResolvedValue([]); mocks.create.mockResolvedValue(user) })
describe("ensureOpexAccess", () => {
    it("cria usuário comum e audita sem credenciais", async () => {
        const result = await ensureOpexAccess(actor)
        expect(result.access.created).toBe(true)
        expect(mocks.create).toHaveBeenCalledWith("cookie", { username: expect.stringMatching(/^dndicas-[a-f0-9]{24}$/), admin: false })
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("usr_secret")
        expect(JSON.stringify(mocks.update.mock.calls)).not.toContain("usr_secret")
    })
    it("reutiliza somente o vínculo persistido mesmo após mudar email/username local", async () => {
        mocks.binding.mockResolvedValue({ opexUserId: user.id, dndicasUserId: actor.id })
        mocks.users.mockResolvedValue([user])
        expect((await ensureOpexAccess(actor)).access.created).toBe(false)
        expect(mocks.create).not.toHaveBeenCalled()
    })
    it("email autodeclarado não assume administrador Opex preexistente", async () => {
        const victim = { ...user, id: "victim", username: "admin", email: "HERO@example.com", admin: true, portalPath: "/cliente?t=usr_victim" }
        mocks.users.mockResolvedValue([victim])
        const result = await ensureOpexAccess(actor)
        expect(result.access).toMatchObject({ created: true, isAdmin: false, user: { id: user.id } })
        expect(result.access.portalUrl).not.toContain("usr_victim")
        expect(mocks.create).toHaveBeenCalledWith("cookie", { username: expect.stringMatching(/^dndicas-[a-f0-9]{24}$/), admin: false })
        expect(mocks.update).toHaveBeenCalledWith(expect.anything(), { $set: expect.objectContaining({ opexUserId: user.id }) }, { upsert: true })
    })
    it("username editável não assume conta Opex sem email", async () => {
        mocks.users.mockResolvedValue([{ ...user, id: "victim", username: "hero", portalPath: "/cliente?t=usr_victim" }])
        const result = await ensureOpexAccess(actor)
        expect(result.access.created).toBe(true)
        expect(result.access.user.id).toBe(user.id)
        expect(result.access.portalUrl).not.toContain("usr_victim")
        expect(mocks.create).toHaveBeenCalledTimes(1)
    })
    it("não toma posse de acesso já vinculado", async () => {
        mocks.users.mockResolvedValue([user]); mocks.binding.mockResolvedValueOnce({ opexUserId: user.id, dndicasUserId: actor.id }).mockResolvedValueOnce({ dndicasUserId: "other" })
        await expect(ensureOpexAccess(actor)).rejects.toMatchObject({ code: "OPEX_USER_CONFLICT" })
        expect(mocks.update).not.toHaveBeenCalled()
    })
    it("recusa acesso desativado", async () => {
        mocks.users.mockResolvedValue([{ ...user, active: false }])
        mocks.binding.mockResolvedValue({ opexUserId: user.id, dndicasUserId: actor.id })
        await expect(ensureOpexAccess(actor)).rejects.toMatchObject({ code: "OPEX_USER_CONFLICT" })
    })
    it("recria usuário removido no Opex", async () => {
        mocks.binding.mockResolvedValue({ opexUserId: "removed" })
        expect((await ensureOpexAccess(actor)).access.created).toBe(true)
    })
    it("colisão gera outro identificador exclusivo sem buscar token existente", async () => {
        mocks.create.mockRejectedValueOnce(new DomainError(409, "conflito", "USERNAME_IN_USE")).mockResolvedValueOnce(user)
        await ensureOpexAccess(actor)
        expect(mocks.create.mock.calls[1][1]).toEqual({ username: expect.stringMatching(/^dndicas-[a-f0-9]{24}$/), admin: false })
        expect(mocks.create.mock.calls[1][1].username).not.toBe(mocks.create.mock.calls[0][1].username)
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
