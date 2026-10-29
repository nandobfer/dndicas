"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import type { MarkdownSelection } from "@/lib/markdown/selection"

export type { MarkdownSelection }

/** Linha lógica clicada no `Markdown` (números do texto-fonte, 1 = primeira). */
export interface MarkdownLineContext {
    line: number
    endLine: number
    /** Texto para citar: sem marcadores de bloco (linha de código fica como está). */
    text: string
    /** A linha é de um bloco de código. */
    code: boolean
    /** Trecho selecionado (botão da seleção ou clique num trecho sublinhado); `line` é a última linha coberta. */
    selection?: MarkdownSelection
}

/** Trecho já comentado de uma linha (sublinhado no texto; clicar abre a ação com ele). */
export interface MarkdownHighlight {
    key: string
    selection: Pick<MarkdownSelection, "text" | "lines" | "occurrence"> & Partial<Pick<MarkdownSelection, "startLine">>
}

/**
 * Ação opcional no fim de cada linha lógica do `Markdown`: botão que aparece no hover/foco (e fica
 * fixo quando há badge). `renderPopover` abre um popover no botão; senão o clique chama `onSelect`.
 */
export interface MarkdownLineAction {
    icon: LucideIcon
    /** Nome acessível do botão (pt-BR). */
    label: string
    /** Badge numérico da linha (0 esconde). */
    count?: (line: number) => number
    onSelect?: (context: MarkdownLineContext) => void
    renderPopover?: (context: MarkdownLineContext & { close: () => void }) => ReactNode
    /** Prefixo do `data-md-anchor` (`{anchorId}:{linha}`), usado para rolar até a linha. */
    anchorId?: string
    /** Destaca a linha (e o trecho, quando houver) com um flash (troque `key` para repetir). */
    flash?: { line: number; key: number; selection?: MarkdownHighlight["selection"] | null } | null
    /** Nome acessível do botão que aparece ao selecionar texto; `false` desliga a ação na seleção. */
    selectionLabel?: string | false
    /** Trechos a sublinhar na linha âncora `line`. */
    highlights?: (line: number) => MarkdownHighlight[]
}

/**
 * Ação herdada pelos `Markdown` da subárvore (ex.: citar a linha no campo do agente em todas as
 * mensagens da timeline). A prop `lineAction` do componente tem precedência; `null` desliga.
 */
export const MarkdownLineActionContext = createContext<MarkdownLineAction | null>(null)

export function MarkdownLineActionProvider({ action, children }: { action: MarkdownLineAction | null; children: ReactNode }) {
    return <MarkdownLineActionContext.Provider value={action}>{children}</MarkdownLineActionContext.Provider>
}

export const useInheritedLineAction = () => useContext(MarkdownLineActionContext)
