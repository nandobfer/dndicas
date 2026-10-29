import type { ClientSession } from "mongoose"
import { canManageRole, canManageUser, evaluateRoleAssignment, getUngrantableKeys } from "@nandobfer/perfix"
import { DomainError } from "@/lib/api/route"
import { User } from "@/features/users/models/user"
import { catalog, normalizeRolePermissions } from "../catalog"
import { roleSchema, roleUpdateSchema, reorderSchema } from "../schemas"
import { AccessRole, RoleHierarchy, PerfixSettings } from "./models"
import { authorityTransaction, auditAccess, denied, conflict, roleRows, type AccessContext } from "./access"

const missing = () => new DomainError(404, "Registro não encontrado", "NOT_FOUND")
async function assertNotDefault(id: string, session: ClientSession) {
    if (await PerfixSettings.exists({ _id: "global", defaultRoleId: id }).session(session)) throw new DomainError(409, "Troque o perfil padrão antes de inativar ou excluir este perfil.")
}
export async function saveAssignment(context: AccessContext, id: string, roleIds: string[], version: number, status: "active" | "inactive", session: ClientSession) {
    const user = await User.findOne({ _id: id, deleted: { $ne: true } }).session(session)
    if (!user) throw missing()
    if (user.accessVersion !== version) throw conflict()
    const rows = await roleRows(session)
    const current = rows.filter(row => user.roles.includes(row.id))
    if (current.length !== user.roles.length || !canManageUser(context.roles, current)) throw denied("Usuário fora do alcance da sua hierarquia")
    const changed = roleIds.length !== user.roles.length || roleIds.some(id => !user.roles.includes(id))
    if ((id === context.userId || id === context.realUserId) && (changed || status !== "active")) throw denied("Você não pode alterar seus próprios perfis nem desativar sua conta")
    const result = evaluateRoleAssignment({ catalog, callerCargos: context.roles, requested: roleIds, current: user.roles, loaded: rows })
    if (result.status !== "ok") throw denied("Um ou mais perfis não podem ser atribuídos")
    const additions = roleIds.filter(id => !user.roles.includes(id))
    if (additions.some(id => !rows.some(row => row.id === id && row.ativo))) throw new DomainError(400, "Perfil inexistente ou inativo")
    const admin = rows.find(row => row.slug === "admin")
    if (admin && user.status === "active" && user.roles.includes(admin.id) && (status !== "active" || !roleIds.includes(admin.id))) {
        if (await User.countDocuments({ status: "active", deleted: { $ne: true }, roles: admin.id }).session(session) <= 1) throw new DomainError(409, "Não é permitido remover o último administrador ativo")
    }
    const before = { roleIds: [...user.roles], status: user.status }
    user.roles = result.cargos; user.status = status; user.accessVersion++
    await user.save({ session })
    await auditAccess(context, "user.access.update", id, before, { roleIds, status }, session)
    return user
}
export function updateAssignment(context: AccessContext, id: string, roleIds: string[], version: number, status: "active" | "inactive") {
    return authorityTransaction(context, ["users.edit"], (current, session) => saveAssignment(current, id, roleIds, version, status, session))
}
export async function createRole(context: AccessContext, raw: unknown) {
    const data = roleSchema.parse(raw)
    return authorityTransaction(context, ["roles.edit"], async (current, session) => {
        if (!canManageRole(current.roles, { permissoes: [] }) || getUngrantableKeys(current.effective, data.permissoes).length) throw denied()
        const slug = data.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        if (!slug || slug === "admin") throw new DomainError(400, "Nome de perfil reservado ou inválido")
        if (await AccessRole.exists({ slug }).session(session)) throw new DomainError(409, "Já existe um perfil com esse nome")
        const [role] = await AccessRole.create([{ ...data, slug, permissoes: normalizeRolePermissions(data.permissoes), createdBy: current.realUserId }], { session })
        await RoleHierarchy.updateOne({ _id: "global" }, { $push: { ordem: String(role!._id) }, $inc: { version: 1 } }, { session })
        await auditAccess(current, "role.create", String(role!._id), null, data, session)
        return { id: String(role!._id) }
    })
}
export async function updateRole(context: AccessContext, id: string, raw: unknown) {
    const { version, membros, ...data } = roleUpdateSchema.parse(raw)
    return authorityTransaction(context, ["roles.edit", ...(membros ? ["users.edit"] : [])], async (current, session) => {
        const role = await AccessRole.findById(id).session(session)
        if (!role) throw missing()
        if (role.version !== version) throw conflict()
        if (role.slug === "admin") {
            if (!current.effective.has("*") || Object.keys(data).some(key => !["nome", "descricao", "cor"].includes(key))) throw denied("Administrador permite alterar somente nome, descrição e cor")
        } else if (!canManageRole(current.roles, role) || getUngrantableKeys(current.effective, data.permissoes ?? []).length) throw denied()
        if (data.ativo === false) await assertNotDefault(id, session)
        const before = role.toObject()
        Object.assign(role, data, { version: version + 1, updatedBy: current.realUserId })
        if (data.permissoes) role.permissoes = normalizeRolePermissions(data.permissoes)
        await role.save({ session })
        if (membros) {
            const targets = await User.find({ deleted: { $ne: true }, $or: [{ roles: id }, { _id: { $in: membros } }] }).session(session)
            if (membros.some(member => !targets.some(target => String(target._id) === member))) throw new DomainError(400, "Usuário não encontrado")
            for (const target of targets) {
                const selected = membros.includes(String(target._id))
                if (selected === target.roles.includes(id)) continue
                if (selected && !role.ativo) throw new DomainError(409, "Perfil inativo não pode receber membros")
                await saveAssignment(current, String(target._id), selected ? [...target.roles, id] : target.roles.filter(value => value !== id), target.accessVersion, target.status, session)
            }
        }
        await auditAccess(current, "role.update", id, before, { ...data, membros }, session)
        return { id }
    })
}
export function deleteRole(context: AccessContext, id: string, version: number) {
    return authorityTransaction(context, ["roles.edit"], async (current, session) => {
        const role = await AccessRole.findById(id).session(session)
        if (!role) throw missing()
        if (role.version !== version) throw conflict()
        if (role.slug === "admin" || !canManageRole(current.roles, role)) throw denied()
        if (await User.exists({ roles: id }).session(session)) throw new DomainError(409, "Remova os membros antes de excluir o perfil")
        await assertNotDefault(id, session)
        await AccessRole.deleteOne({ _id: id }, { session })
        await RoleHierarchy.updateOne({ _id: "global" }, { $pull: { ordem: id }, $inc: { version: 1 } }, { session })
        await auditAccess(current, "role.delete", id, role.toObject(), null, session)
        return { id }
    })
}
export async function reorderRoles(context: AccessContext, raw: unknown) {
    const { ordem, version } = reorderSchema.parse(raw)
    return authorityTransaction(context, ["roles.edit"], async (current, session) => {
        if (!current.effective.has("*")) throw denied()
        const rows = await roleRows(session)
        const movable = rows.filter(row => row.slug !== "admin")
        if (ordem.length !== movable.length || ordem.some(id => !movable.some(row => row.id === id))) throw new DomainError(400, "Ordem de perfis inválida")
        const result = await RoleHierarchy.updateOne({ _id: "global", version }, { $set: { ordem: [...rows.filter(row => row.slug === "admin").map(row => row.id), ...ordem] }, $inc: { version: 1 } }, { session })
        if (!result.matchedCount) throw conflict()
        await auditAccess(current, "role.reorder", "global", rows.map(row => row.id), ordem, session)
        return { alterados: ordem.length }
    })
}
