"use client"

import { useState } from "react"
import { Bot, GitPullRequest, MessageSquare, Play, CheckCircle2, XCircle, Clock } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/core/utils"
import type { FeedbackTimelineEvent, FeedbackTimelineEventType } from "../types/feedback.types"
import { FeedbackMarkdown } from "./feedback-markdown"

function iconForEvent(type: FeedbackTimelineEventType) {
    if (type === "comment_created" || type === "feedback_created") return MessageSquare
    if (type === "plan_created" || type === "agent_started" || type === "agent_progress") return Bot
    if (type === "pull_request_created" || type === "pull_request_updated") return GitPullRequest
    if (type === "agent_failed" || type === "deploy_failed") return XCircle
    if (type === "agent_completed" || type === "approved" || type === "merged" || type === "cleanup_completed") return CheckCircle2
    if (type === "plan_requested" || type === "implementation_requested") return Play
    return Clock
}

function titleForEvent(event: FeedbackTimelineEvent) {
    const titles: Partial<Record<FeedbackTimelineEventType, string>> = {
        feedback_created: "Feedback criado",
        comment_created: "Comentário",
        plan_requested: "Plano solicitado",
        plan_created: "Plano gerado",
        agent_started: "Agente iniciado",
        agent_completed: "Agente concluído",
        agent_failed: "Falha do agente",
    }

    return titles[event.type] ?? event.type.replaceAll("_", " ")
}

function getRunId(event: FeedbackTimelineEvent) {
    const runId = event.metadata?.runId
    return typeof runId === "string" ? runId : undefined
}

function isRunTerminalEvent(event: FeedbackTimelineEvent) {
    return event.type === "agent_completed" || event.type === "agent_failed"
}

function formatEventTime(date: string) {
    return format(new Date(date), "HH:mm", { locale: ptBR })
}

function shouldRenderMarkdown(event: FeedbackTimelineEvent) {
    return event.type === "plan_created" || event.type === "comment_created" || event.type === "agent_completed" || event.type === "agent_failed"
}

function TimelineMessage({ event }: { event: FeedbackTimelineEvent }) {
    if (shouldRenderMarkdown(event)) {
        return <FeedbackMarkdown className={event.type === "plan_created" ? "rounded-lg border border-white/10 bg-black/15 p-4" : undefined}>{event.message}</FeedbackMarkdown>
    }

    return <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/75">{event.message}</div>
}

function shouldCollapseEvent(event: FeedbackTimelineEvent) {
    return event.type === "plan_created" || event.message.length > 1200 || event.message.split("\n").length > 18
}

