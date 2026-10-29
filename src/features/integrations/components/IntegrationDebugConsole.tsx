"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Maximize2, Minimize2, PlugZap, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/opex/tooltip"
import { cn } from "@/lib/utils"
import { getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import { formatLogLine, type IntegrationLogLine } from "@/lib/integrations/log-format"
import { useIntegrationDebugLogs, type DebugStreamMode } from "../hooks/useIntegrationDebugLogs"
import { useIntegrationTestStream } from "../hooks/useIntegrationTestStream"
import { DebugSearchBar } from "./DebugSearchBar"
import {
    IntegrationConsole,
    SEARCH_HIGHLIGHT_LIMIT,
    type ConsoleSearchResults,
    type IntegrationConsoleHandle,
    type SearchDirection,
} from "./IntegrationConsole"

interface IntegrationDebugConsoleProps {
    integrationId: IntegrationId
    /** Título à esquerda da barra (uma linha); os controles ficam à direita, alinhados a ele. */
    title: ReactNode
    /** Texto auxiliar em linha própria, abaixo da barra. */
    description?: ReactNode
    /** Ações extras após o Atualizar (ex.: Fechar do modal). */
    actions?: ReactNode
    className?: string
    consoleClassName?: string
    /** Estado de maximização (controlado pelo pai, que sabe qual elemento maximizar). */
    maximized?: boolean
    /** Sem ele, o botão Maximizar não aparece. */
    onMaximizedChange?: (maximized: boolean) => void
    /** Mostra só as linhas deste escopo (`data.scope`, ex.: uma central de desenvolvimento). */
    scope?: string
    /** Teste próprio no lugar do teste de conexão da integração (as linhas chegam pelo log). */
    onTest?: () => Promise<unknown>
}

export function RealtimeIndicator({ mode }: { mode: DebugStreamMode }) {
    const live = mode === "realtime"
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <motion.span
                        key={mode}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                            live
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground",
                        )}
                        tabIndex={0}
                    >
                        <span className="relative flex h-2 w-2">
                            {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                            <span className={cn("relative inline-flex h-2 w-2 rounded-full", live ? "bg-emerald-500" : "bg-slate-400")} />
                        </span>
                        {live ? "Tempo real" : "Sem tempo real"}
                    </motion.span>
                </TooltipTrigger>
                <TooltipContent>
                    {live
                        ? "Novos eventos aparecem automaticamente"
                        : "Tempo real indisponível: use Atualizar para buscar novos eventos"}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

/** Espera a gravação em lote dos últimos eventos de debug antes de buscar sem Pusher. */
export const TEST_REFRESH_DELAY_MS = 800

/**
 * Terminal com os logs de debug da integração. Barra superior: título à esquerda; à direita,
 * o indicador de tempo real, Testar conexão e Atualizar (busca os eventos gravados desde o
 * último recebido — funciona com ou sem Pusher).
 *
 * O teste roda no próprio terminal, sem modal: com o debug ligado, cada etapa do teste já é
 * gravada como evento de debug (`[teste] ...`), então as linhas chegam pelo mesmo fluxo dos
 * demais eventos. Os eventos do stream são ignorados aqui para não duplicar; ao terminar,
 * busca o que faltar (sem Pusher é a única via).
 */
export function IntegrationDebugConsole({
    integrationId,
    title,
    description,
    actions,
    className,
    consoleClassName,
    maximized = false,
    onMaximizedChange,
    scope,
    onTest,
}: IntegrationDebugConsoleProps) {
    const def = getIntegrationDef(integrationId)
    const consoleRef = useRef<IntegrationConsoleHandle>(null)
    const [searchResults, setSearchResults] = useState<ConsoleSearchResults | null>(null)

    const search = useCallback((term: string, direction: SearchDirection) => {
        const found = consoleRef.current?.search(term, direction)
        // Sem ocorrência o addon pode não emitir evento: garante o "0/0".
        if (found === false) setSearchResults({ index: -1, count: 0 })
    }, [])
    const clearSearch = useCallback(() => {
        consoleRef.current?.clearSearch()
        setSearchResults(null)
    }, [])

    const onLines = useCallback(
        (lines: IntegrationLogLine[], reset: boolean) => {
            if (reset) consoleRef.current?.clear()
            consoleRef.current?.writeLines(lines.map((line) => formatLogLine(line, { tag: def.name.toUpperCase() })))
        },
        [def.name],
    )

    const { mode, loading, error, refresh } = useIntegrationDebugLogs(integrationId, { enabled: true, onLines, scope })

    const refreshRef = useRef(refresh)
    useEffect(() => {
        refreshRef.current = refresh
    })
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }, [])

    const ignoreStreamEvent = useCallback(() => {}, [])
    const { state: testState, start: startTest } = useIntegrationTestStream(integrationId, ignoreStreamEvent)
    const [customTesting, setCustomTesting] = useState(false)
    const testing = testState === "running" || customTesting

    const runTest = useCallback(async () => {
        if (onTest) {
            setCustomTesting(true)
            await onTest().catch(() => undefined)
            setCustomTesting(false)
        } else {
            await startTest()
        }
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => void refreshRef.current(), TEST_REFRESH_DELAY_MS)
    }, [onTest, startTest])

    return (
        <div className={cn("flex min-h-0 flex-col gap-3", className)}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate">{title}</div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <RealtimeIndicator mode={mode} />
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => void runTest()}
                                    disabled={testing}
                                    aria-label="Testar conexão"
                                >
                                    <motion.span
                                        className="flex"
                                        animate={testing ? { rotate: 360 } : { rotate: 0 }}
                                        transition={testing ? { repeat: Infinity, duration: 1, ease: "linear" } : { duration: 0.2 }}
                                    >
                                        <PlugZap className="h-4 w-4" />
                                    </motion.span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{testing ? "Testando conexão..." : "Testar conexão"}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => void refresh()}
                                    disabled={loading}
                                    aria-label="Atualizar"
                                >
                                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Atualizar</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    {onMaximizedChange && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => onMaximizedChange(!maximized)}
                                        aria-label={maximized ? "Restaurar" : "Maximizar"}
                                        aria-pressed={maximized}
                                    >
                                        {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{maximized ? "Restaurar" : "Maximizar"}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {actions}
                </div>
            </div>
            {description && <div className="-mt-1.5 text-sm text-muted-foreground">{description}</div>}
            <AnimatePresence>
                {error && (
                    <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-destructive"
                    >
                        {error}
                    </motion.p>
                )}
            </AnimatePresence>
            <DebugSearchBar
                onSearch={search}
                onClear={clearSearch}
                results={searchResults}
                highlightLimit={SEARCH_HIGHLIGHT_LIMIT}
            />
            <IntegrationConsole
                ref={consoleRef}
                className={cn("min-h-[320px] flex-1", consoleClassName)}
                placeholder="Aguardando eventos de debug..."
                onSearchResults={setSearchResults}
            />
        </div>
    )
}
