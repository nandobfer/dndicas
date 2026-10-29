/**
 * Escopo do Agente Opex (módulo PURO): quem conversa — administrador, usuário logado ou visitante
 * anônimo. O papel decide o catálogo de ferramentas e as memórias do turno; o dono da sessão
 * (`u-{userId}` ou `a-{anonymousId}`) decide as sessões visíveis, o canal de tempo real e as abas
 * guardadas no navegador.
 */

import type { OpexOwnerKey } from "@/lib/pusher/channel-names"
import { OPEX_TABS_STORAGE_KEY } from "./constants"

export type OpexRole = "admin" | "user" | "anonymous"

const ROLE_RANK: Record<OpexRole, number> = { anonymous: 0, user: 1, admin: 2 }

/** O papel alcança o mínimo exigido pela ferramenta/grupo? Sem mínimo, vale para todos. */
export function roleAllows(role: OpexRole, minRole: "user" | "admin" | undefined): boolean {
    return !minRole || ROLE_RANK[role] >= ROLE_RANK[minRole]
}

/** Abas abertas: separadas por dono (usuário ou visitante). */
export function opexTabsStorageKey(ownerKey: OpexOwnerKey | null): string {
    return ownerKey ? `${OPEX_TABS_STORAGE_KEY}:${ownerKey}` : OPEX_TABS_STORAGE_KEY
}
