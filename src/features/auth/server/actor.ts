import { getCurrentUserFromDb } from "@/features/users/api/get-current-user"
import { DomainError } from "@/lib/api/route"
import { fail } from "@/lib/api/responses"
import { optionalAccess } from "@/features/perfix/server/auth"

/**
 * Ator das rotas copiadas do Opex. No Opex há um único dono (`getLocalUser`); no DnDicas o ator é
 * o usuário logado e as áreas de configuração (Integrações, IA, memórias) exigem administrador.
 * SOMENTE servidor.
 */
export interface Actor {
    id: string
    name: string
    role: "admin" | "user"
    permissions?: string[]
    realUserId?: string
}

/** Autor das gravações feitas pelo próprio sistema (rotinas, migrações, jobs). */
export const SYSTEM_ACTOR: Actor = { id: "system", name: "Sistema", role: "admin" }

/** Usuário logado e ativo, ou `null` (visitante). */
export async function getActor(): Promise<Actor | null> {
    const result = await getCurrentUserFromDb()
    if (!result.success || !result.user) return null
    const user = result.user
    const access = await optionalAccess()
    return {
        id: String(user._id),
        name: user.name?.trim() || user.username,
        role: access && (access.effective.has("*") || access.effective.has("admin.access")) ? "admin" : "user",
        permissions: [...access?.effective ?? []], realUserId: access?.realUserId,
    }
}

/** Exige usuário logado: 401 pt-BR para visitantes. */
export async function requireActor(): Promise<Actor> {
    const actor = await getActor()
    if (!actor) throw new DomainError(401, "Faça login para continuar.", "UNAUTHENTICATED")
    return actor
}

/** Exige administrador: 401 para visitantes e 403 para usuários comuns. */
export async function requireAdminActor(permission = "admin.access"): Promise<Actor> {
    return requirePermissionActor(permission)
}

/**
 * Guarda para rotas que não usam `withRoute`: devolve a resposta 401/403 padronizada (`ApiResponse`)
 * quando o usuário não é administrador, ou `null` para seguir.
 */
export async function denyUnlessAdmin(permission = "admin.access"): Promise<Response | null> {
    try {
        await requireAdminActor(permission)
        return null
    } catch (error) {
        if (error instanceof DomainError) return fail(error.status, error.message, error.code)
        throw error
    }
}
/** Autoridade granular sem depender do papel de compatibilidade do Agente Opex. */
export async function requirePermissionActor(permission: string): Promise<Actor> {
    const { requireAccess } = await import("@/features/perfix/server/access")
    const access = await requireAccess(permission)
    return { id: access.userId, realUserId: access.realUserId, name: access.name, role: access.effective.has("*") || access.effective.has("admin.access") ? "admin" : "user", permissions: [...access.effective] }
}
export async function denyUnlessPermission(permission: string): Promise<Response | null> {
    try { await requirePermissionActor(permission); return null } catch (error) {
        if (error instanceof DomainError) return fail(error.status, error.message, error.code)
        throw error
    }
}
