import mongoose, { type ClientSession } from "mongoose"
import { cookies, headers } from "next/headers"
import { getServerSession } from "next-auth"
import { expandPermissions, readViewAs, resolveViewAs, VIEW_AS_COOKIE, VIEW_AS_TAB_COOKIE } from "@nandobfer/perfix"
import { authOptions } from "@/features/auth/auth-options"
import { User } from "@/features/users/models/user"
import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { AccessRole, RoleHierarchy, AccessAudit } from "./models"
import { catalog, can, normalizeRolePermissions } from "../catalog"
import type { AccessDto, RoleDto } from "../types"

export interface AccessContext {
    /** Identidade efetiva: o alvo durante impersonação de usuário. */
    userId: string; realUserId: string; name: string; roles: RoleDto[]; realRoles: RoleDto[];
    effective: ReadonlySet<string>; realEffective: ReadonlySet<string>; viewAsHeader: string; dto: AccessDto;
}
export const denied = (message = "Você não tem permissão para esta operação.", code = "FORBIDDEN") => new DomainError(403, message, code)
export const conflict = () => new DomainError(409, "Os acessos foram alterados. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")
export function requirePermissions(context: AccessContext, ...keys: string[]) {
    if (!keys.every(key => can(context.effective, key))) throw denied()
}
export async function roleRows(session: ClientSession | null = null): Promise<RoleDto[]> {
    const rows = await AccessRole.find().session(session).sort({ createdAt: 1, _id: 1 })
    const hierarchy = await RoleHierarchy.findById("global").session(session)
    return rows.map((role, index) => ({
        id: String(role._id), slug: role.slug, nome: role.nome, descricao: role.descricao, cor: role.cor,
        permissoes: normalizeRolePermissions(catalog.sanitizePermissions(role.permissoes)), ativo: role.ativo,
        posicao: role.slug === "admin" ? 0 : ((hierarchy?.ordem.indexOf(String(role._id)) ?? -1) >= 0 ? hierarchy!.ordem.indexOf(String(role._id)) + 1 : rows.length + index + 1),
        version: role.version, createdAt: role.createdAt.toISOString(), updatedAt: role.updatedAt.toISOString(),
        createdBy: role.createdBy ?? undefined, updatedBy: role.updatedBy ?? undefined,
    })).sort((a, b) => a.posicao - b.posicao)
}

export async function resolveAccess(realUserId: string, viewAsHeader = "none", session: ClientSession | null = null): Promise<AccessContext> {
    if (!mongoose.isObjectIdOrHexString(realUserId)) throw new DomainError(401, "Sessão inválida", "UNAUTHORIZED")
    const user = await User.findOne({ _id: realUserId, status: "active", deleted: { $ne: true } }).session(session)
    if (!user) throw new DomainError(401, "Sessão expirada", "UNAUTHORIZED")
    const rows = await roleRows(session)
    const realRoles = rows.filter(row => user.roles.includes(row.id))
    const realEffective = expandPermissions(realRoles)
    const parsed = readViewAs({ header: viewAsHeader })
    if (parsed.invalid) throw denied("Simulação inválida. Encerre a simulação.", "VIEW_AS_INVALID")
    let effectiveUser = user
    const result = await resolveViewAs({
        real: { userId: realUserId, nome: user.name || user.username, effective: realEffective }, viewAs: parsed.viewAs,
        loadRole: async id => rows.find(row => row.id === id && row.ativo) ?? null,
        loadTarget: async id => {
            if (!mongoose.isObjectIdOrHexString(id)) return null
            const target = await User.findOne({ _id: id, status: "active", deleted: { $ne: true } }).session(session)
            if (!target) return null
            effectiveUser = target
            return { id, nome: target.name || target.username, ativo: true, roles: rows.filter(row => target.roles.includes(row.id)) }
        },
    })
    if (result.status === "forbidden") throw denied("Somente administradores reais podem simular acesso.", "VIEW_AS_FORBIDDEN")
    if (result.status === "invalid") throw denied("Perfil ou usuário simulado indisponível.", "VIEW_AS_INVALID")
    const roles = result.status === "ok" ? rows.filter(row => result.subject.roles.some(role => role.id === row.id)) : realRoles
    const effective = result.status === "ok" ? result.effective : realEffective
    const simulation = result.status === "ok" ? result.marker : null
    return { userId: String(effectiveUser._id), realUserId, name: effectiveUser.name || effectiveUser.username, roles, realRoles, effective, realEffective, viewAsHeader,
        dto: { permissions: [...effective], roles, realIsAdministrator: realEffective.has("*"), simulation } }
}

/** Não usa claims de permissão do JWT. Cabeçalho vence cookies; `none` sai da simulação. */
export async function requestAccess(realOnly = false): Promise<AccessContext | null> {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return null
    await dbConnect()
    let marker = "none"
    if (!realOnly) {
        const [h, c] = await Promise.all([headers(), cookies()])
        const parsed = readViewAs({ header: h.get("x-perfix-view-as"), tabMapCookie: c.get(VIEW_AS_COOKIE)?.value, tabCookie: c.get(VIEW_AS_TAB_COOKIE)?.value })
        if (parsed.invalid) throw denied("Simulação inválida", "VIEW_AS_INVALID")
        if (parsed.viewAs) {
            const { encodeViewAs } = await import("@nandobfer/perfix")
            marker = encodeViewAs(parsed.viewAs)
        }
    }
    return resolveAccess(session.user.id, marker)
}
export async function requireAccess(...keys: string[]) {
    const context = await requestAccess()
    if (!context) throw new DomainError(401, "Faça login para continuar.", "UNAUTHORIZED")
    requirePermissions(context, ...keys)
    return context
}
/** Fence global evita remoções concorrentes do último admin e TOCTOU de autoridade. */
export async function authorityTransaction<T>(initial: AccessContext, keys: string[], action: (context: AccessContext, session: ClientSession) => Promise<T>): Promise<T> {
    requirePermissions(initial, ...keys)
    await dbConnect()
    const hello = await mongoose.connection.db!.command({ hello: 1 })
    if (!hello.setName && hello.msg !== "isdbgrid") throw new DomainError(503, "A administração de acessos exige MongoDB com replica set.", "REPLICA_SET_REQUIRED")
    return mongoose.connection.transaction(async session => {
        const fence = await RoleHierarchy.updateOne({ _id: "global" }, { $inc: { fence: 1 } }, { session })
        if (!fence.matchedCount) throw new DomainError(503, "Hierarquia de acesso indisponível. Execute a migração do Perfix.", "PERFIX_UNAVAILABLE")
        const current = await resolveAccess(initial.realUserId, initial.viewAsHeader, session)
        requirePermissions(current, ...keys)
        return action(current, session)
    })
}
export async function auditAccess(context: AccessContext, action: string, targetId: string, before: unknown, after: unknown, session?: ClientSession) {
    await AccessAudit.create([{ actorId: context.realUserId, userId: context.userId, action, targetId, before, after, simulation: context.dto.simulation }], { session })
    const { default: AuditLog } = await import("@/core/database/audit-log")
    await AuditLog.create([{ action: action.endsWith(".create") ? "CREATE" : action.endsWith(".delete") ? "DELETE" : "UPDATE", collectionName: action.startsWith("user.") ? "User" : "Perfix", documentId: targetId, userId: context.userId, details: { action, realActorId: context.realUserId, effectiveUserId: context.userId, simulation: context.dto.simulation, before, after }, timestamp: new Date() }], { session })
}
