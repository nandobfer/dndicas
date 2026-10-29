"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Fuse from "fuse.js"
import { AlertCircle, CheckCircle2, ChevronDown, Clock, Cog, Globe, Loader2, Play, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/opex/alert-dialog"
import { Button } from "@/components/ui/opex/button"
import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"
import { Switch } from "@/components/ui/opex/switch"
import { OptionTabs } from "@/components/ui/opex/option-tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/opex/tooltip"
import { cn } from "@/lib/utils"
import { CRON_JOB_SCOPE_OPTIONS, jobSupportsScope, type CronJobConfig, type CronJobScope } from "@/lib/integrations/catalog"
import { formatLogTimestamp } from "@/lib/integrations/log-format"
import { integrationErrorMessage, useRunCronJob } from "../hooks/useIntegrations"
import type { CronJobStateDto } from "../types"
import { ScheduleEditor } from "./ScheduleEditor"

interface CronJobsEditorProps {
    value: CronJobConfig[]
    onChange: (value: CronJobConfig[]) => void
    states?: CronJobStateDto[]
    disabled?: boolean
    /** Rotinas como estão salvas: "Executar agora" roda a versão salva, então exige rotina sem alterações. */
    savedJobs?: CronJobConfig[]
    /** `integrations.crons.run`. */
    canRun?: boolean
    /** Rotinas que não aparecem (integração dona desativada); a edição preserva as escondidas. */
    hiddenJobIds?: ReadonlySet<string>
}

/** Motivo para "Executar agora" estar indisponível, ou `null` quando pode executar. */
export function runNowBlockReason(
    job: CronJobConfig,
    savedJobs: CronJobConfig[],
    canRun: boolean,
    running: boolean,
): string | null {
    if (!canRun) return "Sem permissão para executar rotinas"
    if (running) return "A rotina já está em execução"
    const saved = savedJobs.find((candidate) => candidate.id === job.id)
    if (!saved || JSON.stringify(saved) !== JSON.stringify(job)) return "Salve as alterações antes de executar"
    return null
}

function RunNowButton({ label, blockReason, pending, onClick }: { label: string; blockReason: string | null; pending: boolean; onClick: () => void }) {
    const button = (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onClick}
            disabled={pending || blockReason !== null}
            aria-label={`Executar agora: ${label}`}
        >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            Executar agora
        </Button>
    )
    if (!blockReason || pending) return button
    // Botão desabilitado não dispara eventos de ponteiro: o tooltip fica no wrapper.
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex" data-testid="run-now-blocked">
                        {button}
                    </span>
                </TooltipTrigger>
                <TooltipContent>{blockReason}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

function slugify(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
}

function formatDate(iso?: string): string {
    return iso ? formatLogTimestamp(iso).slice(0, 16) : "—"
}

function JobStatus({ state, enabled, manualRunning }: { state?: CronJobStateDto; enabled: boolean; manualRunning?: boolean }) {
    if (state?.running || manualRunning) {
        return (
            <span className="flex items-center gap-1 text-xs text-sky-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Executando
            </span>
        )
    }
    if (!enabled) {
        return (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                Desativada
                {state?.lastRunAt && <LastRun state={state} />}
            </span>
        )
    }
    return (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Próxima: {formatDate(state?.nextRunAt)}
            </span>
            {state?.lastRunAt && <LastRun state={state} />}
        </span>
    )
}

function LastRun({ state }: { state: CronJobStateDto }) {
    return (
        <span
            className={cn("flex items-center gap-1", state.lastStatus === "error" ? "text-destructive" : "text-emerald-600")}
            title={state.lastError ?? undefined}
        >
            {state.lastStatus === "error" ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Última: {formatDate(state.lastRunAt)}
            {state.lastDurationMs != null && ` · ${state.lastDurationMs} ms`}
        </span>
    )
}

/**
 * Lista das rotinas do agendador. Rotinas HTTP chamam uma rota da própria aplicação; rotinas
 * internas (ex.: verificação de status) só têm agendamento e podem ser desativadas.
 *
 * Cada rotina nasce **recolhida** — cabeçalho com nome, "Executar agora" e o switch de status, além
 * da linha com a próxima e a última execução. Ao expandir, aparecem os campos de configuração. A
 * busca filtra a exibição sem mexer no rascunho: editar/excluir agem sobre a rotina original.
 */
export function CronJobsEditor({ value, onChange, states = [], disabled, savedJobs = [], canRun = false, hiddenJobIds }: CronJobsEditorProps) {
    const stateById = new Map(states.map((state) => [state.jobId, state]))
    const runJob = useRunCronJob()
    const [confirmJob, setConfirmJob] = useState<CronJobConfig | null>(null)
    const [runningJobId, setRunningJobId] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
    const [term, setTerm] = useState("")

    const shown = useMemo(() => (hiddenJobIds?.size ? value.filter((job) => !hiddenJobIds.has(job.id)) : value), [hiddenJobIds, value])
    const fuse = useMemo(() => new Fuse(shown, { keys: ["label", "id", "path"], threshold: 0.35, ignoreLocation: true }), [shown])
    const visible = term.trim() ? fuse.search(term.trim()).map((result) => result.item) : shown

    const executeNow = async (job: CronJobConfig) => {
        setConfirmJob(null)
        setRunningJobId(job.id)
        try {
            const result = await runJob.mutateAsync(job.id)
            if (result.ok) toast.success(`"${job.label}" executada (${result.message}, ${result.durationMs} ms)`)
            else toast.error(`"${job.label}" falhou: ${result.message}`)
        } catch (error) {
            toast.error(integrationErrorMessage(error, `Não foi possível executar "${job.label}"`))
        } finally {
            setRunningJobId(null)
        }
    }

    // Identidade por referência: editar/excluir age na rotina certa mesmo com a lista filtrada.
    const updateJob = (job: CronJobConfig, patch: Partial<CronJobConfig>) =>
        onChange(value.map((candidate) => (candidate === job ? { ...candidate, ...patch } : candidate)))
    const removeJob = (job: CronJobConfig) => onChange(value.filter((candidate) => candidate !== job))

    const toggleExpanded = (id: string) =>
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    const addJob = () => {
        let id = "nova-rotina"
        for (let n = 2; value.some((job) => job.id === id); n++) id = `nova-rotina-${n}`
        setExpanded((prev) => new Set(prev).add(id))
        onChange([
            ...value,
            { id, label: "Nova rotina", kind: "http", path: "/api/routines/run", schedule: { type: "daily", time: "00:00" }, enabled: false },
        ])
    }

    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar rotina" aria-label="Buscar rotina" className="pl-9" />
            </div>

            {visible.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhuma rotina encontrada</p>
            ) : (
                <AnimatePresence initial={false}>
                    {visible.map((job) => {
                        const isOpen = expanded.has(job.id)
                        const isNew = !stateById.has(job.id) && job.id.startsWith("nova-rotina")
                        return (
                            <motion.div
                                key={job.id}
                                layout
                                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, height: 0, marginTop: 0, scale: 0.98 }}
                                transition={{ duration: 0.22 }}
                                className={cn("rounded-lg border p-4 transition-opacity", !job.enabled && "opacity-70")}
                            >
                                <div className="flex items-center gap-2">
                                    {job.kind === "http" ? (
                                        <Globe className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                                    ) : (
                                        <Cog className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => toggleExpanded(job.id)}
                                        aria-expanded={isOpen}
                                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                    >
                                        <span className="truncate font-medium">{job.label}</span>
                                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
                                    </button>
                                    <RunNowButton
                                        label={job.label}
                                        pending={runningJobId === job.id}
                                        blockReason={runNowBlockReason(job, savedJobs, canRun, Boolean(stateById.get(job.id)?.running))}
                                        onClick={() => setConfirmJob(job)}
                                    />
                                    <Switch
                                        checked={job.enabled}
                                        onCheckedChange={(enabled) => updateJob(job, { enabled })}
                                        disabled={disabled}
                                        aria-label={`Ativar ${job.label}`}
                                    />
                                </div>

                                <div className="mt-2 pl-6">
                                    <JobStatus state={stateById.get(job.id)} enabled={job.enabled} manualRunning={runningJobId === job.id} />
                                </div>

                                <AnimatePresence initial={false}>
                                    {isOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.2, ease: "easeOut" }}
                                            className="overflow-hidden"
                                        >
                                            <div className="space-y-4 pt-4">
                                                {job.kind === "http" && (
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor={`cron-name-${job.id}`} className="text-xs">
                                                            Nome
                                                        </Label>
                                                        <Input
                                                            id={`cron-name-${job.id}`}
                                                            aria-label="Nome da rotina"
                                                            value={job.label}
                                                            onChange={(event) => {
                                                                const label = event.target.value
                                                                if (isNew) {
                                                                    const nextId = slugify(label) || job.id
                                                                    setExpanded((prev) => {
                                                                        const next = new Set(prev)
                                                                        next.delete(job.id)
                                                                        next.add(nextId)
                                                                        return next
                                                                    })
                                                                    updateJob(job, { label, id: nextId })
                                                                } else {
                                                                    updateJob(job, { label })
                                                                }
                                                            }}
                                                            disabled={disabled}
                                                            className="font-medium"
                                                        />
                                                    </div>
                                                )}

                                                {job.kind === "http" && (
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor={`cron-path-${job.id}`} className="text-xs">
                                                            Caminho
                                                        </Label>
                                                        <Input
                                                            id={`cron-path-${job.id}`}
                                                            value={job.path ?? ""}
                                                            onChange={(event) => updateJob(job, { path: event.target.value })}
                                                            placeholder="/api/routines/..."
                                                            className="font-mono text-xs"
                                                            disabled={disabled}
                                                        />
                                                    </div>
                                                )}

                                                <ScheduleEditor value={job.schedule} onChange={(schedule) => updateJob(job, { schedule })} disabled={disabled} />
                                                {jobSupportsScope(job.id) && (
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs">Escopo</Label>
                                                        <OptionTabs<CronJobScope>
                                                            aria-label={`Escopo de ${job.label}`}
                                                            options={CRON_JOB_SCOPE_OPTIONS}
                                                            value={job.scope ?? "pending"}
                                                            onChange={(scope) => updateJob(job, { scope })}
                                                            disabled={disabled}
                                                        />
                                                        <p className="text-xs text-muted-foreground">
                                                            “Só pendentes” marca apenas as tarefas sem tags ou com título/descrição alterados; “Todas” regenera as tags de todo o escopo.
                                                        </p>
                                                    </div>
                                                )}

                                                {job.kind === "http" && (
                                                    <div className="flex justify-end">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="gap-1.5 text-destructive hover:text-destructive"
                                                            onClick={() => removeJob(job)}
                                                            disabled={disabled}
                                                            aria-label={`Remover ${job.label}`}
                                                        >
                                                            <Trash2 className="h-4 w-4" /> Remover rotina
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )
                    })}
                </AnimatePresence>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addJob} disabled={disabled}>
                <Plus className="mr-1.5 h-4 w-4" /> Adicionar rotina
            </Button>

            <AlertDialog open={confirmJob !== null} onOpenChange={(open) => !open && setConfirmJob(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Executar “{confirmJob?.label}” agora?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A rotina salva será executada imediatamente, com os mesmos efeitos da execução agendada. A próxima
                            execução agendada não muda.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => confirmJob && void executeNow(confirmJob)}>Executar agora</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
