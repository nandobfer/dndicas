"use client"

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { useEngramindSync, useSyncNow } from "../../hooks/useEngramind"
import { formatDateTime, Section } from "./Section"

/**
 * Aba Sincronização: o espelho das memórias das campanhas Maddox (jogo ↔ Engramind). O cron
 * `engramind-campaign-memories-sync` roda a cada 15 min; "Sincronizar agora" faz o mesmo na hora.
 */
export function SyncTab() {
    const sync = useEngramindSync()
    const run = useSyncNow()
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
                description="O jogo e o Diário usam o MongoDB; cada memória de campanha tem um espelho no Engramind, nos canais dndicas/maddox/campanhas/<campanha>/jogadores e …/mestre. O webhook aplica as mudanças da rede e o cron reconcilia a cada 15 minutos o que ficou para trás."
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
                        <dt className="text-muted-foreground">Pendentes de envio</dt>
                        <dd data-testid="sync-pending">{state.pending}</dd>
                    </div>
                    {state.lastResult && (
                        <div className="sm:col-span-2">
                            <dt className="text-muted-foreground">Resultado</dt>
                            <dd>
                                {state.lastResult.pushed} enviada(s) · {state.lastResult.pulled} recebida(s) · {state.lastResult.removed} removida(s) · {state.lastResult.failed} com falha
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
                    <ul className="divide-y rounded-md border text-sm" aria-label="Memórias com falha no envio">
                        {state.failures.map((item) => (
                            <li key={item.id} className="px-3 py-2">
                                <span className="font-medium">{item.title}</span>
                                {item.error && <span className="block text-muted-foreground">{item.error}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </Section>
            {(state.redator.supported === false || state.categoryWarnings.length > 0) && (
                <Section title="Avisos">
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
        </div>
    )
}
