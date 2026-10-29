"use client"

import { createContext, useContext, useMemo, useState, type MouseEvent, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/opex/popover"
import { quoteOf } from "@/lib/markdown/lines"
import { cn } from "@/lib/utils"
import type { MarkdownLineAction, MarkdownLineContext } from "./markdown-line-action"

interface LineRender {
    action: MarkdownLineAction
    source: string
}

/** Ação e texto-fonte do `Markdown` em renderização (para cada `MarkdownLine` montar a sua linha). */
export const LineRenderContext = createContext<LineRender | null>(null)

interface MarkdownLineProps {
    line: number
    endLine: number
    code: boolean
    children: ReactNode
}

/** Uma linha lógica do Markdown com o botão da ação no fim (hover/foco; fixo quando há badge). */
export function MarkdownLine({ line, endLine, code, children }: MarkdownLineProps) {
    const render = useContext(LineRenderContext)
    const [open, setOpen] = useState(false)
    const source = render?.source ?? ""
    const context = useMemo<MarkdownLineContext>(() => ({ line, endLine, code, text: quoteOf(source, line, endLine, { code }) }), [source, line, endLine, code])
    if (!render) return <>{children}</>
    const { action } = render
    const count = action.count?.(line) ?? 0
    const flash = action.flash && action.flash.line === line ? action.flash.key : null
    const Icon = action.icon
    const pinned = count > 0 || open
    // Ao sair da linha o botão some com atraso (e é alcançável durante ele): dá tempo de levar o mouse até o ícone.
    const visible = pinned
        ? "text-primary opacity-100"
        : "invisible opacity-0 delay-300 group-hover/line:visible group-hover/line:opacity-100 group-hover/line:delay-0 focus-visible:visible focus-visible:delay-0 [@media(hover:none)]:visible [@media(hover:none)]:opacity-60"

    const button = (
        <button
            type="button"
            aria-label={count > 0 ? `${action.label} (${count})` : action.label}
            title={action.label}
            onClick={(event: MouseEvent) => {
                event.stopPropagation()
                if (!action.renderPopover) action.onSelect?.(context)
            }}
            className={cn(
                "relative inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-[opacity,visibility] duration-150 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                // Sem badge: sobreposto logo após o texto; a faixa `before` cobre o vão até o texto (o hover não cai).
                count > 0 ? "relative" : "absolute left-0.5 top-1/2 -translate-y-1/2 bg-background before:absolute before:-left-2 before:inset-y-0 before:w-2.5 before:content-['']",
                visible,
            )}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <AnimatePresence initial={false}>
                {count > 0 && (
                    <motion.span
                        key="badge"
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.4, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-sans text-[9px] font-semibold leading-none text-primary-foreground"
                    >
                        <AnimatedNumber value={count} duration={0.2} />
                    </motion.span>
                )}
            </AnimatePresence>
        </button>
    )

    return (
        <span
            data-md-line={line}
            data-md-line-end={endLine}
            data-md-code={code ? "" : undefined}
            data-md-anchor={action.anchorId ? `${action.anchorId}:${line}` : undefined}
            className={cn("group/line relative scroll-mt-24 rounded-sm", count > 0 && "bg-primary/5")}
        >
            <AnimatePresence>
                {flash !== null && (
                    <motion.span
                        key={flash}
                        aria-hidden
                        className="pointer-events-none absolute -inset-x-1 inset-y-0 rounded-sm bg-primary/25"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 1, 0] }}
                        transition={{ duration: 1.6, times: [0, 0.15, 0.6, 1] }}
                    />
                )}
            </AnimatePresence>
            {children}
            {/* Sem comentários o botão não ocupa espaço (âncora de largura zero): o texto quebra como sem a ação. */}
            <span className={cn("select-none", count > 0 ? "ml-1 inline-flex align-middle" : "relative inline-block h-[1em] w-0 align-baseline")} data-md-line-action>
                {action.renderPopover ? (
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>{button}</PopoverTrigger>
                        <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-3" onClick={(event) => event.stopPropagation()}>
                            {open && action.renderPopover({ ...context, close: () => setOpen(false) })}
                        </PopoverContent>
                    </Popover>
                ) : (
                    button
                )}
            </span>
        </span>
    )
}
