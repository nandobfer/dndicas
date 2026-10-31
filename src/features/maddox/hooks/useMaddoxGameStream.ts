"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { withBasePath } from "@/lib/base-path"
import type { MaddoxGameStreamLine, MaddoxLiveGenerationDto } from "../game-types"
import { MADDOX_CAMPAIGNS_KEY } from "./useMaddoxCampaigns"

/** Primeira espera para reconectar; dobra a cada falha seguida até `MADDOX_GAME_STREAM_RETRY_MAX_MS`. */
export const MADDOX_GAME_STREAM_RETRY_MS = 3_000
export const MADDOX_GAME_STREAM_RETRY_MAX_MS = 60_000
/** Sem nada (nem `ping`) por este tempo, a conexão é refeita. */
export const MADDOX_GAME_STREAM_STALE_MS = 45_000
/** Respostas que não melhoram tentando de novo (sem login, sem permissão, fora da campanha): o stream para. */
const FATAL_STATUSES = new Set([401, 403, 404])

class FatalStreamError extends Error {}

/** Geração que terminou: fica na tela até a mensagem gravada chegar no estado da mesa (sem piscar). */
export interface MaddoxSettledGeneration extends MaddoxLiveGenerationDto {
    messageId: string
}

export interface MaddoxGameStreamState {
    live: MaddoxLiveGenerationDto[]
    settled: MaddoxSettledGeneration[]
    /** Sobe a cada geração do Maddox que termina (o campo de texto volta a ter foco). */
    finished: number
    connected: boolean
}

export const MADDOX_GAME_STREAM_INITIAL: MaddoxGameStreamState = { live: [], settled: [], finished: 0, connected: false }

/** Divide o buffer NDJSON em linhas completas. */
export function splitGameStreamLines(buffer: string): { lines: MaddoxGameStreamLine[]; rest: string } {
    const parts = buffer.split("\n")
    const rest = parts.pop() ?? ""
    const lines: MaddoxGameStreamLine[] = []
    for (const part of parts) {
        if (!part.trim()) continue
        try {
            lines.push(JSON.parse(part) as MaddoxGameStreamLine)
        } catch {
            // linha inválida: ignora
        }
    }
    return { lines, rest }
}

const patch = (live: MaddoxLiveGenerationDto[], liveId: string, change: (item: MaddoxLiveGenerationDto) => MaddoxLiveGenerationDto) => live.map((item) => (item.liveId === liveId ? change(item) : item))

export function reduceGameStream(state: MaddoxGameStreamState, line: MaddoxGameStreamLine): MaddoxGameStreamState {
    switch (line.type) {
        case "snapshot":
            return { ...state, live: line.live }
        case "live-start":
            return { ...state, live: [...state.live.filter((item) => item.liveId !== line.live.liveId), line.live] }
        case "delta":
            return { ...state, live: patch(state.live, line.liveId, (item) => ({ ...item, text: item.text + line.text })) }
        case "tool":
            return { ...state, live: patch(state.live, line.liveId, (item) => ({ ...item, tool: line.running })) }
        case "live-end": {
            const ended = state.live.find((item) => item.liveId === line.liveId)
            const settled = ended && line.messageId && !line.error ? [...state.settled, { ...ended, tool: false, messageId: line.messageId }] : state.settled
            return { ...state, live: state.live.filter((item) => item.liveId !== line.liveId), settled, finished: state.finished + 1 }
        }
        default:
            return state
    }
}

/**
 * Gerações do Maddox ao vivo na mesa (`GET /api/maddox/campaigns/[id]/game/stream`, NDJSON), iguais para todos os
 * jogadores. A cada conexão chega o retrato do que está em andamento; caiu, reconecta sozinho (espera crescente; para em
 * 401/403/404). Quando uma geração
 * termina, a mesa recarrega para trazer a mensagem gravada.
 */
export function useMaddoxGameStream(campaignId: string, enabled: boolean): MaddoxGameStreamState {
    const queryClient = useQueryClient()
    const [state, setState] = useState<{ id: string | null; value: MaddoxGameStreamState }>({ id: null, value: MADDOX_GAME_STREAM_INITIAL })

    useEffect(() => {
        if (!enabled) return
        let disposed = false
        let controller: AbortController | null = null
        let retry: ReturnType<typeof setTimeout> | null = null
        let watchdog: ReturnType<typeof setTimeout> | null = null
        const url = withBasePath(`/api/maddox/campaigns/${campaignId}/game/stream`)
        const current = (value: { id: string | null; value: MaddoxGameStreamState }) => (value.id === campaignId ? value.value : MADDOX_GAME_STREAM_INITIAL)

        const armWatchdog = () => {
            if (watchdog) clearTimeout(watchdog)
            watchdog = setTimeout(() => controller?.abort(), MADDOX_GAME_STREAM_STALE_MS)
        }
        const refresh = () => void queryClient.invalidateQueries({ queryKey: MADDOX_CAMPAIGNS_KEY })

        let failures = 0
        const connect = async () => {
            controller = new AbortController()
            armWatchdog()
            try {
                const res = await fetch(url, { signal: controller.signal, cache: "no-store" })
                if (FATAL_STATUSES.has(res.status)) throw new FatalStreamError(`HTTP ${res.status}`)
                if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
                failures = 0
                setState((value) => ({ id: campaignId, value: { ...current(value), connected: true } }))
                const reader = res.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ""
                let first = true
                for (;;) {
                    const { value, done } = await reader.read()
                    if (done) break
                    armWatchdog()
                    buffer += decoder.decode(value, { stream: true })
                    const parsed = splitGameStreamLines(buffer)
                    buffer = parsed.rest
                    if (!parsed.lines.length) continue
                    setState((state) => ({ id: campaignId, value: parsed.lines.reduce(reduceGameStream, current(state)) }))
                    if (parsed.lines.some((line) => line.type === "live-end") || (first && parsed.lines.some((line) => line.type === "snapshot"))) refresh()
                    first = false
                }
            } catch (error) {
                if (error instanceof FatalStreamError) {
                    // Sem login, sem permissão ou fora da campanha: tentar de novo não resolve (a tela já trata pelo estado da mesa).
                    if (watchdog) clearTimeout(watchdog)
                    if (!disposed) setState((value) => ({ id: campaignId, value: { ...current(value), connected: false } }))
                    return
                }
                // queda ou aborto: tenta de novo abaixo
            }
            if (disposed) return
            if (watchdog) clearTimeout(watchdog)
            setState((value) => ({ id: campaignId, value: { ...current(value), connected: false } }))
            const wait = Math.min(MADDOX_GAME_STREAM_RETRY_MS * 2 ** failures, MADDOX_GAME_STREAM_RETRY_MAX_MS)
            failures += 1
            retry = setTimeout(() => void connect(), wait)
        }

        void connect()
        return () => {
            disposed = true
            controller?.abort()
            if (retry) clearTimeout(retry)
            if (watchdog) clearTimeout(watchdog)
        }
    }, [campaignId, enabled, queryClient])

    return state.id === campaignId ? state.value : MADDOX_GAME_STREAM_INITIAL
}
