"use client"

import { Bar, BarChart as RechartsBarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ChartDataTable } from "./ChartDataTable"
import { useChartAnimation } from "./use-chart-animation"
import type { ChartRow, ChartSeries, ChartTableSpec, TooltipFooter } from "./types"

/** Barras verticais (uma ou mais séries) com tooltip padronizado, tabela oculta e animação do recharts. */
export function BarsChart({
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
}) {
    const animate = useChartAnimation()
    return (
        <div className="relative">
            <ChartContainer config={config} role="img" aria-label={ariaLabel} className="aspect-auto w-full" style={{ height }}>
                <RechartsBarChart data={[...data] as Record<string, unknown>[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={xTickFormatter} />
                    <YAxis width={40} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent valueFormatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : String(value))} footer={footer} />}
                    />
                    {series.map((item) => (
                        <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[4, 4, 0, 0]} isAnimationActive={animate} />
                    ))}
                </RechartsBarChart>
            </ChartContainer>
            <ChartDataTable label={ariaLabel} columns={table.columns} rows={table.rows} />
        </div>
    )
}
