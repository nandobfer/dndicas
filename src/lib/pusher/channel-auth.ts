/**
 * Regras de autorização dos canais privados do Pusher (`/api/pusher/auth`).
 *
 * Só canais CONHECIDOS são autorizados:
 * - `private-app` e `private-integration-{id}`: apenas **administradores**;
 * - `private-opex-u-{userId}`: o **próprio usuário** logado (Agente Opex);
 * - `private-opex-a-{anonymousId}`: o **visitante** dono do identificador anônimo (cookie assinado);
 * - `private-maddox-u-{userId}`: o **próprio usuário** logado (Campanhas Maddox);
 * - `presence-maddox-c-{campaignId}`: usuário logado com `maddox.play` que seja **membro ativo** da
 *   campanha — a participação é conferida no banco pela rota (`requiresCampaignMembership`).
 * Canais públicos do DnDicas (fichas, Owlbear, geração) não passam por aqui.
 */

import { isIntegrationId } from "@/lib/integrations/catalog"
import { appChannel, MADDOX_CAMPAIGN_PRESENCE_PREFIX, MADDOX_USER_CHANNEL_PREFIX, OPEX_CHANNEL_PREFIX } from "./channel-names"

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
    | { kind: "maddox-user"; userId: string }
    | { kind: "maddox-campaign-presence"; campaignId: string }
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
    if (channel.startsWith(MADDOX_USER_CHANNEL_PREFIX) && channel.length > MADDOX_USER_CHANNEL_PREFIX.length) {
        return { kind: "maddox-user", userId: channel.slice(MADDOX_USER_CHANNEL_PREFIX.length) }
    }
    if (channel.startsWith(MADDOX_CAMPAIGN_PRESENCE_PREFIX)) {
        const campaignId = channel.slice(MADDOX_CAMPAIGN_PRESENCE_PREFIX.length)
        if (/^[a-f0-9]{24}$/i.test(campaignId)) return { kind: "maddox-campaign-presence", campaignId }
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
        case "maddox-user":
            return viewer.user !== null && viewer.user.id === parsed.userId
        case "maddox-campaign-presence":
            // Pré-condição: a rota ainda confere no banco se o usuário é membro ativo da campanha.
            return viewer.user?.permissions.some((key) => key === "*" || key === "maddox.play") ?? false
        case "opex-anonymous":
            return viewer.anonymousId !== null && viewer.anonymousId === parsed.anonymousId
        default:
            return false
    }
}

/** Canal de presença da mesa Maddox: a rota precisa conferir a participação na campanha (`campaignId`). */
export function requiresCampaignMembership(channel: string): string | null {
    const parsed = parseChannel(channel)
    return parsed.kind === "maddox-campaign-presence" ? parsed.campaignId : null
}
