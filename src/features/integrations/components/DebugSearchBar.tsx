"use client"

import { useState, type KeyboardEvent } from "react"
import { ChevronDown, ChevronUp, Search, X } from "lucide-react"
import { Input } from "@/components/ui/opex/input"
import { cn } from "@/lib/utils"
import type { ConsoleSearchResults, SearchDirection } from "./IntegrationConsole"
import { IconAction } from "./IconAction"

interface DebugSearchBarProps {
    /** Busca e rola até a ocorrência (delegado ao terminal). */
    onSearch: (term: string, direction: SearchDirection) => void
    onClear: () => void
    /** `null` enquanto nenhuma busca foi feita. */
    results: ConsoleSearchResults | null
    highlightLimit: number
}

/**
 * `true` quando o Esc veio do campo de busca com texto — esse Esc é da busca (limpar), e quem
 * escuta o Esc antes do React (ex.: Radix Dialog, em captura) deve ignorá-lo.
 */
export function isSearchEscape(event: Pick<Event, "target">): boolean {
    const target = event.target
    return (
        typeof HTMLInputElement !== "undefined" &&
        target instanceof HTMLInputElement &&
        target.hasAttribute("data-debug-search") &&
        target.value.length > 0
    )
}

/** Texto do contador: "5/11", "0/0" ou "1000+" quando passa do limite de destaques. */
export function formatSearchCounter(results: ConsoleSearchResults | null, highlightLimit: number): string {
    if (!results) return ""
    if (results.count === 0) return "0/0"
    if (results.index < 0) return results.count >= highlightLimit ? `${highlightLimit}+` : `–/${results.count}`
    return `${results.index + 1}/${results.count}`
}

/**
 * Busca nos logs do terminal. Não filtra linhas: Enter procura a próxima ocorrência
 * (Shift+Enter, a anterior), rola até ela e destaca todas. Setas navegam; Esc limpa.
 * Sem diferenciar maiúsculas de minúsculas.
 */
export function DebugSearchBar({ onSearch, onClear, results, highlightLimit }: DebugSearchBarProps) {
    const [term, setTerm] = useState("")
    const [searchedTerm, setSearchedTerm] = useState<string | null>(null)
    const stale = searchedTerm !== null && term.trim() !== searchedTerm
    const hasResults = !stale && (results?.count ?? 0) > 0
    const notFound = !stale && searchedTerm !== null && results?.count === 0

    const run = (direction: SearchDirection) => {
        const text = term.trim()
        if (!text) return
        setSearchedTerm(text)
        onSearch(text, direction)
    }

    const clear = () => {
        setTerm("")
        setSearchedTerm(null)
        onClear()
    }

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault()
            run(event.shiftKey ? "previous" : "next")
        } else if (event.key === "Escape" && term) {
            // Com texto, o Esc só limpa a busca: não restaura o terminal nem fecha o modal.
            event.preventDefault()
            event.stopPropagation()
            clear()
        }
    }

    const counter = stale ? "" : formatSearchCounter(searchedTerm ? results : null, highlightLimit)

    return (
        <div className="flex items-center gap-1" role="search">
            <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Buscar nos logs..."
                    aria-label="Buscar nos logs"
                    data-debug-search=""
                    className={cn("h-8 pl-8 text-sm", counter ? "pr-24" : term ? "pr-8" : undefined)}
                />
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    {counter && (
                        <span
                            className={cn("text-xs tabular-nums", notFound ? "text-destructive" : "text-muted-foreground")}
                            aria-live="polite"
                            data-testid="search-counter"
                        >
                            {counter}
                            {notFound && <span className="sr-only"> Nenhuma ocorrência</span>}
                        </span>
                    )}
                    {term && (
                        <button
                            type="button"
                            onClick={clear}
                            aria-label="Limpar busca"
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>
            <IconAction
                label="Ocorrência anterior (Shift+Enter)"
                icon={<ChevronUp className="h-4 w-4" />}
                onClick={() => run("previous")}
                disabled={!hasResults}
            />
            <IconAction
                label="Próxima ocorrência (Enter)"
                icon={<ChevronDown className="h-4 w-4" />}
                onClick={() => run("next")}
                disabled={!hasResults}
            />
        </div>
    )
}
