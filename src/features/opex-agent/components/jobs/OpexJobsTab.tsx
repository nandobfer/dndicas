"use client"

import { useMemo, useState } from "react"
import { useAuth } from "@/core/hooks/useAuth"
import { AnimatePresence, motion } from "framer-motion"
import { AlarmClock, Bot, Play } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { useCancelOpexJob, useOpexJobs, useOpexJobsRealtime, useSaveOpexJob } from "../../hooks/useOpexJobs"
import { useOpexRealtime, useOpexSessions } from "../../hooks/useOpexSessions"
import { useOpexSettings } from "../../hooks/useOpexSettings"
import { jobToInput, type OpexJobDto, type OpexJobFilter, type OpexJobOriginFilter } from "../../jobs"
import { OpexJobDialog, type OpexJobDialogMode } from "./OpexJobDialog"
import { OpexJobRow } from "./OpexJobRow"
import { OpexJobsFilters } from "./OpexJobsFilters"

const EMPTY_TEXT: Record<OpexJobFilter, string> = {
    scheduled: "Nenhum job agendado",
    finished: "Nenhum job executado nos últimos 30 dias",
    all: "Nenhum job ainda",
}

/**
 * Jobs do Agente Opex (aba "Jobs" de Integrações › Crons): prompts que o agente executa sozinho uma
 * vez (agora, daqui a um tempo ou numa data e hora), de todos os usuários. Lista ao vivo, com criar,
 * editar (os próprios), cancelar, reexecutar e abrir a sessão (as próprias).
 */
export function OpexJobsTab() {
    const [filter, setFilter] = useState<OpexJobFilter>("scheduled")
    const [origin, setOrigin] = useState<OpexJobOriginFilter>("all")
    const [dialog, setDialog] = useState<OpexJobDialogMode | null>(null)
    const [canceling, setCanceling] = useState<OpexJobDto | null>(null)
    const { userId } = useAuth()
    const jobs = useOpexJobs({ filter, origin })
    const sessions = useOpexSessions()
    const settings = useOpexSettings()
    const cancel = useCancelOpexJob()
    const rerun = useSaveOpexJob()
    useOpexJobsRealtime(true)
    useOpexRealtime(true)
    const titles = useMemo(() => new Map((sessions.data ?? []).map((session) => [session.id, session.title])), [sessions.data])
    const availability = settings.data?.availability
    const unavailable = availability && !availability.available ? (availability.reason ?? "O Agente Opex não está configurado") : null

    const titleOf = (job: OpexJobDto) => {
        const id = job.resultSessionId ?? job.sessionId
        return id && job.origin.userId === userId ? (titles.get(id) ?? null) : null
    }

    // Job de outro usuário: reexecução direta (mantém o usuário e a sessão do original).
    const onRerun = (job: OpexJobDto) => {
        if (job.origin.userId !== userId) rerun.mutate({ input: jobToInput(job, "rerun") })
        else setDialog({ type: "rerun", values: jobToInput(job, "rerun") })
    }

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Bot className="h-4 w-4 text-primary" aria-hidden /> Jobs do Agente Opex
                        </CardTitle>
                        <CardDescription>
                            Prompts que o agente executa sozinho, uma única vez, agendados pelos usuários ou pelo próprio agente. Jobs atrasados (app desligado ou agendador parado) rodam assim que possível. Histórico de 30
                            dias; horários de Brasília.
                        </CardDescription>
                    </div>
                    <Button type="button" className="gap-1.5" onClick={() => setDialog({ type: "create" })}>
                        <Play className="h-4 w-4" aria-hidden /> Executar job
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    <AnimatePresence initial={false}>
                        {unavailable && (
                            <motion.p
                                key="unavailable"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                                role="alert"
                            >
                                {unavailable}: os jobs ficam agendados e rodam (com atraso) quando o agente for configurado em Integrações › Provedores de IA › Agente Opex.
                            </motion.p>
                        )}
                    </AnimatePresence>
                    <OpexJobsFilters filter={filter} origin={origin} onFilter={setFilter} onOrigin={setOrigin} />
                    {jobs.isPending ? (
                        <div className="space-y-2" aria-busy="true">
                            {[0, 1, 2].map((item) => (
                                <Skeleton key={item} className="h-20 w-full" />
                            ))}
                        </div>
                    ) : jobs.isError ? (
                        <ErrorState title="Não foi possível carregar os jobs" onRetry={() => void jobs.refetch()} />
                    ) : jobs.data.length === 0 ? (
                        <EmptyState icon={AlarmClock} title={EMPTY_TEXT[filter]} description="Agende um prompt para o agente executar agora ou mais tarde." actionLabel="Executar job" onAction={() => setDialog({ type: "create" })} />
                    ) : (
                        <ul className="space-y-2">
                            <AnimatePresence initial={false}>
                                {jobs.data.map((job) => (
                                    <OpexJobRow
                                        key={job.id}
                                        job={job}
                                        sessionTitle={titleOf(job)}
                                        onEdit={(item) => setDialog({ type: "edit", id: item.id, values: jobToInput(item, "edit") })}
                                        onRerun={onRerun}
                                        rerunning={rerun.isPending && rerun.variables?.input.sourceJobId === job.id}
                                        onCancel={setCanceling}
                                    />
                                ))}
                            </AnimatePresence>
                        </ul>
                    )}
                </CardContent>
            </Card>
            <OpexJobDialog mode={dialog} onOpenChange={(open) => !open && setDialog(null)} />
            <AlertDialog open={Boolean(canceling)} onOpenChange={(open) => !open && setCanceling(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar o job?</AlertDialogTitle>
                        <AlertDialogDescription>&quot;{canceling?.title}&quot; não será executado. Ele fica no histórico como cancelado.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (canceling) cancel.mutate(canceling.id)
                                setCanceling(null)
                            }}
                        >
                            Cancelar job
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    )
}
