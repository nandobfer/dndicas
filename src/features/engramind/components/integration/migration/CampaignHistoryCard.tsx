"use client"

import { useState } from "react"
import { Download, History, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/ui/table"
import { useMigrationHistory } from "../../../hooks/useEngramind"
import type { MemoryMigrationDto } from "../../../types"
import { formatDateTime, Section } from "../Section"
import { StepStatus } from "./StepStatus"

/**
 * Memórias antigas das campanhas (`maddox_campaign_memories`): backup, mover para o Engramind, conferir e
 * apagar as cópias do banco do dndicas, campanha a campanha (só apaga o que conferiu).
 */
export function CampaignHistoryCard({ state }: { state: MemoryMigrationDto }) {
    const run = useMigrationHistory()
    const [confirming, setConfirming] = useState(false)
    const remaining = state.campaigns.reduce((sum, row) => sum + row.source, 0)
    return (
        <Section
            title="Memórias das campanhas"
            testId="campaign-history"
            description="As memórias das campanhas agora existem só no Engramind. As antigas, ainda no banco do dndicas, não aparecem no Diário nem para o narrador até serem movidas. Mover gera um backup, importa, confere cada uma pela chave e apaga do banco só as que conferiram."
            actions={
                <div className="flex flex-wrap gap-2">
                    {state.campaignBackup && (
                        <Button asChild type="button" size="sm" variant="outline">
                            <a href="/api/engramind/migration/campaigns" download>
                                <Download className="mr-1.5 h-4 w-4" aria-hidden /> Baixar backup
                            </a>
                        </Button>
                    )}
                    <Button type="button" size="sm" disabled={remaining === 0 || state.steps.history.status === "running" || run.isPending} onClick={() => setConfirming(true)}>
                        {run.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <History className="mr-1.5 h-4 w-4" aria-hidden />} Mover memórias ({remaining})
                    </Button>
                </div>
            }
        >
            <StepStatus step={state.steps.history} doneText="Memórias das campanhas movidas" onRetry={() => run.mutate()} retrying={run.isPending} />
            {state.campaignBackup && (
                <p className="text-xs text-muted-foreground" data-testid="campaign-backup">
                    Backup de {formatDateTime(state.campaignBackup.createdAt)}: {state.campaignBackup.count} memória(s), SHA-256 {state.campaignBackup.sha256.slice(0, 12)}…
                </p>
            )}
            {state.campaigns.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
            ) : (
                <div className="overflow-x-auto rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Campanha</TableHead>
                                <TableHead className="text-right">No banco</TableHead>
                                <TableHead className="text-right">Importadas</TableHead>
                                <TableHead className="text-right">Conferidas</TableHead>
                                <TableHead className="text-right">Apagadas</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {state.campaigns.map((row) => (
                                <TableRow key={row.campaignId}>
                                    <TableCell>
                                        {row.name}
                                        {row.error && <span className="block text-xs text-destructive">{row.error}</span>}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{row.source}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.imported}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.verified}</TableCell>
                                    <TableCell className="text-right tabular-nums">{row.deleted}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Mover as memórias das campanhas?"
                description={`Isto move ${remaining} memória(s) das campanhas para o Engramind e apaga as cópias do banco do dndicas. Um backup é gerado antes, e só é apagado o que conferir no Engramind.`}
                confirmLabel="Mover e apagar"
                onConfirm={() => {
                    run.mutate()
                    setConfirming(false)
                }}
            />
        </Section>
    )
}
