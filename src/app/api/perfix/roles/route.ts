import { protectedRoute } from "@/features/perfix/server/route"
import { roleRows } from "@/features/perfix/server/access"
import { RoleHierarchy } from "@/features/perfix/server/models"
import { User } from "@/features/users/models/user"
import { createRole } from "@/features/perfix/server/commands"
export const GET = protectedRoute(["roles.view"], async () => {
    const rows = await roleRows()
    const state = await RoleHierarchy.findById("global")
    const roles = await Promise.all(rows.map(async role => ({ ...role, usuariosCount: await User.countDocuments({ roles: role.id, deleted: { $ne: true } }) })))
    return { roles, hierarchyVersion: state?.version ?? 0 }
})
export const POST = protectedRoute(["roles.edit"], async (req, _params, access) => createRole(access, await req.json()))
