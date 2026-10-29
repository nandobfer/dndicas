"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { withBasePath } from "@/lib/base-path"
import { applyLiveLine } from "../live-message"
import type { OpexLiveMessage, OpexSessionStatus, OpexStreamLine } from "../types"
import { opexSessionKey, opexSessionsKey } from "./useOpexSessions"
import { useOpexScope } from "../components/OpexScopeProvider"

const RETRY_MS = 3_000
/** Sem nada (nem `ping`) por este tempo, a conexão é refeita. */
const STALE_MS = 45_000

export interface OpexStreamState {
    live: OpexLiveMessage | null
    /** Resposta que acabou de terminar, exibida até a mensagem gravada chegar (sem piscar). */
    settled: OpexLiveMessage | null
    /** Situação informada pelo servidor no último `snapshot`/turno (`null` antes de conectar). */
    status: OpexSessionStatus | null
    connected: boolean
}

const INITIAL: OpexStreamState = { live: null, settled: null, status: null, connected: false }

/** Divide o buffer NDJSON em linhas completas. */
export function splitLines(buffer: string): { lines: OpexStreamLine[]; rest: string } {
    const parts = buffer.split("\n")
    const rest = parts.pop() ?? ""
    const lines: OpexStreamLine[] = []
    for (const part of parts) {
        if (!part.trim()) continue
        try {
            lines.push(JSON.parse(part) as OpexStreamLine)
        } catch {
            // linha inválida: ignora
        }
    }
    return { lines, rest }
}

export function reduceStream(state: OpexStreamState, line: OpexStreamLine): OpexStreamState {
    const live = applyLiveLine(state.live, line)
    if (line.type === "snapshot") return { ...state, live, status: line.status }
    if (line.type === "turn-start") return { ...state, live, settled: null, status: "running" }
    if (line.type === "turn-end") return { ...state, live, settled: state.live, status: line.status === "error" ? "error" : "idle" }
    return { ...state, live }
}

/**
 * Resposta do agente ao vivo (`GET /api/opex/sessions/[id]/stream`, NDJSON). A cada conexão o
 * servidor manda o retrato do turno em andamento; caiu, reconecta sozinho. No fim do turno recarrega
 * as mensagens gravadas.
 */
export function useOpexStream(sessionId: string | null): OpexStreamState {
    const queryClient = useQueryClient()
    const { apiBase, queryPrefix } = useOpexScope()
    const [state, setState] = useState<{ id: string | null; value: OpexStreamState }>({ id: null, value: INITIAL })

    useEffect(() => {
        if (!sessionId) return
        let disposed = false
        let controller: AbortController | null = null
        let retry: ReturnType<typeof setTimeout> | null = null
        let watchdog: ReturnType<typeof setTimeout> | null = null
        const url = withBasePath(`/api${apiBase}/sessions/${sessionId}/stream`)

        const armWatchdog = () => {
            if (watchdog) clearTimeout(watchdog)
            watchdog = setTimeout(() => controller?.abort(), STALE_MS)
        }
        const refresh = () => {
            void queryClient.invalidateQueries({ queryKey: opexSessionKey(queryPrefix, sessionId) })
            void queryClient.invalidateQueries({ queryKey: opexSessionsKey(queryPrefix) })
        }

        const connect = async () => {
            controller = new AbortController()
            armWatchdog()
            try {
                const res = await fetch(url, { signal: controller.signal, cache: "no-store" })
                if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
                setState((current) => ({ id: sessionId, value: { ...(current.id === sessionId ? current.value : INITIAL), connected: true } }))
                const reader = res.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ""
                let first = true
                for (;;) {
                    const { value, done } = await reader.read()
                    if (done) break
                    armWatchdog()
                    buffer += decoder.decode(value, { stream: true })
                    const parsed = splitLines(buffer)
                    buffer = parsed.rest
                    if (!parsed.lines.length) continue
                    setState((current) => ({ id: sessionId, value: parsed.lines.reduce(reduceStream, current.id === sessionId ? current.value : INITIAL) }))
                    // Reconexão (ou fim de turno): as mensagens gravadas podem ter mudado.
                    if (parsed.lines.some((line) => line.type === "turn-end") || (first && parsed.lines.some((line) => line.type === "snapshot"))) refresh()
                    first = false
                }
            } catch {
                // queda ou aborto: tenta de novo abaixo
            }
            if (disposed) return
            setState((current) => ({ id: sessionId, value: { ...(current.id === sessionId ? current.value : INITIAL), connected: false } }))
            retry = setTimeout(() => void connect(), RETRY_MS)
        }

        void connect()
        return () => {
            disposed = true
            controller?.abort()
            if (retry) clearTimeout(retry)
            if (watchdog) clearTimeout(watchdog)
        }
    }, [sessionId, queryClient, apiBase, queryPrefix])

    return state.id === sessionId ? state.value : INITIAL
}
