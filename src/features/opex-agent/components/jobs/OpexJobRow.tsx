"use client"

import { useAuth } from "@/core/hooks/useAuth"
import { motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertCircle, Ban, Bot, UserRound, ExternalLink, Loader2, Pencil, RotateCw, User } from "lucide-react"
import { Badge, type BadgeProps } from "@/components/ui/opex/badge"
import { Button } from "@/components/ui/opex/button"
import { cn } from "@/lib/utils"
import { OPEX_JOB_STATUS_LABELS, formatJobDelay, type OpexJobDto, type OpexJobStatus } from "../../jobs"
import { requestOpenOpexSession } from "../../open-session"

const STATUS_VARIANT: Record<OpexJobStatus, NonNullable<BadgeProps["variant"]>> = {
    scheduled: "outline",
    running: "default",
    done: "success",
    error: "destructive",
    awaiting_confirmation: "warning",
    canceled: "secondary",
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })

export function formatJobDate(iso: string): string {
    return dateFormatter.format(new Date(iso))
}

interface OpexJobRowProps {
    job: OpexJobDto
    sessionTitle: string | null
    onEdit: (job: OpexJobDto) => void
    onCancel: (job: OpexJobDto) => void
    onRerun: (job: OpexJobDto) => void
    /** Reexecução direta em andamento (job do portal). */
    rerunning?: boolean
}

function CreatedBy({ job, mine }: { job: OpexJobDto; mine: boolean }) {
    if (job.createdBy === "agent") {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Agendado pelo Agente Opex">
                <Bot className="h-3 w-3" aria-hidden /> pelo agente
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="h-3 w-3" aria-hidden /> {mine ? "por você" : "pelo usuário"}
        </span>
    )
}

/**
 * Um job: título, situação, origem, horário, sessão, prompt e as ações cabíveis. Job de outro
 * usuário: o administrador cancela e reexecuta, mas não edita nem abre a sessão (ela é do usuário).
 */
export function OpexJobRow({ job, sessionTitle, onEdit, onCancel, onRerun, rerunning = false }: OpexJobRowProps) {
    const scheduled = job.status === "scheduled"
    const { userId } = useAuth()
    const fromPortal = job.origin.userId !== userId
    const delay = formatJobDelay(job.delayMs)
    const sessionId = job.resultSessionId ?? job.sessionId
    const sessionLabel = fromPortal ? (sessionId ? "do usuário" : "nova") : (sessionTitle ?? (sessionId ? "excluída" : "nova"))
    return (
        <motion.li
            layout="position"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="rounded-lg border bg-card/60 p-3"
            data-testid="opex-job-row"
        >
            <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="truncate">{job.title}</span>
                        <Badge variant={STATUS_VARIANT[job.status]} className="gap-1 text-[10px]">
                            {job.status === "running" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                            {OPEX_JOB_STATUS_LABELS[job.status]}
                        </Badge>
                        {fromPortal && (
                            <Badge variant="outline" className="gap-1 text-[10px]" title="Job de outro usuário">
                                <UserRound className="h-3 w-3" aria-hidden /> {job.origin.userName}
                            </Badge>
                        )}
                        <CreatedBy job={job} mine={!fromPortal} />
                    </p>
                    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                            {scheduled ? "Executa" : "Previsto"} {formatJobDate(job.runAt)}
                            {scheduled && ` (${formatDistanceToNow(new Date(job.runAt), { addSuffix: true, locale: ptBR })})`}
                        </span>
                        {job.finishedAt && job.status !== "canceled" && <span>Terminou {formatJobDate(job.finishedAt)}</span>}
                        {delay && <span className="text-primary">Atraso de {delay}</span>}
                        <span className="truncate">Sessão: {sessionLabel}</span>
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                    {scheduled && (
                        <>
                            {!fromPortal && (
                                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onEdit(job)} aria-label={`Editar: ${job.title}`}>
                                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                                </Button>
                            )}
                            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-destructive" onClick={() => onCancel(job)} aria-label={`Cancelar: ${job.title}`}>
                                <Ban className="h-3.5 w-3.5" aria-hidden /> Cancelar
                            </Button>
                        </>
                    )}
                    {!scheduled && job.status !== "running" && (
                        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={rerunning} onClick={() => onRerun(job)} aria-label={`Reexecutar: ${job.title}`}>
                            {rerunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCw className="h-3.5 w-3.5" aria-hidden />} Reexecutar
                        </Button>
                    )}
                    {!fromPortal && job.resultSessionId && sessionTitle && (
                        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => requestOpenOpexSession(job.resultSessionId!)} aria-label={`Abrir sessão: ${job.title}`}>
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir sessão
                        </Button>
                    )}
                </div>
            </div>
            <p className={cn("mt-2 line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground")} title={job.prompt}>
                {job.prompt}
            </p>
            {job.error && (
                <p className="mt-2 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert">
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {job.error}
                </p>
            )}
        </motion.li>
    )
}
