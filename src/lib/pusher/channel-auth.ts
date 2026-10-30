/**
 * Regras de autorização dos canais privados do Pusher (`/api/pusher/auth`).
 *
 * Só canais CONHECIDOS são autorizados:
 * - `private-app` e `private-integration-{id}`: apenas **administradores**;
 * - `private-opex-u-{userId}`: o **próprio usuário** logado (Agente Opex);
 * - `private-opex-a-{anonymousId}`: o **visitante** dono do identificador anônimo (cookie assinado).
 * Canais públicos do DnDicas (fichas, Owlbear, geração) não passam por aqui.
 */

import { isIntegrationId } from "@/lib/integrations/catalog"
import { appChannel, OPEX_CHANNEL_PREFIX } from "./channel-names"

export interface ChannelViewer {
    /** Usuário logado (com o papel), ou `null` para visitante. */
    user: { id: string; permissions: readonly string[] } | null
    /** Identificador anônimo validado pelo cookie assinado do Agente Opex, quando houver. */
    anonymousId: string | null
}

export type ParsedChannel =
    | { kind: "app" }
    | { kind: "integration"; integrationId: string }
    | { kind: "opex-user"; userId: string }
    | { kind: "opex-anonymous"; anonymousId: string }
    | { kind: "unknown" }

export function parseChannel(channel: string): ParsedChannel {
    if (channel === appChannel()) return { kind: "app" }
    if (channel.startsWith("private-integration-")) {
        return { kind: "integration", integrationId: channel.slice("private-integration-".length) }
    }
    if (channel.startsWith(OPEX_CHANNEL_PREFIX)) {
        const owner = channel.slice(OPEX_CHANNEL_PREFIX.length)
        if (owner.startsWith("u-") && owner.length > 2) return { kind: "opex-user", userId: owner.slice(2) }
        if (owner.startsWith("a-") && owner.length > 2) return { kind: "opex-anonymous", anonymousId: owner.slice(2) }
    }
    return { kind: "unknown" }
}

/** Autoriza a assinatura do canal conforme quem está vendo (sessão validada pelo servidor). */
export function isChannelAuthorized(channel: string, viewer: ChannelViewer): boolean {
    const parsed = parseChannel(channel)
    const canAdmin = viewer.user?.permissions.some(key => key === "*" || key === "admin.access") ?? false
    switch (parsed.kind) {
        case "app":
            return canAdmin
        case "integration":
            // Stream de depuração: mesma permissão da rota de logs da integração.
            return isIntegrationId(parsed.integrationId) && (viewer.user?.permissions.some(key => key === "*" || key === `integrations.${parsed.integrationId}.logs`) ?? false)
        case "opex-user":
            return viewer.user?.id === parsed.userId
        case "opex-anonymous":
            return viewer.anonymousId !== null && viewer.anonymousId === parsed.anonymousId
        default:
            return false
    }
}
