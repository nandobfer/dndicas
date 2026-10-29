"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { integrationDebugChannel, INTEGRATION_STATUS_EVENT, type IntegrationId } from "@/lib/integrations/catalog"
import type { IntegrationStatusEvent } from "../types"
import { applyIntegrationHealth } from "./useIntegrations"

/**
 * Status em tempo real: assina o canal privado de cada integração visível e aplica os eventos
 * `status-updated` (início → bolinha azul girando; fim → novo status) no cache do TanStack
 * Query. Sem Pusher no cliente não faz nada — o polling de `useIntegrations` cobre.
 */
export function useIntegrationStatusLive(ids: readonly IntegrationId[]): void {
    const queryClient = useQueryClient()
    // Chave estável: a lista chega como array novo a cada render.
    const key = [...ids].sort().join(",")

    useEffect(() => {
        if (!key || !isPusherClientAvailable()) return
        const channels = key.split(",") as IntegrationId[]
        const handler = (event: IntegrationStatusEvent) => {
            if (!event?.id) return
            applyIntegrationHealth(queryClient, event.id, event.health ? { ...event.health, checking: event.checking } : { checking: event.checking })
        }
        const bound = channels.map((id) => {
            const name = integrationDebugChannel(id)
            const channel = acquireChannel(name)
            channel.bind(INTEGRATION_STATUS_EVENT, handler)
            return { name, channel }
        })
        return () => {
            for (const { name, channel } of bound) {
                channel.unbind(INTEGRATION_STATUS_EVENT, handler)
                releaseChannel(name)
            }
        }
    }, [key, queryClient])
}
