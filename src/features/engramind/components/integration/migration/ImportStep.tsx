"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/ui/table"
import { useMigrationImport } from "../../../hooks/useEngramind"
import type { MemoryMigrationDto } from "../../../types"
import { formatDateTime, Section } from "../Section"
import { StepStatus } from "./StepStatus"

/** Etapa 5: importar as aprovadas (com confirmação; repetir não duplica) e o relatório origem × importadas × duplicadas. */
export function ImportStep({ state }: { state: MemoryMigrationDto }) {
    const run = useMigrationImport()
    const [confirming, setConfirming] = useState(false)
    const approved = state.items.filter((item) => item.review.status === "aprovada" && !item.imported).length
    const imported = state.items.filter((item) => item.imported).length
    const busy = Object.values(state.steps).some((step) => step.status === "running")
    return (
        <Section
            title="5. Importação"
            description="Importa no canal de cada lista, em lotes de limits.max_batch, com chave de idempotência: repetir não duplica e uma falha retoma do que faltou. As categorias novas aprovadas são criadas antes."
            actions={
                <Button type="button" disabled={!approved || busy || run.isPending} onClick={() => setConfirming(true)}>
                    {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Upload className="mr-2 h-4 w-4" aria-hidden />} Importar aprovadas ({approved})
                </Button>
            }
        >
            <StepStatus step={state.steps.import} onRetry={() => run.mutate()} retrying={run.isPending} />
            <AnimatePresence initial={false}>
                {state.firstCompletedAt && (
                    <motion.p key="done" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm" data-testid="migration-done">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        Migração concluída em {formatDateTime(state.firstCompletedAt)} · {imported} memória(s) importada(s)
                        {state.lastImportAt && state.lastImportAt !== state.firstCompletedAt ? ` · última importação em ${formatDateTime(state.lastImportAt)}` : ""}. Pode rodar de novo: as já importadas não duplicam.
                    </motion.p>
                )}
            </AnimatePresence>
            {state.categoryNotices.map((notice) => (
                <p key={notice} className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm">
                    {notice}
                </p>
            ))}
            {state.importReport.some((row) => row.imported || row.duplicates || row.approved) && (
                <div className="overflow-x-auto rounded-md border" data-testid="import-report">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Lista</TableHead>
                                <TableHead className="text-right">Origem</TableHead>
                                <TableHead className="text-right">Aprovadas</TableHead>
                                <TableHead className="text-right">Importadas</TableHead>
                                <TableHead className="text-right">Duplicadas</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {state.importReport.map((row) => (
                                <TableRow key={row.list}>
                                    <TableCell>{row.title}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.source}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.approved}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.imported}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.duplicates}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            {!approved && !state.firstCompletedAt && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Aprove memórias na revisão para importar.</p>}
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Importar as memórias aprovadas?"
                description={`${approved} memória(s) vão para o Engramind e passam a valer para os agentes. A coleção antiga agent_memories continua intacta.`}
                confirmLabel="Importar"
                onConfirm={() => {
                    run.mutate()
                    setConfirming(false)
                }}
            />
        </Section>
    )
}
