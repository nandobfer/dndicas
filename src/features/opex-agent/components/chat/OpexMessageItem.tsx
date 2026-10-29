"use client"

import { memo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlarmClock, AlertTriangle, Bot, Brain, ChevronRight, CircleSlash, RotateCw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Markdown } from "@/components/ui/opex/markdown"
import { mentionsToMarkdown } from "../../mentions"
import { cn } from "@/lib/utils"
import type { OpexMessageDto, OpexPart } from "../../types"
import { OpexMessageFiles } from "./OpexMessageFiles"
import { OpexToolCard } from "./OpexToolCard"

const bubble = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: "easeOut" as const } }

export function UserMessage({ message }: { message: OpexMessageDto }) {
    if (message.kind === "confirmation") {
        return (
            <motion.div {...bubble} className="flex justify-center pb-3">
                <span className="inline-flex max-w-[90%] items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">{message.text}</span>
                </span>
            </motion.div>
        )
    }
    return (
        <motion.div {...bubble} className="flex flex-col items-end gap-1.5 pb-3">
            {message.kind === "job" && (
                <span className="inline-flex max-w-[85%] items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary" data-testid="opex-job-badge">
                    <AlarmClock className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">Job agendado{message.job?.title ? ` · ${message.job.title}` : ""}</span>
                </span>
            )}
            <OpexMessageFiles files={message.files ?? []} />
            {message.text && <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm border border-primary/30 bg-primary/15 px-3.5 py-2 text-sm text-foreground">{message.text}</div>}
        </motion.div>
    )
}

interface AssistantMessageProps {
    parts: OpexPart[]
    /** Resposta ao vivo: cursor piscando e "Pensando…". */
    streaming?: boolean
    thinking?: boolean
    message?: OpexMessageDto | null
    onDecide?: (actionId: string, decision: "confirm" | "cancel") => void
    deciding?: boolean
    onRetry?: () => void
}

function AssistantMessageView({ parts, streaming, thinking, message, onDecide, deciding, onRetry }: AssistantMessageProps) {
    const empty = parts.length === 0
    return (
        <motion.div {...bubble} className="flex gap-2.5 pb-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/40" aria-hidden>
                <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
                {parts.map((part, index) => {
                    const last = index === parts.length - 1
                    if (part.type === "text") return <StreamingText key={index} text={part.text} cursor={Boolean(streaming && last && !thinking)} />
                    if (part.type === "reasoning") return <Reasoning key={index} text={part.text} active={Boolean(streaming && last && thinking)} />
                    return <OpexToolCard key={part.id} part={part} onDecide={onDecide} deciding={deciding} />
                })}
                <AnimatePresence>{streaming && (empty || (thinking && parts.at(-1)?.type !== "reasoning")) && <ThinkingIndicator key="thinking" />}</AnimatePresence>
                {message && <MessageFooter message={message} onRetry={onRetry} />}
            </div>
        </motion.div>
    )
}

export const AssistantMessage = memo(AssistantMessageView)

function StreamingText({ text, cursor }: { text: string; cursor: boolean }) {
    const reduceMotion = useReducedMotion() ?? false
    return (
        <div className="relative">
            <Markdown>{mentionsToMarkdown(text)}</Markdown>
            {cursor && (
                <motion.span
                    aria-hidden
                    className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 rounded-sm bg-primary align-middle"
                    animate={reduceMotion ? undefined : { opacity: [1, 0.2, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                />
            )}
        </div>
    )
}

function ThinkingIndicator() {
    const reduceMotion = useReducedMotion() ?? false
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((dot) => (
                    <motion.span
                        key={dot}
                        className="h-1.5 w-1.5 rounded-full bg-primary"
                        animate={reduceMotion ? undefined : { opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
                        transition={{ duration: 1, repeat: Infinity, delay: dot * 0.15 }}
                    />
                ))}
            </span>
            Pensando…
        </motion.div>
    )
}

function Reasoning({ text, active }: { text: string; active: boolean }) {
    const [open, setOpen] = useState(false)
    if (!text.trim() && !active) return null
    return (
        <div className="rounded-md border border-dashed bg-muted/20 text-xs">
            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-muted-foreground hover:text-foreground">
                <Brain className={cn("h-3.5 w-3.5", active && "text-primary")} aria-hidden />
                <span className="flex-1">{active ? "Pensando…" : "Raciocínio"}</span>
                <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} aria-hidden>
                    <ChevronRight className="h-3.5 w-3.5" />
                </motion.span>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div key="reasoning" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        <p className="max-h-60 overflow-auto whitespace-pre-wrap border-t px-2.5 py-2 text-muted-foreground">{text || "…"}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function formatSeconds(ms: number): string {
    return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`
}

function MessageFooter({ message, onRetry }: { message: OpexMessageDto; onRetry?: () => void }) {
    const tokens = message.usage?.totalTokens
    return (
        <div className="space-y-1.5">
            {message.status !== "complete" && (
                <div className={cn("flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs", message.status === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "bg-muted/40 text-muted-foreground")} role={message.status === "error" ? "alert" : undefined}>
                    {message.status === "error" ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <CircleSlash className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                    <span className="min-w-0 flex-1 break-words">{message.status === "error" ? message.error ?? "A resposta falhou" : "Resposta interrompida"}</span>
                    {onRetry && (
                        <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={onRetry}>
                            <RotateCw className="h-3 w-3" aria-hidden /> Tentar novamente
                        </Button>
                    )}
                </div>
            )}
            <p className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground/80">
                {message.model && <span className="font-mono">{message.model}</span>}
                {tokens != null && <span>{tokens.toLocaleString("pt-BR")} tokens</span>}
                {message.durationMs != null && <span>{formatSeconds(message.durationMs)}</span>}
            </p>
        </div>
    )
}
