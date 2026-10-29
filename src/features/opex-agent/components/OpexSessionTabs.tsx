"use client"

import { useEffect, useRef } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { MessageSquarePlus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { OPEX_DEFAULT_TITLE } from "../constants"
import { OPEX_DRAFT_TAB } from "../hooks/useOpexTabs"
import type { OpexSessionDto } from "../types"
import { OpexStatusDot } from "./OpexStatusDot"

interface OpexSessionTabsProps {
    open: string[]
    active: string | null
    sessions: Map<string, OpexSessionDto>
    onActivate: (id: string) => void
    onClose: (id: string) => void
}

/** Abas das sessões abertas (rolagem horizontal); fechar a aba não exclui a sessão. */
export function OpexSessionTabs({ open, active, sessions, onActivate, onClose }: OpexSessionTabsProps) {
    const reduceMotion = useReducedMotion() ?? false
    const stripRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const selected = stripRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
        selected?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" })
    }, [active, reduceMotion])

    const tabs = [...open.map((id) => ({ id, session: sessions.get(id) ?? null })), ...(active === OPEX_DRAFT_TAB ? [{ id: OPEX_DRAFT_TAB, session: null }] : [])]

    return (
        <div ref={stripRef} role="tablist" aria-label="Sessões abertas" className="flex min-w-0 items-end gap-0.5 overflow-x-auto px-2 [scrollbar-width:none]">
            <AnimatePresence initial={false}>
                {tabs.map(({ id, session }) => {
                    const selected = id === active
                    const title = id === OPEX_DRAFT_TAB ? OPEX_DEFAULT_TITLE : (session?.title ?? "Carregando…")
                    return (
                        <motion.div
                            key={id}
                            layout={reduceMotion ? false : "position"}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, width: 0, transition: { duration: 0.15 } }}
                            transition={{ duration: 0.18 }}
                            className={cn("group relative flex max-w-[200px] shrink-0 items-center rounded-t-md", selected ? "bg-background" : "hover:bg-muted/40")}
                        >
                            <button
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                onClick={() => onActivate(id)}
                                title={session?.summary || title}
                                className={cn("flex min-w-0 items-center gap-1.5 py-2 pl-3 pr-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/70", selected ? "font-medium text-foreground" : "text-muted-foreground")}
                            >
                                {id === OPEX_DRAFT_TAB ? <MessageSquarePlus className="h-3 w-3 shrink-0 text-primary" aria-hidden /> : <OpexStatusDot status={session?.status ?? "idle"} />}
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.span key={title} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="truncate">
                                        {title}
                                    </motion.span>
                                </AnimatePresence>
                            </button>
                            {id !== OPEX_DRAFT_TAB && (
                                <button
                                    type="button"
                                    onClick={() => onClose(id)}
                                    aria-label={`Fechar a aba ${title}`}
                                    className="mr-1 rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                                >
                                    <X className="h-3 w-3" aria-hidden />
                                </button>
                            )}
                            {selected && <motion.span layoutId={reduceMotion ? undefined : "opex-tab-indicator"} className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" aria-hidden />}
                        </motion.div>
                    )
                })}
            </AnimatePresence>
        </div>
    )
}
