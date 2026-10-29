/**
 * Publicação de eventos — SOMENTE SERVIDOR (depois de persistir e auditar). Payloads mínimos (ids e
 * o que mudou). Código de cliente deve importar os nomes de `./channel-names`, nunca este módulo
 * (ele puxa Mongoose via configuração das integrações).
 */

import { logger } from "@/lib/logger"
import { appChannel } from "./channel-names"

export { appChannel, integrationChannel, opexChannel } from "./channel-names"

/**
 * Publica no canal administrativo do app. Nunca lança: falha de tempo real é logada e não desfaz a
 * mutação já persistida.
 */
export async function publishAppEvent(event: string, payload: Record<string, unknown>): Promise<void> {
    await publishToChannels([appChannel()], event, payload)
}

export async function publishToChannels(channels: string[], event: string, payload: Record<string, unknown>): Promise<void> {
    if (channels.length === 0) return
    try {
        const { isPusherServerConfigured, pusher } = await import("./server")
        if (!(await isPusherServerConfigured())) return
        // O Pusher aceita até 100 canais por trigger.
        for (let i = 0; i < channels.length; i += 100) {
            await pusher.trigger(channels.slice(i, i + 100), event, payload)
        }
    } catch (error) {
        logger.warn({ err: error, event, channels }, "[pusher] Falha ao publicar evento")
    }
}
