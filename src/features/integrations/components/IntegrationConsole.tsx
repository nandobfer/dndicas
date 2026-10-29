"use client"

import "@xterm/xterm/css/xterm.css"
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import type { Terminal } from "@xterm/xterm"
import type { FitAddon } from "@xterm/addon-fit"
import type { ISearchOptions, SearchAddon } from "@xterm/addon-search"
import { cn } from "@/lib/utils"

export type SearchDirection = "next" | "previous"

/** Resultado da busca: `index` base 0 (-1 = acima do limite de destaques ou sem seleção). */
export interface ConsoleSearchResults {
    index: number
    count: number
}

export interface IntegrationConsoleHandle {
    /** Anexa linhas já formatadas (podem conter cores ANSI). */
    writeLines(lines: string[]): void
    clear(): void
    /** Busca `term` (sem diferenciar maiúsculas) e rola até a ocorrência. `false` = nada encontrado. */
    search(term: string, direction: SearchDirection): boolean
    /** Remove destaques e encerra a busca ativa. */
    clearSearch(): void
}

interface IntegrationConsoleProps {
    className?: string
    /** Linha mostrada enquanto nada foi escrito. */
    placeholder?: string
    /** Contagem/posição da busca, sempre que mudar. */
    onSearchResults?: (results: ConsoleSearchResults) => void
}

const THEME = {
    background: "#0b1020",
    foreground: "#d6deeb",
    cursor: "#0b1020",
    selectionBackground: "#1d3b53",
    black: "#1b2233",
    red: "#ff6b6b",
    green: "#4ade80",
    yellow: "#facc15",
    blue: "#60a5fa",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: "#e2e8f0",
    brightBlack: "#64748b",
}

/** Máximo de ocorrências destacadas (padrão do addon). Acima disso o índice vem como -1. */
export const SEARCH_HIGHLIGHT_LIMIT = 1000

/** Destaques da busca. O addon exige cores `#RRGGBB`. */
export const SEARCH_OPTIONS: ISearchOptions = {
    caseSensitive: false,
    decorations: {
        matchBackground: "#854d0e",
        matchOverviewRuler: "#854d0e",
        activeMatchBackground: "#c2410c",
        activeMatchBorder: "#facc15",
        activeMatchColorOverviewRuler: "#facc15",
    },
}

/**
 * Terminal somente leitura (xterm.js) para logs de teste e de debug das integrações.
 *
 * Carregado apenas no navegador: o import do xterm acontece dentro do efeito. Linhas que
 * chegam antes de o terminal abrir ficam em fila e são escritas assim que ele monta.
 *
 * Busca (`@xterm/addon-search`): procura no buffer do terminal (até o `scrollback`), sem
 * filtrar linhas; destaca todas as ocorrências e a atual. Com busca ativa, linhas novas
 * recalculam destaques e contagem mantendo a ocorrência atual (`incremental`).
 */
export const IntegrationConsole = forwardRef<IntegrationConsoleHandle, IntegrationConsoleProps>(
    function IntegrationConsole({ className, placeholder, onSearchResults }, ref) {
        const containerRef = useRef<HTMLDivElement>(null)
        const termRef = useRef<Terminal | null>(null)
        const fitRef = useRef<FitAddon | null>(null)
        const searchRef = useRef<SearchAddon | null>(null)
        const activeTerm = useRef<string | null>(null)
        const pending = useRef<string[]>([])
        const hasContent = useRef(false)
        const onResultsRef = useRef(onSearchResults)
        useEffect(() => {
            onResultsRef.current = onSearchResults
        })

        /** Reaplica a busca ativa sem avançar: atualiza destaques/contagem após linhas novas. */
        const refreshSearch = () => {
            const term = activeTerm.current
            if (!term || !searchRef.current) return
            searchRef.current.findNext(term, { ...SEARCH_OPTIONS, incremental: true })
        }

        useImperativeHandle(ref, () => ({
            writeLines(lines) {
                if (lines.length === 0) return
                const term = termRef.current
                if (!term) {
                    pending.current.push(...lines)
                    return
                }
                if (!hasContent.current) {
                    term.clear()
                    term.write("\x1b[2K\r")
                    hasContent.current = true
                }
                lines.forEach((line, i) => {
                    // A escrita do xterm é assíncrona: recalcula a busca depois da última linha.
                    if (i === lines.length - 1 && activeTerm.current) term.writeln(line, refreshSearch)
                    else term.writeln(line)
                })
            },
            clear() {
                pending.current = []
                hasContent.current = false
                searchRef.current?.clearDecorations()
                termRef.current?.clear()
                termRef.current?.write("\x1b[2K\r")
            },
            search(term, direction) {
                const addon = searchRef.current
                const text = term.trim()
                if (!addon || !text) return false
                activeTerm.current = text
                return direction === "previous" ? addon.findPrevious(text, SEARCH_OPTIONS) : addon.findNext(text, SEARCH_OPTIONS)
            },
            clearSearch() {
                activeTerm.current = null
                searchRef.current?.clearDecorations()
                termRef.current?.clearSelection()
                onResultsRef.current?.({ index: -1, count: 0 })
            },
        }))

        useEffect(() => {
            let disposed = false
            let observer: ResizeObserver | null = null

            void (async () => {
                const [{ Terminal }, { FitAddon }, { SearchAddon }] = await Promise.all([
                    import("@xterm/xterm"),
                    import("@xterm/addon-fit"),
                    import("@xterm/addon-search"),
                ])
                if (disposed || !containerRef.current) return
                const term = new Terminal({
                    disableStdin: true,
                    cursorBlink: false,
                    cursorStyle: "bar",
                    convertEol: true,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    fontSize: 12,
                    lineHeight: 1.25,
                    scrollback: 5000,
                    theme: THEME,
                    // Destaques da busca usam a API de decorações.
                    allowProposedApi: true,
                })
                const fit = new FitAddon()
                const search = new SearchAddon({ highlightLimit: SEARCH_HIGHLIGHT_LIMIT })
                term.loadAddon(fit)
                term.loadAddon(search)
                search.onDidChangeResults(({ resultIndex, resultCount }) =>
                    onResultsRef.current?.({ index: resultIndex, count: resultCount }),
                )
                term.open(containerRef.current)
                fit.fit()
                termRef.current = term
                fitRef.current = fit
                searchRef.current = search

                if (pending.current.length > 0) {
                    hasContent.current = true
                    for (const line of pending.current) term.writeln(line)
                    pending.current = []
                } else if (placeholder) {
                    term.write(`\x1b[90m${placeholder}\x1b[0m`)
                }

                observer = new ResizeObserver(() => {
                    try {
                        fitRef.current?.fit()
                    } catch {
                        /* container oculto durante animação */
                    }
                })
                observer.observe(containerRef.current)
            })()

            return () => {
                disposed = true
                observer?.disconnect()
                termRef.current?.dispose()
                termRef.current = null
                fitRef.current = null
                searchRef.current = null
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

        return (
            <div
                className={cn("overflow-hidden rounded-lg border border-slate-800 bg-[#0b1020] p-2 shadow-inner", className)}
                role="log"
                aria-live="polite"
                aria-label="Console da integração"
            >
                <div ref={containerRef} className="h-full w-full" />
            </div>
        )
    },
)
