"use client"

import { useState } from "react"
import { History, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/ui/table"
import { useMigrationHistory } from "../../../hooks/useEngramind"
import type { MemoryMigrationDto } from "../../../types"
import { Section } from "../Section"
import { StepStatus } from "./StepStatus"

/** Histórico das campanhas (`maddox_campaign_memories`): espelhado sem curadoria, em lote idempotente. */
export function CampaignHistoryCard({ state }: { state: MemoryMigrationDto }) {
    const run = useMigrationHistory()
    const [confirming, setConfirming] = useState(false)
    const missing = state.campaigns.reduce((sum, row) => sum + Math.max(0, row.source - row.mirrored), 0)
    return (
        <Section
            title="Histórico das campanhas"
            testId="campaign-history"
            description="Espelha no Engramind as memórias já gravadas nas campanhas Maddox (fatos, eventos, locais, missões e relações), sem curadoria. Repetir não duplica."
            actions={
                <Button type="button" size="sm" disabled={state.steps.history.status === "running" || run.isPending} onClick={() => setConfirming(true)}>
                    {run.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <History className="mr-1.5 h-4 w-4" aria-hidden />} Espelhar histórico ({missing})
                </Button>
            }
        >
            <StepStatus step={state.steps.history} doneText="Histórico espelhado" onRetry={() => run.mutate()} retrying={run.isPending} />
            {state.campaigns.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
            ) : (
                <div className="overflow-x-auto rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Campanha</TableHead>
                                <TableHead className="text-right">No jogo</TableHead>
                                <TableHead className="text-right">No Engramind</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {state.campaigns.map((row) => (
                                <TableRow key={row.campaignId}>
                                    <TableCell>{row.name}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.source}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.mirrored}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Espelhar o histórico das campanhas?"
                description={`${missing} memória(s) de campanha vão para o Engramind. O jogo continua usando o MongoDB.`}
                confirmLabel="Espelhar"
                onConfirm={() => {
                    run.mutate()
                    setConfirming(false)
                }}
            />
        </Section>
    )
}
