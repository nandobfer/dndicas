"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Bot, History, Maximize2, MessageSquarePlus, Minimize2, X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/opex/tooltip"
import { cn } from "@/lib/utils"
import { useOpexView } from "../hooks/useOpexSettings"
import { useOpexSessions } from "../hooks/useOpexSessions"
import { OPEX_DRAFT_TAB, useOpexTabs } from "../hooks/useOpexTabs"
import { OpexChat } from "./chat/OpexChat"
import { OpexDraftChat } from "./chat/OpexDraftChat"
import { OpexSessionTabs } from "./OpexSessionTabs"
import { OpexSessionsPanel } from "./OpexSessionsPanel"

interface OpexPanelProps {
    maximized: boolean
    onToggleMaximize?: () => void
    onClose: () => void
    /** Sessão a ativar ao abrir (ex.: "Abrir sessão" de um job). */
    focusSessionId?: string | null
    onFocused?: () => void
}

/** Conteúdo do popover: cabeçalho, abas das sessões, lista de sessões e o chat da aba ativa. */
export function OpexPanel({ maximized, onToggleMaximize, onClose, focusSessionId, onFocused }: OpexPanelProps) {
    const sessions = useOpexSessions()
    const view = useOpexView()
    const { tabs, ready, open, close, activate, startDraft } = useOpexTabs(sessions.data)
    const [listOpen, setListOpen] = useState(false)
    const [handoff, setHandoff] = useState<{ sessionId: string; text: string } | null>(null)
    const byId = useMemo(() => new Map((sessions.data ?? []).map((session) => [session.id, session])), [sessions.data])
    const modelLabel = view.data?.modelLabel ?? null
    const active = tabs.active ?? OPEX_DRAFT_TAB

    useEffect(() => {
        if (!focusSessionId || !ready || !sessions.data) return
        if (sessions.data.some((session) => session.id === focusSessionId)) open(focusSessionId)
        onFocused?.()
    }, [focusSessionId, ready, sessions.data, open, onFocused])

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex items-center gap-2.5 border-b bg-gradient-to-r from-primary/15 via-transparent to-transparent px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_16px_-4px_hsl(var(--primary))]" aria-hidden>
                    <Bot className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                        Agente Opex
                    </p>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.p key={modelLabel ?? "none"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="truncate text-[11px] text-muted-foreground">
                            {modelLabel ?? "Sem modelo configurado"}
                        </motion.p>
                    </AnimatePresence>
                </div>
                <HeaderButton label={listOpen ? "Fechar a lista de sessões" : "Todas as sessões"} onClick={() => setListOpen((value) => !value)} active={listOpen}>
                    <History className="h-4 w-4" />
                </HeaderButton>
                <HeaderButton
                    label="Nova sessão"
                    onClick={() => {
                        startDraft()
                        setListOpen(false)
                    }}
                >
                    <MessageSquarePlus className="h-4 w-4" />
                </HeaderButton>
                {onToggleMaximize && (
                    <HeaderButton label={maximized ? "Restaurar tamanho" : "Maximizar"} onClick={onToggleMaximize}>
                        {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </HeaderButton>
                )}
                <HeaderButton label="Fechar" onClick={onClose}>
                    <X className="h-4 w-4" />
                </HeaderButton>
            </header>

            <div className="border-b bg-muted/30 pt-1.5">
                {ready && <OpexSessionTabs open={tabs.open} active={active} sessions={byId} onActivate={activate} onClose={close} />}
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col bg-background">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={active} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.16 }} className="flex min-h-0 flex-1 flex-col">
                        {!ready ? null : active === OPEX_DRAFT_TAB ? (
                            <OpexDraftChat
                                onCreated={(sessionId, text) => {
                                    if (text) setHandoff({ sessionId, text })
                                    open(sessionId)
                                }}
                            />
                        ) : (
                            <OpexChat sessionId={active} initialText={handoff?.sessionId === active ? handoff.text : undefined} />
                        )}
                    </motion.div>
                </AnimatePresence>
                <AnimatePresence>
                    {listOpen && (
                        <OpexSessionsPanel
                            activeId={active}
                            onOpen={(id) => {
                                open(id)
                                setListOpen(false)
                            }}
                            onNew={() => {
                                startDraft()
                                setListOpen(false)
                            }}
                            onClose={() => setListOpen(false)}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

function HeaderButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={onClick}
                        aria-label={label}
                        aria-pressed={active}
                        className={cn("rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70", active && "bg-muted text-foreground")}
                    >
                        {children}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