function CollapsibleTimelineMessage({ event }: { event: FeedbackTimelineEvent }) {
    const [isOpen, setIsOpen] = useState(event.type !== "plan_created")
    const shouldCollapse = shouldCollapseEvent(event)

    if (!shouldCollapse) return <TimelineMessage event={event} />

    const preview = event.message
        .replace(/[#*_`>-]/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(" · ")

    return (
        <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-white/10 bg-black/15">
            <button
                type="button"
                onClick={() => setIsOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-white/65 transition-colors hover:bg-white/[0.03]"
            >
                <span className="min-w-0 truncate">{event.type === "plan_created" ? "Plano de implementação" : "Conteúdo detalhado"}</span>
                <span className="shrink-0 text-white/40">{isOpen ? "Ocultar" : "Ver completo"}</span>
            </button>
            {!isOpen && <div className="border-t border-white/10 px-3 py-2 text-xs text-white/45 line-clamp-3">{preview || "Conteúdo disponível."}</div>}
            {isOpen && <div className="min-w-0 max-w-full overflow-hidden border-t border-white/10 p-3"><TimelineMessage event={event} /></div>}
        </div>
    )
}

function RunProgressPanel({ events, terminalEvent }: { events: FeedbackTimelineEvent[]; terminalEvent?: FeedbackTimelineEvent }) {
    const [isOpen, setIsOpen] = useState(false)
    const latestEvent = events.at(-1)
    const statusLabel = terminalEvent?.type === "agent_failed" ? "Falhou" : terminalEvent?.type === "agent_completed" ? "Concluído" : "Em execução"

    if (events.length === 0 && !terminalEvent) return null

    return (
        <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-lg border border-white/10 bg-black/20">
            <button
                type="button"
                onClick={() => setIsOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-white/65 transition-colors hover:bg-white/[0.03]"
            >
                <span className="min-w-0 truncate">
                    Progresso do OpenCode ({events.length} {events.length === 1 ? "atualização" : "atualizações"}) · {statusLabel}
                </span>
                <span className="shrink-0 text-white/40">{isOpen ? "Ocultar" : "Ver progresso"}</span>
            </button>

            {!isOpen && latestEvent && <div className="border-t border-white/10 px-3 py-2 text-xs text-white/45 line-clamp-2">{latestEvent.message}</div>}

            {isOpen && (
                <div className="max-h-72 min-w-0 max-w-full space-y-2 overflow-y-auto border-t border-white/10 p-3">
                    {events.map((event) => (
                        <div key={event.id} className="min-w-0 max-w-full overflow-hidden rounded-md bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                            <div className="mb-1 text-[10px] uppercase tracking-wide text-white/30">{formatEventTime(event.createdAt)}</div>
                            <FeedbackMarkdown compact>{event.message}</FeedbackMarkdown>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function FeedbackTimeline({ events, isLoading }: { events: FeedbackTimelineEvent[]; isLoading?: boolean }) {
    if (isLoading) return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">Carregando timeline...</div>

    if (events.length === 0) return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">Nenhum evento registrado ainda.</div>

    const progressByRunId = new Map<string, FeedbackTimelineEvent[]>()
    const terminalByRunId = new Map<string, FeedbackTimelineEvent>()

    for (const event of events) {
        const runId = getRunId(event)
        if (!runId) continue
        if (event.type === "agent_progress" || event.type === "status_changed") {
            const progressEvents = progressByRunId.get(runId) ?? []
            progressEvents.push(event)
            progressByRunId.set(runId, progressEvents)
        }
        if (isRunTerminalEvent(event)) terminalByRunId.set(runId, event)
    }

    const visibleEvents = events.filter((event) => event.type !== "agent_progress" && !(event.type === "status_changed" && getRunId(event)))

    return (
        <div className="min-w-0 max-w-full space-y-4 overflow-hidden">
            {visibleEvents.map((event) => {
                const Icon = iconForEvent(event.type)
                const isError = event.type.endsWith("failed") || event.type === "agent_failed"
                const isAgent = event.actorType === "agent" || event.actorType === "system"
                const runId = getRunId(event)
                const progressEvents = runId && event.type === "agent_started" ? progressByRunId.get(runId) ?? [] : []
                const terminalEvent = runId && event.type === "agent_started" ? terminalByRunId.get(runId) : undefined

                return (
                    <article key={event.id} className="relative min-w-0 max-w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className={cn("mt-0.5 rounded-full border p-2", isError ? "border-red-400/30 bg-red-500/10 text-red-300" : isAgent ? "border-blue-400/30 bg-blue-500/10 text-blue-300" : "border-white/10 bg-white/5 text-white/50")}>
                                <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h3 className="text-sm font-semibold text-white">{titleForEvent(event)}</h3>
                                        <p className="text-[11px] text-white/35">
                                            {event.actorName || event.actorType} em {format(new Date(event.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                        </p>
                                    </div>
                                </div>
                                <CollapsibleTimelineMessage event={event} />
                                {runId && event.type === "agent_started" && <RunProgressPanel events={progressEvents} terminalEvent={terminalEvent} />}
                            </div>
                        </div>
                    </article>
                )
            })}
        </div>
    )
}
