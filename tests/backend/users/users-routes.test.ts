import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeJsonRequest, makeRequest, readJson } from "../helpers/http"
import { DomainError } from "@/lib/api/route"
const mocks = vi.hoisted(() => ({ requireAccess: vi.fn(), roleRows: vi.fn(), find: vi.fn(), count: vi.fn(), findOne: vi.fn(), saveAssignment: vi.fn(), audit: vi.fn() }))
vi.mock("@/features/perfix/server/access", () => ({
    requireAccess: mocks.requireAccess, requirePermissions: vi.fn(), roleRows: mocks.roleRows, auditAccess: mocks.audit,
    authorityTransaction: async (access: unknown, _keys: string[], run: (a: unknown, s: object) => Promise<unknown>) => run(access, {}),
    denied: (message: string) => new DomainError(403, message),
}))
vi.mock("@/features/perfix/server/commands", () => ({ saveAssignment: mocks.saveAssignment }))
vi.mock("@/features/users/models/user", () => ({ User: { find: mocks.find, countDocuments: mocks.count, findOne: mocks.findOne } }))
import { GET, POST } from "@/app/api/users/route"
import { PUT, DELETE } from "@/app/api/users/[id]/route"
const id = "a".repeat(24), roleId = "b".repeat(24)
beforeEach(() => {
    mocks.requireAccess.mockReset().mockResolvedValue({ userId: id, realUserId: id, roles: [], effective: new Set(["*"]) })
    mocks.roleRows.mockResolvedValue([{ id: roleId, slug: "user", nome: "Usuário", descricao: "", cor: "azul", permissoes: [], ativo: true, posicao: 1, version: 0 }])
    mocks.audit.mockReset()
})
describe("APIs de usuários com perfis Perfix", () => {
    it("valida paginação antes de consultar usuários", async () => {
        const response = await GET(makeRequest("http://localhost/api/users?page=0"))
        expect(response.status).toBe(400)
    })
    it("lista perfis sem expor role legado ou senha", async () => {
        const user = { _id: id, username: "hero", name: "Hero", email: "hero@example.com", roles: [roleId], status: "active", deleted: false, accessVersion: 2, createdAt: new Date(), updatedAt: new Date() }
        mocks.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: async () => [user] }) }) })
        mocks.count.mockResolvedValue(1)
        const response = await GET(makeRequest(`http://localhost/api/users?roleId=${roleId}`))
        const body = await readJson<{ data: { items: Record<string, unknown>[]; total: number } }>(response)
        expect(response.status).toBe(200)
        expect(body.data.items[0]).toMatchObject({ roleIds: [roleId], version: 2, roles: [expect.objectContaining({ id: roleId })] })
        expect(body.data.items[0]).not.toHaveProperty("role")
        expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ roles: roleId }))
    })
    it("retorna 403 sem users.create", async () => {
        mocks.requireAccess.mockRejectedValue(new DomainError(403, "Acesso negado"))
        expect((await POST(makeJsonRequest("http://localhost/api/users", { method: "POST", body: "{}" }))).status).toBe(403)
    })
    it("bloqueia alterações de perfis do próprio usuário", async () => {
        const user = { _id: id, roles: [roleId], accessVersion: 0, createdAt: new Date(), updatedAt: new Date() }
        mocks.findOne.mockReturnValue({ session: async () => user })
        mocks.saveAssignment.mockRejectedValue(new DomainError(403, "Você não pode alterar seus próprios perfis"))
        const response = await PUT(makeJsonRequest(`http://localhost/api/users/${id}`, { method: "PUT", body: JSON.stringify({ roleIds: [], version: 0 }) }), { params: Promise.resolve({ id }) })
        expect(response.status).toBe(403)
    })
    it("atualiza perfis transacionalmente e registra auditoria", async () => {
        const user = { _id: id, roles: [], status: "active", accessVersion: 0, save: vi.fn(), createdAt: new Date(), updatedAt: new Date() }
        mocks.findOne.mockReturnValue({ session: async () => user })
        mocks.saveAssignment.mockResolvedValue({ ...user, roles: [roleId], accessVersion: 1 })
        const response = await PUT(makeJsonRequest(`http://localhost/api/users/${id}`, { method: "PUT", body: JSON.stringify({ roleIds: [roleId], version: 0 }) }), { params: Promise.resolve({ id }) })
        expect(response.status).toBe(200)
        expect(mocks.saveAssignment).toHaveBeenCalledWith(expect.anything(), id, [roleId], 0, "active", expect.anything())
        expect(mocks.audit).toHaveBeenCalled()
    })
    it("bloqueia autoexclusão e exige a versão", async () => {
        mocks.findOne.mockReturnValue({ session: async () => ({ _id: id, roles: [roleId] }) })
        mocks.saveAssignment.mockRejectedValue(new DomainError(403, "Você não pode desativar sua própria conta"))
        const response = await DELETE(makeJsonRequest(`http://localhost/api/users/${id}`, { method: "DELETE", body: JSON.stringify({ version: 0 }) }), { params: Promise.resolve({ id }) })
        expect(response.status).toBe(403)
        expect((await DELETE(makeJsonRequest(`http://localhost/api/users/${id}`, { method: "DELETE", body: "{}" }), { params: Promise.resolve({ id }) })).status).toBe(400)
    })
})
