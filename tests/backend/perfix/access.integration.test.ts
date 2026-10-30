import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"
import { encodeViewAs } from "@nandobfer/perfix"
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }))
import { migratePerfix } from "@/lib/db/migrations/migrate-perfix"
import { User } from "@/features/users/models/user"
import { AccessRole, RoleHierarchy, AccessAudit, PerfixSettings } from "@/features/perfix/server/models"
import { resolveAccess, roleRows, authorityTransaction } from "@/features/perfix/server/access"
import { getDefaultRoleId, updateSettings } from "@/features/perfix/server/settings"
import { createRole, updateRole, deleteRole, updateAssignment, reorderRoles } from "@/features/perfix/server/commands"
let repl: MongoMemoryReplSet
let adminId: string, userId: string, adminRole: string, userRole: string
beforeAll(async () => {
    repl = await MongoMemoryReplSet.create({ replSet: { count: 1, dbName: "perfix_test" } })
    await mongoose.connect(repl.getUri(), { dbName: "perfix_test" })
    await User.init()
}, 180_000)
afterAll(async () => { await mongoose.disconnect(); await repl?.stop() }, 30_000)
beforeEach(async () => {
    await Promise.all([User.deleteMany({}), AccessRole.deleteMany({}), RoleHierarchy.deleteMany({}), PerfixSettings.deleteMany({}), AccessAudit.deleteMany({})])
    const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
    adminId = String(ids[0]); userId = String(ids[1])
    await mongoose.connection.collection("users").insertMany([
        { _id: ids[0], username: "admin", name: "Admin", email: "admin@example.com", role: "admin", status: "active", deleted: false, createdAt: new Date(), updatedAt: new Date() },
        { _id: ids[1], username: "usuario", name: "Usuário", email: "user@example.com", role: "user", status: "active", deleted: false, createdAt: new Date(), updatedAt: new Date() },
    ])
    await migratePerfix()
    const rows = await roleRows(); adminRole = rows.find(role => role.slug === "admin")!.id; userRole = rows.find(role => role.slug === "user")!.id
})
describe("Migração e configurações", () => {
    it("migra os dois legados e pode ser repetida sem sobrescrever atribuições", async () => {
        expect((await User.findById(adminId))!.roles).toEqual([adminRole])
        expect((await User.findById(userId))!.roles).toEqual([userRole])
        expect(await mongoose.connection.collection("users").countDocuments({ role: { $exists: true } })).toBe(0)
        await User.updateOne({ _id: userId }, { roles: [] })
        await migratePerfix()
        expect(await AccessRole.countDocuments()).toBe(2)
        expect((await User.findById(userId))!.roles).toEqual([])
        expect(await getDefaultRoleId()).toBe(userRole)
    })
    it("repara legados que receberam roles vazio antes da migração sem apagar o role", async () => {
        const id = new mongoose.Types.ObjectId()
        await mongoose.connection.collection("users").insertOne({ _id: id, username: "legado", email: "legado@example.com", role: "admin", roles: [], status: "active", deleted: false, createdAt: new Date(), updatedAt: new Date() })
        await migratePerfix()
        const raw = await mongoose.connection.collection("users").findOne({ _id: id })
        expect(raw!.roles).toEqual([adminRole])
        expect(raw).not.toHaveProperty("role")
        expect([...(await resolveAccess(String(id))).effective]).toContain("*")
    })
    it("configura o padrão com versão e rejeita admin/inativo", async () => {
        const context = await resolveAccess(adminId)
        await expect(updateSettings(context, { defaultRoleId: adminRole, version: 0 })).rejects.toMatchObject({ status: 400 })
        await updateSettings(context, { defaultRoleId: null, version: 0 })
        await expect(getDefaultRoleId()).rejects.toMatchObject({ code: "SIGNUP_UNAVAILABLE" })
        await expect(updateSettings(context, { defaultRoleId: userRole, version: 0 })).rejects.toMatchObject({ status: 409 })
        await updateSettings(context, { defaultRoleId: userRole, version: 1 })
        await AccessRole.updateOne({ _id: userRole }, { ativo: false })
        await expect(getDefaultRoleId()).rejects.toMatchObject({ status: 503 })
    })
    it("não deixa definir como padrão um perfil que o chamador não poderia conceder", async () => {
        const gestor = await AccessRole.create({ slug: "gestor", nome: "Gestor", cor: "azul", permissoes: ["integrations.perfix.edit"], ativo: true })
        const poderoso = await AccessRole.create({ slug: "poderoso", nome: "Poderoso", cor: "verde", permissoes: ["users.edit", "roles.edit"], ativo: true })
        await reorderRoles(await resolveAccess(adminId), { ordem: [String(gestor._id), String(poderoso._id), userRole], version: 0 })
        await User.updateOne({ _id: userId }, { roles: [String(gestor._id)] })
        const context = await resolveAccess(userId)
        await expect(updateSettings(context, { defaultRoleId: String(poderoso._id), version: 0 })).rejects.toMatchObject({ status: 403 })
        expect(await getDefaultRoleId()).toBe(userRole)
        await expect(updateSettings(context, { defaultRoleId: userRole, version: 0 })).resolves.toMatchObject({ defaultRoleId: userRole, version: 1 })
    })
})
describe("Identidade efetiva e simulação", () => {
    it("impersona o alvo e audita o administrador real nas mutações", async () => {
        const marker = encodeViewAs({ tipo: "usuario", userId })
        const context = await resolveAccess(adminId, marker)
        expect(context.userId).toBe(userId); expect(context.realUserId).toBe(adminId)
        expect([...context.effective]).toEqual([])
        expect(context.dto.simulation).toMatchObject({ tipo: "usuario", alvoId: userId })
        await expect(createRole(context, { nome: "Fraude", descricao: "", cor: "azul", ativo: true, permissoes: [] })).rejects.toMatchObject({ status: 403 })
    })
    it("perfil simulado altera permissões sem trocar identidade", async () => {
        const context = await resolveAccess(adminId, encodeViewAs({ tipo: "cargo", roleId: userRole }))
        expect(context.userId).toBe(adminId); expect([...context.effective]).toEqual([])
    })
    it("rejeita usuários comuns, alvos inválidos e revogações", async () => {
        await expect(resolveAccess(userId, encodeViewAs({ tipo: "usuario", userId: adminId }))).rejects.toMatchObject({ code: "VIEW_AS_FORBIDDEN" })
        await User.updateOne({ _id: userId }, { status: "inactive" })
        await expect(resolveAccess(adminId, encodeViewAs({ tipo: "usuario", userId }))).rejects.toMatchObject({ code: "VIEW_AS_INVALID" })
        await User.updateOne({ _id: adminId }, { roles: [userRole] })
        await expect(resolveAccess(adminId, encodeViewAs({ tipo: "cargo", roleId: userRole }))).rejects.toMatchObject({ code: "VIEW_AS_FORBIDDEN" })
    })
})
describe("Comandos transacionais", () => {
    it("cria, edita e exclui com controle otimista e auditoria", async () => {
        const context = await resolveAccess(adminId)
        const { id } = await createRole(context, { nome: "Editor", descricao: "", cor: "azul", ativo: true, permissoes: ["users.edit"] })
        expect((await AccessRole.findById(id))!.permissoes).toContain("users.view")
        await updateRole(context, id, { nome: "Editores", version: 0 })
        await expect(updateRole(context, id, { nome: "Antigo", version: 0 })).rejects.toMatchObject({ status: 409 })
        await deleteRole(context, id, 1)
        expect(await AccessRole.findById(id)).toBeNull()
        expect(await AccessAudit.countDocuments({ targetId: id, actorId: adminId })).toBe(3)
    })
    it("protege admin, padrão e perfis em uso", async () => {
        const context = await resolveAccess(adminId)
        await expect(deleteRole(context, adminRole, 0)).rejects.toMatchObject({ status: 403 })
        await expect(updateRole(context, adminRole, { ativo: false, version: 0 })).rejects.toMatchObject({ status: 403 })
        await expect(updateRole(context, userRole, { ativo: false, version: 0 })).rejects.toMatchObject({ status: 409 })
        await expect(deleteRole(context, userRole, 0)).rejects.toMatchObject({ status: 409 })
    })
    it("exclui perfil cujos únicos membros foram excluídos (soft delete), mas não com membro ativo", async () => {
        const context = await resolveAccess(adminId)
        const { id } = await createRole(context, { nome: "Moderador", descricao: "", cor: "azul", ativo: true, permissoes: ["users.view"] })
        await User.updateOne({ _id: userId }, { roles: [id] })
        await expect(deleteRole(context, id, 0)).rejects.toMatchObject({ status: 409 })
        await User.updateOne({ _id: userId }, { deleted: true })
        await deleteRole(context, id, 0)
        expect(await AccessRole.findById(id)).toBeNull()
    })
    it("valida membros, autoalteração e exclusão do último administrador", async () => {
        const context = await resolveAccess(adminId)
        await expect(updateAssignment(context, adminId, [userRole], 0, "active")).rejects.toMatchObject({ status: 403 })
        await updateAssignment(context, userId, [userRole, adminRole], 0, "active")
        const other = await resolveAccess(userId)
        await updateAssignment(other, adminId, [userRole], 0, "active")
        expect((await User.findById(adminId))!.roles).toEqual([userRole])
        // Revalida autoridade dentro da transação, mesmo com contexto antigo privilegiado.
        await expect(updateAssignment(context, userId, [userRole], 1, "active")).rejects.toMatchObject({ status: 403 })
    })
    it("reordena com versão e recusa IDs inválidos", async () => {
        const context = await resolveAccess(adminId)
        await reorderRoles(context, { ordem: [userRole], version: 0 })
        await expect(reorderRoles(context, { ordem: [userRole], version: 0 })).rejects.toMatchObject({ status: 409 })
        await expect(reorderRoles(context, { ordem: [adminRole], version: 1 })).rejects.toMatchObject({ status: 400 })
    })
    it("serializa remoções concorrentes e preserva pelo menos um administrador", async () => {
        await User.updateOne({ _id: userId }, { roles: [adminRole] })
        const [a, b] = await Promise.all([resolveAccess(adminId), resolveAccess(userId)])
        const results = await Promise.allSettled([
            updateAssignment(a, userId, [userRole], 0, "active"),
            updateAssignment(b, adminId, [userRole], 0, "active"),
        ])
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
        expect(await User.countDocuments({ roles: adminRole, status: "active", deleted: false })).toBe(1)
    })
    it("bloqueia a remoção do último admin mesmo por outro perfil com coringa", async () => {
        const all = await AccessRole.create({ slug: "all", nome: "Supervisor", cor: "roxo", permissoes: ["*"], ativo: true })
        await User.updateOne({ _id: userId }, { roles: [String(all._id)] })
        await expect(updateAssignment(await resolveAccess(userId), adminId, [userRole], 0, "active")).rejects.toMatchObject({ status: 409 })
        expect((await User.findById(adminId))!.roles).toEqual([adminRole])
    })
    it("retém o ator real e o alvo efetivo na auditoria central de uma impersonação", async () => {
        const editor = await AccessRole.create({ slug: "editor", nome: "Editor", cor: "azul", permissoes: ["users.view", "users.edit"], ativo: true })
        await reorderRoles(await resolveAccess(adminId), { ordem: [String(editor._id), userRole], version: 0 })
        const target = await User.create({ username: "target", email: "target@example.com", roles: [userRole], status: "active" })
        await User.updateOne({ _id: userId }, { roles: [String(editor._id)] })
        const context = await resolveAccess(adminId, encodeViewAs({ tipo: "usuario", userId }))
        await updateAssignment(context, String(target._id), [], 0, "active")
        const audit = await AccessAudit.findOne({ targetId: String(target._id) })
        expect(audit).toMatchObject({ actorId: adminId, userId })
        const { default: CentralAudit } = await import("@/core/database/audit-log")
        expect(await CentralAudit.findOne({ documentId: String(target._id) })).toMatchObject({ userId, details: expect.objectContaining({ realActorId: adminId, effectiveUserId: userId }) })
    })
})
