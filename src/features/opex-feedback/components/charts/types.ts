import type { ComponentProps } from "react"
import type { ChartTooltipContent } from "@/components/ui/chart"

/** Linha genérica dos gráficos (qualquer objeto com as chaves usadas pelo gráfico). */
export type ChartRow = object

/** Rodapé de contexto do tooltip (%, origem, o que fazer). */
export type TooltipFooter = NonNullable<ComponentProps<typeof ChartTooltipContent>["footer"]>

export interface ChartSeries {
    key: string
    label: string
    color: string
}

export interface ChartTableSpec {
    columns: readonly { key: string; label: string }[]
    rows: readonly object[]
}
