"use client"

import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Loader2, RotateCw, XCircle } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Progress } from "@/components/ui/opex/progress"
import type { MigrationStepDto } from "../../../types"

const fade = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }

/** Estado de uma etapa da migração: em andamento (com progresso), falha com "Tentar novamente" ou concluída. */
export function StepStatus({ step, doneText, onRetry, retrying }: { step: MigrationStepDto; doneText?: string; onRetry?: () => void; retrying?: boolean }) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            {step.status === "running" && (
                <motion.div key="running" {...fade} className="space-y-1.5" data-testid="migration-step-running">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Em andamento{step.progress ? ` (${step.progress.done}/${step.progress.total})` : "…"} — pode fechar a tela.
                    </p>
                    {step.progress && step.progress.total > 0 && <Progress value={(step.progress.done / step.progress.total) * 100} />}
                </motion.div>
            )}
            {step.status === "failed" && (
                <motion.div key="failed" {...fade} className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm" role="alert" data-testid="migration-step-failed">
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                    <span className="min-w-0 flex-1">{step.error ?? "A etapa falhou"}</span>
                    {onRetry && (
                        <Button type="button" size="sm" variant="outline" disabled={retrying} onClick={onRetry}>
                            <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Tentar novamente
                        </Button>
                    )}
                </motion.div>
            )}
            {step.status === "done" && doneText && (
                <motion.p key="done" {...fade} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> {doneText}
                </motion.p>
            )}
        </AnimatePresence>
    )
}
