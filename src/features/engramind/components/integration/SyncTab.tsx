"use client"

import { useState } from "react"
import { AlertTriangle, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { useDiscardPendingWrite, useEngramindSync, useSyncNow } from "../../hooks/useEngramind"
import { formatDateTime, Section } from "./Section"

/**
 * Aba Sincronização: a rotina das memórias das campanhas Maddox. O Engramind é a única fonte; o cron
 * `engramind-campaign-memories-sync` (15 min) e "Sincronizar agora" garantem os canais de cada campanha,
 * arquivam/restauram conforme o status e entregam a fila de gravações que a rede não aceitou na hora.
 */
export function SyncTab() {
    const sync = useEngramindSync()
    const run = useSyncNow()
    const discard = useDiscardPendingWrite()
    const [discarding, setDiscarding] = useState<{ id: string; title: string } | null>(null)
    if (sync.isLoading) return <Skeleton className="h-40 w-full" data-testid="sync-skeleton" />
    if (sync.error || !sync.data)
        return (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
                {apiErrorMessage(sync.error, "Não foi possível carregar a sincronização.")}{" "}
                <Button type="button" size="sm" variant="outline" onClick={() => void sync.refetch()}>
                    Tentar novamente
                </Button>
            </p>
        )
    const state = sync.data
    const busy = run.isPending || state.running
    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Memórias das campanhas"
                testId="engramind-sync"
                description="As memórias das campanhas existem só no Engramind, nos canais dndicas/maddox/campanhas/<campanha>/jogadores e …/mestre. Quando a rede não aceita uma gravação do narrador, ela espera na fila e entra na próxima sincronização (a cada 15 minutos)."
                actions={
                    <Button type="button" size="sm" disabled={!state.configured || busy} onClick={() => run.mutate()}>
                        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />} Sincronizar agora
                    </Button>
                }
            >
                {!state.configured && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Configure a conexão com o Engramind para sincronizar.</p>}
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-muted-foreground">Última execução</dt>
                        <dd>{state.lastRunAt ? formatDateTime(state.lastRunAt) : "Nunca"}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Gravações na fila</dt>
                        <dd data-testid="sync-pending">{state.pending}</dd>
                    </div>
                    {state.lastResult && (
                        <div className="sm:col-span-2">
                            <dt className="text-muted-foreground">Resultado</dt>
                            <dd>
                                {state.lastResult.delivered} entregue(s) · {state.lastResult.failed} recusada(s) · {state.lastResult.remaining} na fila
                            </dd>
                        </div>
                    )}
                </dl>
                {state.lastError && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm" role="alert">
                        Última execução falhou: {state.lastError}
                    </p>
                )}
                {state.failures.length > 0 && (
                    <ul className="divide-y rounded-md border text-sm" aria-label="Gravações com falha">
                        {state.failures.map((item) => (
                            <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
                                <span>
                                    <span className="font-medium">{item.title}</span>
                                    {item.error && <span className="block text-muted-foreground">{item.failed ? `Recusada: ${item.error}` : item.error}</span>}
                                </span>
                                {item.failed && (
                                    <Button type="button" size="sm" variant="outline" onClick={() => setDiscarding({ id: item.id, title: item.title })}>
                                        <Trash2 className="mr-1.5 h-4 w-4" aria-hidden /> Descartar
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </Section>
            {(state.redator.supported === false || state.categoryWarnings.length > 0 || state.legacyCampaignMemories > 0) && (
                <Section title="Avisos">
                    {state.legacyCampaignMemories > 0 && (
                        <p className="flex items-start gap-2 text-sm" data-testid="sync-legacy-warning">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" aria-hidden /> {state.legacyCampaignMemories} memória(s) antiga(s) de campanha ainda estão no banco do dndicas e não aparecem no Diário nem no narrador: mova-as na aba Migração.
                        </p>
                    )}
                    {state.redator.supported === false && state.redator.message && (
                        <p className="flex items-start gap-2 text-sm" data-testid="sync-redator-warning">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" aria-hidden /> {state.redator.message}
                        </p>
                    )}
                    {state.categoryWarnings.map((warning) => (
                        <p key={warning} className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" aria-hidden /> {warning}
                        </p>
                    ))}
                </Section>
            )}
            <ConfirmDialog
                open={discarding !== null}
                onOpenChange={(open) => !open && setDiscarding(null)}
                title="Descartar a gravação?"
                description={`A memória "${discarding?.title ?? ""}" não será gravada no Engramind.`}
                confirmLabel="Descartar"
                onConfirm={() => {
                    if (discarding) discard.mutate(discarding.id)
                    setDiscarding(null)
                }}
            />
        </div>
    )
}
