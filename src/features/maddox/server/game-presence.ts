import { maddoxCampaignPresenceChannel } from "@/lib/pusher/channel-names"
import { loggerFor } from "@/lib/logger"

const log = loggerFor({ module: "maddox", feature: "game-presence" })

/**
 * Usuários com a mesa aberta agora (canal de presença `presence-maddox-c-{id}`), pela API HTTP do Pusher
 * (Soketi ou nuvem). `null` = presença desconhecida (Pusher sem configuração ou consulta falhou): quem
 * chama trata TODOS os elegíveis como presentes, para nunca fechar o turno antes da hora.
 */
export async function onlineUserIds(campaignId: string): Promise<Set<string> | null> {
    try {
        const { getRawPusherServer, isPusherServerConfigured } = await import("@/lib/pusher/server")
        if (!(await isPusherServerConfigured())) {
            log.info({ campaignId }, "[maddox] Pusher sem configuração: a mesa considera todos os jogadores do turno")
            return null
        }
        const pusher = await getRawPusherServer()
        const response = await pusher.get({ path: `/channels/${maddoxCampaignPresenceChannel(campaignId)}/users` })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = (await response.json()) as { users?: { id?: unknown }[] }
        return new Set((body.users ?? []).map((user) => String(user.id ?? "")).filter(Boolean))
    } catch (error) {
        log.warn({ err: error, campaignId }, "[maddox] Falha ao consultar a presença da mesa: considerando todos os jogadores do turno")
        return null
    }
}
