"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { withBasePath } from "@/lib/base-path"
import type { IntegrationId } from "@/lib/integrations/catalog"
import type { IntegrationTestEvent } from "../types"
import { applyIntegrationHealth, INTEGRATIONS_QUERY_KEY } from "./useIntegrations"

export type TestStreamState = "idle" | "running" | "ok" | "error"

/** Converte um corpo NDJSON parcial em eventos, devolvendo o resto incompleto. */
export function parseNdjsonChunk<T = IntegrationTestEvent>(buffer: string): { events: T[]; rest: string } {
    const lines = buffer.split("\n")
    const rest = lines.pop() ?? ""
    const events: T[] = []
    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
            events.push(JSON.parse(trimmed) as T)
        } catch {
            /* linha corrompida: ignora */
        }
    }
    return { events, rest }
}

/**
 * Executa `POST /api/integrations/[id]/test` e entrega cada evento assim que chega, para o
 * modal anexar linhas ao terminal em tempo real.
 */
export function useIntegrationTestStream(id: IntegrationId, onEvent: (event: IntegrationTestEvent) => void) {
    const [state, setState] = useState<TestStreamState>("idle")
    const controllerRef = useRef<AbortController | null>(null)
    const onEventRef = useRef(onEvent)
    useEffect(() => {
        onEventRef.current = onEvent
    })
    const queryClient = useQueryClient()

    const start = useCallback(async () => {
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setState("running")
        // Bolinha azul girando já no clique, sem esperar o evento do servidor.
        applyIntegrationHealth(queryClient, id, { checking: true })

        let final: TestStreamState = "error"
        try {
            const res = await fetch(withBasePath(`/api/integrations/${id}/test`), { method: "POST", signal: controller.signal })
            if (!res.ok || !res.body) {
                const body = (await res.json().catch(() => ({}))) as { error?: string }
                onEventRef.current({
                    type: "result",
                    ok: false,
                    latencyMs: 0,
                    message: body.error ?? `Não foi possível iniciar o teste (HTTP ${res.status})`,
                    ts: new Date().toISOString(),
                })
                return
            }
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            for (;;) {
                const { value, done } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const parsed = parseNdjsonChunk(buffer)
                buffer = parsed.rest
                for (const event of parsed.events) {
                    if (event.type === "result") {
                        final = event.ok ? "ok" : "error"
                        // O servidor já gravou este status: a tabela reflete sem esperar refetch.
                        applyIntegrationHealth(queryClient, id, {
                            status: event.ok ? "ok" : "error",
                            latencyMs: event.latencyMs,
                            message: event.message,
                            checkedAt: event.ts,
                            source: "manual",
                            checking: false,
                        })
                    }
                    onEventRef.current(event)
                }
            }
        } catch (error) {
            if ((error as Error).name === "AbortError") {
                final = "idle"
                return
            }
            onEventRef.current({
                type: "result",
                ok: false,
                latencyMs: 0,
                message: "Conexão com o servidor interrompida durante o teste",
                ts: new Date().toISOString(),
            })
        } finally {
            if (controllerRef.current === controller) {
                setState(final)
                controllerRef.current = null
            }
            // Cancelado, erro HTTP ou conexão caída: não deixa a bolinha girando.
            applyIntegrationHealth(queryClient, id, { checking: false })
            void queryClient.invalidateQueries({ queryKey: [INTEGRATIONS_QUERY_KEY] })
        }
    }, [id, queryClient])

    const cancel = useCallback(() => {
        controllerRef.current?.abort()
        controllerRef.current = null
        setState("idle")
    }, [])

    return { state, start, cancel }
}
