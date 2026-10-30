import { getUnassignableRoles } from "@nandobfer/perfix"
import { catalog } from "@/features/perfix/catalog"
import { roleRows, denied } from "@/features/perfix/server/access"
import { protectedRoute } from "@/features/perfix/server/route"
export const GET = protectedRoute([], async (_req, _params, access) => {
    if (!["users.create", "users.edit"].some(key => access.effective.has(key)) && !access.effective.has("*")) throw denied()
    const rows = (await roleRows()).filter(role => role.ativo)
    const blocked = new Map(getUnassignableRoles(catalog, access.roles, rows).map(role => [role.id, role.motivo]))
    return rows.map(role => ({ ...role, bloqueado: blocked.has(role.id), motivo: blocked.get(role.id) }))
})
