import { protectedRoute } from "@/features/perfix/server/route"
import { roleRows } from "@/features/perfix/server/access"
import { deleteRole, updateRole } from "@/features/perfix/server/commands"
import { versionSchema, objectId } from "@/features/perfix/schemas"
import { AccessAudit } from "@/features/perfix/server/models"
import { User } from "@/features/users/models/user"
import { DomainError } from "@/lib/api/route"
export const GET = protectedRoute<{ id: string }>(["roles.view"], async (_req, { id }) => {
    objectId.parse(id)
    const role = (await roleRows()).find(role => role.id === id)
    if (!role) throw new DomainError(404, "Perfil não encontrado")
    return { ...role, membros: (await User.find({ roles: id, deleted: { $ne: true } }).select("_id")).map(user => String(user._id)), audit: await AccessAudit.find({ targetId: id }).sort({ createdAt: -1 }).limit(100).lean() }
})
export const PATCH = protectedRoute<{ id: string }>(["roles.edit"], async (req, { id }, access) => updateRole(access, objectId.parse(id), await req.json()))
export const DELETE = protectedRoute<{ id: string }>(["roles.edit"], async (req, { id }, access) => deleteRole(access, objectId.parse(id), versionSchema.parse(await req.json()).version))
