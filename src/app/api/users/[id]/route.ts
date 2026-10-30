import { User } from "@/features/users/models/user"
import { updateUserSchema } from "@/features/users/api/validation"
import { serializeUser } from "@/features/users/api/serialize"
import { protectedRoute } from "@/features/perfix/server/route"
import { authorityTransaction, auditAccess, roleRows } from "@/features/perfix/server/access"
import { saveAssignment } from "@/features/perfix/server/commands"
import { objectId, versionSchema } from "@/features/perfix/schemas"
import { DomainError } from "@/lib/api/route"
export const GET = protectedRoute<{ id: string }>(["users.view"], async (_req, { id }) => {
    const user = await User.findOne({ _id: objectId.parse(id), deleted: { $ne: true } })
    if (!user) throw new DomainError(404, "Usuário não encontrado")
    return serializeUser(user, await roleRows())
})
export const PUT = protectedRoute<{ id: string }>(["users.edit"], async (req, { id }, access) => {
    objectId.parse(id)
    const { version, roleIds, status, ...data } = updateUserSchema.parse(await req.json())
    return authorityTransaction(access, ["users.edit"], async (current, session) => {
        const existing = await User.findOne({ _id: id, deleted: { $ne: true } }).session(session)
        if (!existing) throw new DomainError(404, "Usuário não encontrado")
        const before = serializeUser(existing, await roleRows(session))
        const user = await saveAssignment(current, id, roleIds ?? existing.roles, version, status ?? existing.status, session)
        Object.assign(user, data)
        await user.save({ session })
        const after = serializeUser(user, await roleRows(session))
        await auditAccess(current, "user.update", id, before, after, session)
        return after
    })
})
export const DELETE = protectedRoute<{ id: string }>(["users.delete"], async (req, { id }, access) => {
    objectId.parse(id)
    const { version } = versionSchema.parse(await req.json())
    return authorityTransaction(access, ["users.delete"], async (current, session) => {
        const existing = await User.findOne({ _id: id, deleted: { $ne: true } }).session(session)
        if (!existing) throw new DomainError(404, "Usuário não encontrado")
        const user = await saveAssignment(current, id, existing.roles, version, "inactive", session)
        user.deleted = true
        await user.save({ session })
        await auditAccess(current, "user.delete", id, { deleted: false }, { deleted: true }, session)
        return { id }
    })
})
