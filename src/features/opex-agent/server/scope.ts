import { Types } from "mongoose"
import { getActor, type Actor } from "@/features/auth/server/actor"
import { User } from "@/features/users/models/user"
import { DomainError } from "@/lib/api/route"
import { opexOwnerKey, type OpexOwnerKey } from "@/lib/pusher/channel-names"
import type { IOpexSession } from "@/lib/db/models/Opex"
import type { OpexRole } from "../scope"
import { ensureAnonymousId } from "./anonymous"

/**
 * Escopo do Agente Opex no servidor (SOMENTE servidor): usuário logado (admin ou comum) ou
 * visitante anônimo (cookie assinado).
 *
 * O escopo **não** é confiado a partir do cliente: o usuário é revalidado no banco (ativo, papel
 * atual) a cada turno, a cada ferramenta e na confirmação. A sessão guarda só `userId` ou
 * `anonymousId`, nunca o ator pronto.
 */
export type OpexServerScope = { kind: "user"; actor: Actor } | { kind: "anonymous"; anonymousId: string }

export const userOpexScope = (actor: Actor): OpexServerScope => ({ kind: "user", actor })
export const anonymousOpexScope = (anonymousId: string): OpexServerScope => ({ kind: "anonymous", anonymousId })

/** Escopo da requisição atual: o usuário logado ou o visitante (cria o cookie anônimo se faltar). */
export async function requestOpexScope(): Promise<OpexServerScope> {
    const actor = await getActor()
    if (actor) return userOpexScope(actor)
    return anonymousOpexScope(await ensureAnonymousId())
}

export function roleOf(scope: OpexServerScope): OpexRole {
    return scope.kind === "anonymous" ? "anonymous" : scope.actor.role
}

/** Id usado na auditoria: o do usuário ou `anon:{id}` para visitantes. */
export function actorIdOf(scope: OpexServerScope): string {
    return scope.kind === "user" ? scope.actor.id : `anon:${scope.anonymousId}`
}

export function actorNameOf(scope: OpexServerScope): string {
    return scope.kind === "user" ? scope.actor.name : "Visitante"
}

export function ownerKeyOf(scope: OpexServerScope): OpexOwnerKey {
    return scope.kind === "user" ? opexOwnerKey({ userId: scope.actor.id }) : opexOwnerKey({ anonymousId: scope.anonymousId })
}

/** Filtro das sessões visíveis no escopo. */
export function sessionFilterOf(scope: OpexServerScope): Record<string, unknown> {
    return scope.kind === "user" ? { userId: scope.actor.id, anonymousId: null } : { anonymousId: scope.anonymousId, userId: null }
}

/** Usuário revalidado no banco (ativo e não excluído), com o papel atual. */
export async function loadActor(userId: string): Promise<Actor> {
    if (!Types.ObjectId.isValid(userId)) throw new DomainError(403, "O usuário foi desativado ou removido", "OPEX_ACTOR_INVALID")
    const user = await User.findOne({ _id: userId, deleted: { $ne: true }, status: "active" }).select("name username role").lean<{ _id: unknown; name?: string; username: string; role: string }>()
    if (!user) throw new DomainError(403, "O usuário foi desativado ou removido", "OPEX_ACTOR_INVALID")
    return { id: String(user._id), name: user.name?.trim() || user.username, role: user.role === "admin" ? "admin" : "user" }
}

/** Reconstrói o escopo de uma sessão gravada (follow-ups, confirmações e jobs), revalidando o usuário. */
export async function sessionScopeOf(session: Pick<IOpexSession, "userId" | "anonymousId">): Promise<OpexServerScope> {
    if (session.userId) return userOpexScope(await loadActor(session.userId))
    if (session.anonymousId) return anonymousOpexScope(session.anonymousId)
    throw new DomainError(404, "Sessão sem dono", "OPEX_SESSION_NOT_FOUND")
}
