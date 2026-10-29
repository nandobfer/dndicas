"use client"

import { useEffect, useRef, useState } from "react"
import { useMaximizedFrame } from "../../hooks/useMaximizedFrame"
import { isSearchEscape } from "../DebugSearchBar"

/** Estado "maximizado" do painel de logs: moldura sobre `[data-dashboard-content]` e Esc para restaurar. */
export function useLogsMaximized(debugMode: boolean) {
    const logsCardRef = useRef<HTMLDivElement>(null)
    const [logsMaximized, setLogsMaximized] = useState(false)
    // Desligar o debug tira o painel: volta a "restaurado" (ajuste durante o render, sem efeito).
    if (!debugMode && logsMaximized) setLogsMaximized(false)
    useMaximizedFrame(logsCardRef, logsMaximized && debugMode)
    useEffect(() => {
        if (!logsMaximized) return
        const onKeyDown = (event: KeyboardEvent) => {
            // Esc com texto na busca é da busca (limpa); o seguinte restaura.
            if (event.key !== "Escape" || event.defaultPrevented || isSearchEscape(event)) return
            setLogsMaximized(false)
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [logsMaximized])

    return { logsCardRef, logsMaximized, setLogsMaximized }
}
