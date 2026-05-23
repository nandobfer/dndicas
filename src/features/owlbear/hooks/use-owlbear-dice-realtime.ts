"use client"

import * as React from "react"
import { getPusherBrowserConfig } from "@/core/realtime/pusher-browser-config"
import { PusherBrowserService } from "@/core/realtime/pusher-browser-service"
import { getOrCreatePusherOriginId } from "@/core/realtime/pusher-origin"
import { OWLBEAR_DICE_PUSHER_EVENTS, getOwlbearDiceChannelName, type OwlbearDiceRollResolvedEventPayload } from "../realtime/owlbear-dice-pusher"

interface UseOwlbearDiceRealtimeOptions {
    roomId: string | null
    onRollResolved: (payload: OwlbearDiceRollResolvedEventPayload) => void
}

export function useOwlbearDiceRealtime({ roomId, onRollResolved }: UseOwlbearDiceRealtimeOptions) {
    React.useEffect(() => {
        if (!roomId) return

        const originId = getOrCreatePusherOriginId()
        let channel: ReturnType<PusherBrowserService["subscribe"]> | null = null
        let disposed = false

        void (async () => {
            const browserConfig = await getPusherBrowserConfig()
            if (disposed || !browserConfig) return
            if (!browserConfig.key || !browserConfig.wsHost || !Number.isFinite(browserConfig.wsPort) || browserConfig.wsPort <= 0) {
                console.error("[realtime] Missing or invalid Owlbear dice browser config.", {
                    roomId,
                    config: browserConfig,
                })
                return
            }

            const channelName = getOwlbearDiceChannelName(roomId)
            const pusher = PusherBrowserService.getInstance()
            channel = pusher.subscribe(browserConfig, channelName)

            channel.bind("pusher:subscription_succeeded", () => {
                console.info("[realtime] Owlbear dice subscription succeeded.", {
                    roomId,
                    channelName,
                })
            })

            channel.bind("pusher:subscription_error", (error: unknown) => {
                console.error("[realtime] Owlbear dice subscription failed.", {
                    roomId,
                    channelName,
                    error,
                })
            })

            channel.bind(OWLBEAR_DICE_PUSHER_EVENTS.rollResolved, (payload: OwlbearDiceRollResolvedEventPayload) => {
                if (payload.originId && payload.originId === originId) return
                onRollResolved(payload)
            })
        })()

        return () => {
            disposed = true
            if (!channel) return

            channel.unbind("pusher:subscription_succeeded")
            channel.unbind("pusher:subscription_error")
            channel.unbind(OWLBEAR_DICE_PUSHER_EVENTS.rollResolved)
            PusherBrowserService.getInstance().unsubscribe(getOwlbearDiceChannelName(roomId))
        }
    }, [onRollResolved, roomId])
}
