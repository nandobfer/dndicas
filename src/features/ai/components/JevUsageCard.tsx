"use client"

import { useMemo } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { BarChart3, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { DATE_PRESET, PresetDateRangeFilter } from "@/components/ui/opex/preset-date-range-filter"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { FilterGroup } from "@/components/list/FilterGroup"
import { urlFilterCodecs, useUrlFilters } from "@/hooks/useUrlFilters"
import { apiErrorMessage } from "@/lib/api"
import { formatJevCost, jevUsageRangeQuery } from "../jev-usage"
import { useJevUsage } from "../hooks/useJevUsage"
import { UsageBreakdownTable } from "./UsageBreakdownTable"

const RANGE_SCHEMA = { usageFrom: urlFilterCodecs.string(), usageTo: urlFilterCodecs.string() }

function Metric({ label, value, cost = false }: { label: string; value: number | null; cost?: boolean }) {
    return <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 break-words text-lg font-semibold tabular-nums">
            {value === null ? <span title="Métrica não informada">Não informado</span> : <AnimatedNumber value={value} formatter={cost ? formatJevCost : undefined} duration={0.2} />}
        </p>
    </div>
}

export function JevUsageCard() {
    const reducedMotion = useReducedMotion()
    const defaults = useMemo(() => {
        const period = DATE_PRESET.month.getRange()
        return { usageFrom: period.startDate, usageTo: period.endDate }
    }, [])
    const [range, setRange] = useUrlFilters(defaults, RANGE_SCHEMA)
    const query = useMemo(() => jevUsageRangeQuery(range.usageFrom, range.usageTo), [range.usageFrom, range.usageTo])
    const usage = useJevUsage(query)
    const data = usage.data
    const view = query === null ? "invalid" : usage.isLoading ? "loading" : usage.isError ? "error" : !data?.requests ? "empty" : "data"

    return <Card>
        <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" aria-hidden />Consumo do JEV</CardTitle>
                <Button type="button" variant="outline" size="sm" disabled={usage.isFetching || query === null} onClick={() => void usage.refetch()}>
                    <motion.span className="mr-2 inline-flex" animate={{ rotate: usage.isFetching && !reducedMotion ? 360 : 0 }} transition={usage.isFetching && !reducedMotion ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0 }}><RefreshCw className="h-4 w-4" aria-hidden /></motion.span>Atualizar
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">Logs retidos por 90 dias. Entrada: US$ 0,042 por milhão de tokens; saída gratuita.</p>
        </CardHeader>
        <CardContent className="space-y-4">
            <FilterGroup label="Período">
                <PresetDateRangeFilter startDate={range.usageFrom} endDate={range.usageTo} onChange={(next) => setRange({ usageFrom: next.startDate, usageTo: next.endDate })} />
            </FilterGroup>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }}>
                    {view === "invalid" && <ErrorState title="Período inválido" description="Selecione datas válidas, com início anterior ao fim." onRetry={() => setRange(defaults)} />}
                    {view === "loading" && <div className="space-y-4" role="status" aria-label="Carregando consumo">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
                        <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
                    </div>}
                    {view === "error" && <ErrorState title="Não foi possível carregar o consumo" description={apiErrorMessage(usage.error, "Tente novamente.")} onRetry={() => void usage.refetch()} />}
                    {view === "empty" && <EmptyState icon={BarChart3} title="Nenhum uso do JEV neste período" description="Selecione outro período para consultar o consumo." actionLabel="Último mês" onAction={() => setRange(defaults)} />}
                    {view === "data" && data && <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Metric label="Tokens totais" value={data.totalTokens} />
                            <Metric label="Custo acumulado (USD)" value={data.costUsd} cost />
                            <Metric label="Tokens de entrada conhecidos" value={data.inputTokens} />
                            <Metric label="Tokens de saída conhecidos" value={data.outputTokens} />
                        </div>
                        <UsageBreakdownTable
                            firstColumnLabel="Recurso"
                            rows={data.features.map((row) => ({ key: row.feature, ...row }))}
                            total={{ requests: data.requests, inputTokens: data.inputTokens, outputTokens: data.outputTokens, totalTokens: data.totalTokens, costUsd: data.costUsd }}
                        />
                        <p className="text-xs text-muted-foreground">{data.requests.toLocaleString("pt-BR")} chamada(s) · {data.failedRequests.toLocaleString("pt-BR")} falha(s) na requisição</p>
                        {data.reconstructedRequests > 0 && <p role="note" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">Parte deste consumo foi reconstruída por rateio; valores por período são aproximados. {data.reconstructedRequests.toLocaleString("pt-BR")} registro(s) histórico(s), sem separação entre entrada e saída.</p>}
                        {(data.missingTokenRequests > 0 || data.missingCostRequests > 0) && <p role="note" className="text-xs text-muted-foreground">Totais parciais: {data.missingTokenRequests} registro(s) sem tokens totais e {data.missingCostRequests} sem custo. Métricas desconhecidas não são consideradas zero.</p>}
                    </div>}
                </motion.div>
            </AnimatePresence>
        </CardContent>
    </Card>
}
