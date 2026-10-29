import { evaluateRoleAssignment } from "@nandobfer/perfix"
import { User } from "@/features/users/models/user"
import { createUserSchema, userFiltersSchema } from "@/features/users/api/validation"
import { serializeUser } from "@/features/users/api/serialize"
import { protectedRoute } from "@/features/perfix/server/route"
import { authorityTransaction, auditAccess, denied, roleRows } from "@/features/perfix/server/access"
import { getDefaultRoleId } from "@/features/perfix/server/settings"
import { catalog } from "@/features/perfix/catalog"
import { DomainError } from "@/lib/api/route"
export const GET = protectedRoute(["users.view"], async request => {
    const filters = userFiltersSchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const query: Record<string, unknown> = { deleted: { $ne: true } }
    if (filters.status !== "all") query.status = filters.status
    if (filters.roleId) query.roles = filters.roleId
    if (filters.search) {
        const search = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        query.$or = ["name", "email", "username"].map(key => ({ [key]: { $regex: search, $options: "i" } }))
    }
    const [rows, users, total] = await Promise.all([roleRows(), User.find(query).sort({ createdAt: -1 }).skip((filters.page - 1) * filters.limit).limit(filters.limit), User.countDocuments(query)])
    return { items: users.map(user => serializeUser(user, rows)), total, page: filters.page, totalPages: Math.ceil(total / filters.limit) }
})
export const POST = protectedRoute(["users.create"], async (request, _params, access) => {
    const data = createUserSchema.parse(await request.json())
    return authorityTransaction(access, ["users.create"], async (current, session) => {
        const roleIds = data.roleIds ?? [await getDefaultRoleId(session)]
        const rows = await roleRows(session)
        const assignment = evaluateRoleAssignment({ catalog, callerCargos: current.roles, requested: roleIds, current: [], loaded: rows })
        if (assignment.status !== "ok" || roleIds.some(id => !rows.some(role => role.id === id && role.ativo))) throw denied("Perfis não atribuíveis")
        if (await User.exists({ $or: [{ username: data.username }, { email: data.email }] }).session(session)) throw new DomainError(409, "Email ou username já cadastrado")
        const { roleIds: _ids, ...profile } = data
        const [user] = await User.create([{ ...profile, roles: assignment.cargos, accessVersion: 0, status: "active", passwordSetupRequired: true }], { session })
        await auditAccess(current, "user.create", String(user!._id), null, profile, session)
        return serializeUser(user!, rows)
    })
})
