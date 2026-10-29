import { getCurrentUserFromDb } from "@/features/users/api/get-current-user"
import { DomainError } from "@/lib/api/route"
import { fail } from "@/lib/api/responses"

/**
 * Ator das rotas copiadas do Opex. No Opex há um único dono (`getLocalUser`); no DnDicas o ator é
 * o usuário logado e as áreas de configuração (Integrações, IA, memórias) exigem administrador.
 * SOMENTE servidor.
 */
export interface Actor {
    id: string
    name: string
    role: "admin" | "user"
}

/** Autor das gravações feitas pelo próprio sistema (rotinas, migrações, jobs). */
export const SYSTEM_ACTOR: Actor = { id: "system", name: "Sistema", role: "admin" }

/** Usuário logado e ativo, ou `null` (visitante). */
export async function getActor(): Promise<Actor | null> {
    const result = await getCurrentUserFromDb()
    if (!result.success || !result.user) return null
    const user = result.user
    return {
        id: String(user._id),
        name: user.name?.trim() || user.username,
        role: user.role === "admin" ? "admin" : "user",
    }
}

/** Exige usuário logado: 401 pt-BR para visitantes. */
export async function requireActor(): Promise<Actor> {
    const actor = await getActor()
    if (!actor) throw new DomainError(401, "Faça login para continuar.", "UNAUTHENTICATED")
    return actor
}

/** Exige administrador: 401 para visitantes e 403 para usuários comuns. */
export async function requireAdminActor(): Promise<Actor> {
    const actor = await requireActor()
    if (actor.role !== "admin") throw new DomainError(403, "Acesso restrito a administradores.", "FORBIDDEN")
    return actor
}

/**
 * Guarda para rotas que não usam `withRoute`: devolve a resposta 401/403 padronizada (`ApiResponse`)
 * quando o usuário não é administrador, ou `null` para seguir.
 */
export async function denyUnlessAdmin(): Promise<Response | null> {
    try {
        await requireAdminActor()
        return null
    } catch (error) {
        if (error instanceof DomainError) return fail(error.status, error.message, error.code)
        throw error
    }
}
