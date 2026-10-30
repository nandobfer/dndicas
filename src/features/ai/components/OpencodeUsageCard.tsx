"use client"

import { useMemo } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { BarChart3, RefreshCw } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { DATE_PRESET, PresetDateRangeFilter } from "@/components/ui/opex/preset-date-range-filter"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { FilterGroup } from "@/components/list/FilterGroup"
import { urlFilterCodecs, useUrlFilters } from "@/hooks/useUrlFilters"
import { apiErrorMessage } from "@/lib/api"
import { formatLogTimestamp } from "@/lib/integrations/log-format"
import { opencodeUsageRangeQuery } from "../opencode-usage"
import { useOpencodeUsage } from "../hooks/useOpencodeUsage"
import { UsageBreakdownTable } from "./UsageBreakdownTable"

const RANGE_SCHEMA = { usageFrom: urlFilterCodecs.string(), usageTo: urlFilterCodecs.string() }

/** Painel de consumo do OpenCode: uso medido separado por origem (feature, refinamento, mesa) e total. */
export function OpencodeUsageCard() {
    const reducedMotion = useReducedMotion()
    const defaults = useMemo(() => {
        const period = DATE_PRESET.month.getRange()
        return { usageFrom: period.startDate, usageTo: period.endDate }
    }, [])
    const [range, setRange] = useUrlFilters(defaults, RANGE_SCHEMA)
    const query = useMemo(() => opencodeUsageRangeQuery(range.usageFrom, range.usageTo), [range.usageFrom, range.usageTo])
    const usage = useOpencodeUsage(query)
    const data = usage.data
    const view = query === null ? "invalid" : usage.isLoading ? "loading" : usage.isError ? "error" : !data?.origins.length ? "empty" : "data"

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" aria-hidden />Consumo do OpenCode</CardTitle>
                    <Button type="button" variant="outline" size="sm" disabled={usage.isFetching || query === null} onClick={() => void usage.refetch()}>
                        <motion.span className="mr-2 inline-flex" animate={{ rotate: usage.isFetching && !reducedMotion ? 360 : 0 }} transition={usage.isFetching && !reducedMotion ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0 }}><RefreshCw className="h-4 w-4" aria-hidden /></motion.span>Atualizar
                    </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                    Uso originado pelo Opex, separado por origem (features de IA, refinamentos e mesas de desenvolvimento). A medição começou com este painel: o consumo anterior não é somado.
                </p>
            </CardHeader>
            <CardContent className="space-y-4 p-6 pt-0">
                <FilterGroup label="Período">
                    <PresetDateRangeFilter startDate={range.usageFrom} endDate={range.usageTo} onChange={(next) => setRange({ usageFrom: next.startDate, usageTo: next.endDate })} />
                </FilterGroup>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }}>
                        {view === "invalid" && <ErrorState title="Período inválido" description="Selecione datas válidas, com início anterior ao fim." onRetry={() => setRange(defaults)} />}
                        {view === "loading" && <div className="space-y-2" role="status" aria-label="Carregando consumo"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
                        {view === "error" && <ErrorState title="Não foi possível carregar o consumo" description={apiErrorMessage(usage.error, "Tente novamente.")} onRetry={() => void usage.refetch()} />}
                        {view === "empty" && <EmptyState icon={BarChart3} title="Nenhum uso do OpenCode neste período" description="Selecione outro período para consultar o consumo." actionLabel="Último mês" onAction={() => setRange(defaults)} />}
                        {view === "data" && data && (
                            <div className="space-y-3">
                                <UsageBreakdownTable
                                    firstColumnLabel="Origem"
                                    rows={data.origins.map((row) => ({ key: row.origin, ...row }))}
                                    total={data.total}
                                />
                                {data.coverageFrom && <p className="text-xs text-muted-foreground">Medição iniciada em {formatLogTimestamp(data.coverageFrom).slice(0, 16)}.</p>}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
