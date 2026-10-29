"use client"

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react"
import { TextQuote } from "lucide-react"
import { toast } from "sonner"
import { MarkdownLineActionProvider, type MarkdownLineAction, type MarkdownLineContext } from "@/components/ui/opex/markdown-line-action"
import { insertQuote } from "@/lib/markdown/quote"

/**
 * Campos de resposta ao agente (mesa, fork, refinamento, Opex) e a ação "Citar no campo de resposta"
 * das saídas de IA da subárvore: o clique no fim de uma linha do `Markdown` insere `> linha` no campo
 * focado por último (ou no de maior prioridade). Sem campo, o host pode abrir um (`useReplyFallback`);
 * senão a linha vai para a área de transferência.
 */

export interface ReplyTarget {
    priority: number
    /** Momento do último foco (0 = nunca focado). */
    focusedAt: number
    insert: (text: string) => void
}

/** Abre um campo e insere a citação; devolve `false` quando não há campo a abrir. */
export type ReplyFallback = (text: string) => boolean

interface Registry {
    register: (target: ReplyTarget) => () => void
    registerFallback: (fallback: ReplyFallback) => () => void
}

const RegistryContext = createContext<Registry | null>(null)

/** Prioridades sugeridas: pergunta do agente > campo de mensagem/feedback > informações extras. */
export const REPLY_PRIORITY = { question: 40, message: 30, extra: 20, chat: 10 } as const

/** Escolhe o destino: o focado por último; sem foco, o de maior prioridade (o registrado depois desempata). */
export function pickReplyTarget(targets: ReplyTarget[]): ReplyTarget | null {
    let best: ReplyTarget | null = null
    for (const target of targets) {
        if (!best) best = target
        else if (target.focusedAt !== best.focusedAt ? target.focusedAt > best.focusedAt : target.priority >= best.priority) best = target
    }
    return best
}

/**
 * Texto citado: o trecho selecionado, quando houver, senão a linha. Linha (ou trecho de uma linha)
 * de código vira código inline.
 */
export const lineQuoteText = ({ text, code, selection }: Pick<MarkdownLineContext, "text" | "code" | "selection">) => {
    const quoted = selection?.text ?? text
    return code && !quoted.includes("\n") ? `\`${quoted.trim()}\`` : quoted
}

async function copyLine(text: string) {
    try {
        await navigator.clipboard.writeText(text)
        toast.success("Linha copiada: nenhum campo de resposta aberto")
    } catch {
        toast.error("Não foi possível copiar a linha")
    }
}

export function ReplyTargetProvider({ children }: { children: ReactNode }) {
    const targets = useRef(new Set<ReplyTarget>())
    const fallbacks = useRef<ReplyFallback[]>([])
    const registry = useMemo<Registry>(
        () => ({
            register: (target) => {
                targets.current.add(target)
                return () => void targets.current.delete(target)
            },
            registerFallback: (fallback) => {
                fallbacks.current.push(fallback)
                return () => {
                    fallbacks.current = fallbacks.current.filter((item) => item !== fallback)
                }
            },
        }),
        [],
    )
    const deliver = useCallback((text: string) => {
        const target = pickReplyTarget([...targets.current])
        if (target) return target.insert(text)
        for (const fallback of [...fallbacks.current].reverse()) if (fallback(text)) return
        void copyLine(text)
    }, [])
    const action = useMemo<MarkdownLineAction>(() => ({ icon: TextQuote, label: "Citar no campo de resposta", selectionLabel: "Citar o trecho no campo de resposta", onSelect: (context) => deliver(lineQuoteText(context)) }), [deliver])
    return (
        <RegistryContext.Provider value={registry}>
            <MarkdownLineActionProvider action={action}>{children}</MarkdownLineActionProvider>
        </RegistryContext.Provider>
    )
}

interface UseReplyTargetOptions {
    ref: RefObject<HTMLTextAreaElement | null>
    value: string
    setValue: (value: string) => void
    priority?: number
    enabled?: boolean
}

/** Registra um campo como destino das citações (no cursor; sem foco anterior, no fim). */
export function useReplyTarget({ ref, value, setValue, priority = REPLY_PRIORITY.message, enabled = true }: UseReplyTargetOptions) {
    const registry = useContext(RegistryContext)
    const latest = useRef({ value, setValue })
    useLayoutEffect(() => {
        latest.current = { value, setValue }
    })
    useEffect(() => {
        if (!registry || !enabled) return
        const element = ref.current
        const target: ReplyTarget = {
            priority,
            focusedAt: element && document.activeElement === element ? Date.now() : 0,
            insert: (text) => {
                const field = ref.current
                const current = latest.current.value
                const position = field && target.focusedAt ? field.selectionEnd : current.length
                const next = insertQuote(current, position, text)
                latest.current.setValue(next.value)
                requestAnimationFrame(() => {
                    if (!field) return
                    field.focus({ preventScroll: false })
                    field.setSelectionRange(next.cursor, next.cursor)
                })
            },
        }
        const onFocus = () => {
            target.focusedAt = Date.now()
        }
        element?.addEventListener("focus", onFocus)
        const unregister = registry.register(target)
        return () => {
            unregister()
            element?.removeEventListener("focus", onFocus)
        }
    }, [registry, enabled, priority, ref])
}

/** Ação do host quando nenhum campo está aberto (ex.: abrir o feedback da etapa já com a citação). */
export function useReplyFallback(fallback: ReplyFallback | null) {
    const registry = useContext(RegistryContext)
    const latest = useRef(fallback)
    useLayoutEffect(() => {
        latest.current = fallback
    })
    const enabled = fallback !== null
    useEffect(() => {
        if (!registry || !enabled) return
        return registry.registerFallback((text) => latest.current?.(text) ?? false)
    }, [registry, enabled])
}
