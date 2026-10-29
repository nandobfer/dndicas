"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import {
    getIntegrationDef,
    integrationDebugChannel,
    INTEGRATION_DEBUG_EVENT,
    type IntegrationId,
} from "@/lib/integrations/catalog"
import type { IntegrationLogLine } from "@/lib/integrations/log-format"

export type DebugStreamMode = "realtime" | "manual"

function inScope(line: IntegrationLogLine, scope: string): boolean {
    return typeof line.data === "object" && line.data !== null && (line.data as { scope?: unknown }).scope === scope
}

function lineKey(line: IntegrationLogLine): string {
    return `${line.ts}|${line.instance ?? ""}|${line.level}|${line.message}`
}

/**
 * Logs de debug de uma integração: carga inicial do Mongo (48h) + tempo real pelo Pusher
 * quando disponível. Sem Pusher (ou para a própria integração Pusher, que não se
 * retransmite), o modo é `manual` e a tela oferece "Atualizar".
 */
export function useIntegrationDebugLogs(
    id: IntegrationId,
    options: { enabled: boolean; onLines: (lines: IntegrationLogLine[], reset: boolean) => void; scope?: string },
) {
    const { enabled, scope } = options
    const onLinesRef = useRef(options.onLines)
    useEffect(() => {
        onLinesRef.current = options.onLines
    })
    const seen = useRef(new Set<string>())
    const lastTs = useRef<string | undefined>(undefined)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const realtime = isPusherClientAvailable() && getIntegrationDef(id).streamsDebugOverPusher
    const mode: DebugStreamMode = realtime ? "realtime" : "manual"

    const accept = useCallback((lines: IntegrationLogLine[], reset: boolean) => {
        if (reset) seen.current.clear()
        const fresh = lines.filter((line) => {
            const key = lineKey(line)
            if (seen.current.has(key)) return false
            seen.current.add(key)
            return true
        })
        for (const line of fresh) if (!lastTs.current || line.ts > lastTs.current) lastTs.current = line.ts
        if (fresh.length > 0 || reset) onLinesRef.current(fresh, reset)
    }, [])

    const refresh = useCallback(
        async (reset = false) => {
            setLoading(true)
            setError(null)
            try {
                const { data } = await api.get<{ data: IntegrationLogLine[] }>(`/integrations/${id}/logs`, {
                    params: { ...(reset || !lastTs.current ? { limit: 500 } : { after: lastTs.current, limit: 1000 }), ...(scope ? { scope } : {}) },
                })
                if (reset) lastTs.current = undefined
                accept(data.data, reset)
            } catch {
                setError("Não foi possível carregar os logs")
            } finally {
                setLoading(false)
            }
        },
        [accept, id, scope],
    )

    useEffect(() => {
        if (!enabled) return
        // Fora do corpo do efeito: a carga inicial atualiza estado (loading/erro).
        const initial = setTimeout(() => void refresh(true), 0)
        if (!realtime) return () => clearTimeout(initial)

        const channelName = integrationDebugChannel(id)
        const channel = acquireChannel(channelName)
        const handler = (payload: { entries?: IntegrationLogLine[] }) => accept((payload.entries ?? []).filter((line) => !scope || inScope(line, scope)), false)
        channel.bind(INTEGRATION_DEBUG_EVENT, handler)
        return () => {
            clearTimeout(initial)
            channel.unbind(INTEGRATION_DEBUG_EVENT, handler)
            releaseChannel(channelName)
        }
    }, [accept, enabled, id, realtime, refresh, scope])

    return { mode, loading, error, refresh: () => refresh(false), reload: () => refresh(true) }
}
