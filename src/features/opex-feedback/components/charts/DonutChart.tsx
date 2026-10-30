"use client"

import { Cell, Pie, PieChart as RechartsPieChart } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ChartDataTable } from "./ChartDataTable"
import { useChartAnimation } from "./use-chart-animation"
import type { ChartRow, ChartTableSpec, TooltipFooter } from "./types"

/**
 * Rosca (donut) com legenda e tooltip padronizados. Cada linha precisa de `fill` (cor da fatia) e o
 * rótulo em `nameKey`. O número central fica atrás do tooltip (`z-0`).
 */
export function DonutChart({
    data,
    nameKey,
    valueKey,
    config,
    ariaLabel,
    table,
    height = 240,
    valueFormatter,
    footer,
    centerLabel,
    centerValue,
}: {
    data: readonly ChartRow[]
    nameKey: string
    valueKey: string
    config: ChartConfig
    ariaLabel: string
    table: ChartTableSpec
    height?: number
    valueFormatter?: (value: number) => string
    footer?: TooltipFooter
    centerLabel?: string
    centerValue?: string
}) {
    const animate = useChartAnimation()
    return (
        <div className="relative">
            <ChartContainer config={config} role="img" aria-label={ariaLabel} className="relative aspect-auto w-full" style={{ height }}>
                <RechartsPieChart>
                    <ChartTooltip
                        content={<ChartTooltipContent nameKey={nameKey} valueFormatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : String(value))} footer={footer} />}
                    />
                    <Pie data={[...data] as Record<string, unknown>[]} dataKey={valueKey} nameKey={nameKey} innerRadius="58%" outerRadius="82%" paddingAngle={2} strokeWidth={0} isAnimationActive={animate}>
                        {data.map((row, index) => (
                            <Cell key={index} fill={String((row as Record<string, unknown>).fill ?? "var(--chart-1)")} />
                        ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey={nameKey} />} />
                </RechartsPieChart>
            </ChartContainer>
            {centerValue !== undefined && (
                <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center pb-12">
                    <span className="font-mono text-lg font-bold text-foreground">{centerValue}</span>
                    {centerLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{centerLabel}</span>}
                </div>
            )}
            <ChartDataTable label={ariaLabel} columns={table.columns} rows={table.rows} />
        </div>
    )
}
