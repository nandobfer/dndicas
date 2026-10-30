"use client"

import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ChartDataTable } from "./ChartDataTable"
import { useChartAnimation } from "./use-chart-animation"
import type { ChartRow, ChartSeries, ChartTableSpec, TooltipFooter } from "./types"

/** Linhas de tendência sobre os buckets, com legenda, tooltip padronizado, tabela oculta e animação. */
export function TrendLineChart({
    data,
    xKey,
    series,
    config,
    ariaLabel,
    table,
    height = 240,
    valueFormatter,
    xTickFormatter,
    footer,
    showLegend = true,
}: {
    data: readonly ChartRow[]
    xKey: string
    series: readonly ChartSeries[]
    config: ChartConfig
    ariaLabel: string
    table: ChartTableSpec
    height?: number
    valueFormatter?: (value: number) => string
    xTickFormatter?: (value: string) => string
    footer?: TooltipFooter
    showLegend?: boolean
}) {
    const animate = useChartAnimation()
    return (
        <div className="relative">
            <ChartContainer config={config} role="img" aria-label={ariaLabel} className="aspect-auto w-full" style={{ height }}>
                <RechartsLineChart data={[...data] as Record<string, unknown>[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={xTickFormatter} />
                    <YAxis width={40} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip
                        content={<ChartTooltipContent valueFormatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : String(value))} footer={footer} />}
                    />
                    {showLegend && <ChartLegend content={<ChartLegendContent />} />}
                    {series.map((item) => (
                        <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2} dot={false} isAnimationActive={animate} />
                    ))}
                </RechartsLineChart>
            </ChartContainer>
            <ChartDataTable label={ariaLabel} columns={table.columns} rows={table.rows} />
        </div>
    )
}
